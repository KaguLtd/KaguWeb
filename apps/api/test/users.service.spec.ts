import { BadRequestException } from "@nestjs/common";
import { Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { UsersService } from "../src/users/users.service";

jest.mock("bcryptjs", () => ({
  hash: jest.fn()
}));

describe("UsersService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function createPrismaMock() {
    return {
      user: {
        create: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn()
      },
      authSession: {
        updateMany: jest.fn()
      }
    };
  }

  function managerSummary(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "user-1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: Role.MANAGER,
      isActive: true,
      createdAt: new Date("2026-04-09T08:00:00.000Z"),
      assignments: [],
      workSessions: [],
      notificationSubscriptions: [],
      ...overrides
    };
  }

  it("creates a user with trimmed identity fields and a hashed password", async () => {
    const prisma = createPrismaMock();
    const service = new UsersService(prisma as never);

    prisma.user.findFirst.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
    prisma.user.create.mockResolvedValue(
      managerSummary({
        username: "saha-1",
        displayName: "Saha Personeli",
        role: Role.FIELD
      })
    );

    const result = await service.create({
      username: "  saha-1  ",
      displayName: "  Saha Personeli ",
      password: "Secret123",
      role: Role.FIELD
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        username: { equals: "saha-1", mode: "insensitive" },
        id: undefined
      }
    });
    expect(bcrypt.hash).toHaveBeenCalledWith("Secret123", 10);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        username: "saha-1",
        displayName: "Saha Personeli",
        passwordHash: "hashed-password",
        role: Role.FIELD
      },
      include: expect.any(Object)
    });
    expect(result).toEqual({
      id: "user-1",
      username: "saha-1",
      displayName: "Saha Personeli",
      role: Role.FIELD,
      isActive: true,
      createdAt: "2026-04-09T08:00:00.000Z",
      assignmentCount: 0,
      openSessionCount: 0,
      subscriptionCount: 0
    });
  });

  it("prevents demoting the last active manager", async () => {
    const prisma = createPrismaMock();
    const service = new UsersService(prisma as never);

    prisma.user.findUnique.mockResolvedValue({
      id: "manager-1",
      username: "yonetici",
      role: Role.MANAGER
    });
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.update("manager-1", {
        role: Role.FIELD
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
  });

  it("revokes active sessions when a manager is demoted", async () => {
    const prisma = createPrismaMock();
    const service = new UsersService(prisma as never);

    prisma.user.findUnique.mockResolvedValue({
      id: "manager-1",
      username: "yonetici",
      role: Role.MANAGER
    });
    prisma.user.count.mockResolvedValue(2);
    prisma.user.update.mockResolvedValue(
      managerSummary({
        id: "manager-1",
        username: "saha-1",
        displayName: "Saha Personeli",
        role: Role.FIELD
      })
    );
    prisma.authSession.updateMany.mockResolvedValue({ count: 3 });

    const result = await service.update("manager-1", {
      username: "  saha-1 ",
      displayName: " Saha Personeli ",
      role: Role.FIELD
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        username: { equals: "saha-1", mode: "insensitive" },
        id: { not: "manager-1" }
      }
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "manager-1" },
      data: {
        username: "saha-1",
        displayName: "Saha Personeli",
        role: Role.FIELD,
        isActive: undefined,
        passwordHash: undefined
      },
      include: expect.any(Object)
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "manager-1",
        revokedAt: null
      },
      data: {
        revokedAt: expect.any(Date)
      }
    });
    expect(result.role).toBe(Role.FIELD);
  });

  it("deactivates users with history instead of deleting them and revokes sessions", async () => {
    const prisma = createPrismaMock();
    const service = new UsersService(prisma as never);

    prisma.user.findUnique.mockResolvedValue({
      id: "field-1",
      role: Role.FIELD,
      _count: {
        assignments: 1,
        workSessions: 0,
        locationPings: 2,
        notificationSubscriptions: 0,
        sentNotificationCampaigns: 0,
        receivedNotificationDeliveries: 0,
        createdProjects: 0,
        createdPrograms: 0
      }
    });
    prisma.user.update.mockResolvedValue(
      managerSummary({
        id: "field-1",
        username: "saha-1",
        displayName: "Saha Personeli",
        role: Role.FIELD,
        isActive: false
      })
    );
    prisma.authSession.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.remove("field-1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "field-1" },
      data: { isActive: false },
      include: expect.any(Object)
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "field-1",
        revokedAt: null
      },
      data: {
        revokedAt: expect.any(Date)
      }
    });
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(result).toEqual({
      mode: "deactivated",
      user: {
        id: "field-1",
        username: "saha-1",
        displayName: "Saha Personeli",
        role: Role.FIELD,
        isActive: false,
        createdAt: "2026-04-09T08:00:00.000Z",
        assignmentCount: 0,
        openSessionCount: 0,
        subscriptionCount: 0
      }
    });
  });

  it("deletes users without history", async () => {
    const prisma = createPrismaMock();
    const service = new UsersService(prisma as never);

    prisma.user.findUnique.mockResolvedValue({
      id: "field-2",
      role: Role.FIELD,
      _count: {
        assignments: 0,
        workSessions: 0,
        locationPings: 0,
        notificationSubscriptions: 0,
        sentNotificationCampaigns: 0,
        receivedNotificationDeliveries: 0,
        createdProjects: 0,
        createdPrograms: 0
      }
    });
    prisma.user.delete.mockResolvedValue(undefined);

    const result = await service.remove("field-2");

    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: "field-2" }
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ mode: "deleted" });
  });

  it("applies role, status, and text filters when listing users", async () => {
    const prisma = createPrismaMock();
    const service = new UsersService(prisma as never);

    prisma.user.findMany.mockResolvedValue([
      managerSummary(),
      managerSummary({
        id: "field-1",
        username: "saha-1",
        displayName: "Saha Personeli",
        role: Role.FIELD,
        isActive: false
      })
    ]);

    const result = await service.findAll({
      role: Role.FIELD,
      status: "inactive",
      query: " saha "
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        role: Role.FIELD,
        isActive: false,
        OR: [
          { username: { contains: "saha", mode: "insensitive" } },
          { displayName: { contains: "saha", mode: "insensitive" } }
        ]
      },
      include: expect.any(Object),
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }]
    });
    expect(result).toHaveLength(2);
  });
});
