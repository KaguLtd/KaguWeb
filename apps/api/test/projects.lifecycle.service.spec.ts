import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { ProjectsService } from "../src/projects/projects.service";

describe("ProjectsService lifecycle", () => {
  const managerActor = {
    sub: "manager-1",
    username: "yonetici",
    displayName: "Ana Yonetici",
    role: Role.MANAGER
  };

  const fieldActor = {
    sub: "field-1",
    username: "saha-1",
    displayName: "Saha Personeli",
    role: Role.FIELD
  };

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  function createPrismaMock() {
    return {
      customer: {
        findUnique: jest.fn()
      },
      project: {
        create: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn()
      },
      projectAssignment: {
        findFirst: jest.fn()
      }
    };
  }

  function createStorageServiceMock() {
    return {
      resolveUniqueProjectStorageRoot: jest
        .fn()
        .mockResolvedValue("projects/test-proje__merkez-holding__2026-04-09"),
      ensureProjectScaffold: jest.fn().mockResolvedValue(undefined),
      appendProjectEvent: jest.fn().mockResolvedValue(undefined),
      writeProjectMetadata: jest.fn().mockResolvedValue(undefined)
    };
  }

  function createStorageDriverMock() {
    return {
      ensureDirectory: jest.fn().mockResolvedValue(undefined),
      createReadStream: jest.fn(),
      removeTree: jest.fn().mockResolvedValue(undefined),
      removeFiles: jest.fn().mockResolvedValue(undefined),
      removeEmptyDirectories: jest.fn().mockResolvedValue(undefined),
      writeBuffer: jest.fn()
    };
  }

  function createStoragePathServiceMock() {
    return {
      projectMainRoot: jest.fn((storageRoot: string) => `${storageRoot}/main`),
      projectTimelineRoot: jest.fn((storageRoot: string) => `${storageRoot}/timeline`),
      projectMainUploadDirectory: jest.fn(),
      projectTimelineUploadDirectory: jest.fn(),
      relativeDirectory: jest.fn()
    };
  }

  function buildProjectRecord(overrides: Partial<Record<string, unknown>> = {}) {
    const createdAt = new Date("2026-04-09T08:00:00.000Z");
    const updatedAt = new Date("2026-04-09T08:30:00.000Z");

    return {
      id: "project-1",
      code: "PRJ-001",
      name: "Merkez Santiye",
      description: "Ana saha",
      locationLabel: "Ankara",
      latitude: 39.92,
      longitude: 32.85,
      isArchived: false,
      storageRoot: "projects/test-proje__merkez-holding__2026-04-09",
      createdAt,
      updatedAt,
      customer: {
        id: "customer-1",
        name: "Merkez Holding",
        note: "Oncelikli musteri",
        isArchived: false
      },
      files: [],
      programProjects: [],
      _count: {
        entries: 0
      },
      ...overrides
    };
  }

  it("creates a project, prepares storage, and records the creation event", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-09T09:00:00.000Z"));

    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const storageDriver = createStorageDriverMock();
    const storagePaths = createStoragePathServiceMock();
    const service = new ProjectsService(
      prisma as never,
      storageService as never,
      storageDriver as never,
      storagePaths as never
    );

    prisma.customer.findUnique.mockResolvedValue({
      id: "customer-1",
      name: "Merkez Holding",
      note: "Oncelikli musteri",
      isArchived: false
    });
    prisma.project.findMany.mockResolvedValue([
      { code: "Merkez_Holding_09_04_2026_00 0001" },
      { code: "Baska_Cari_09_04_2026_00 0007" },
      { code: "Merkez_Holding_10_04_2026_00 0001" }
    ]);
    prisma.project.create.mockResolvedValue(
      buildProjectRecord({
        name: "Yeni Proje",
        code: "Merkez_Holding_09_04_2026_00 0002",
        description: "Ilk kurulum",
        locationLabel: "Istanbul"
      })
    );

    const result = await service.create(
      {
        customerId: "customer-1",
        name: "  Yeni Proje  ",
        description: " Ilk kurulum ",
        locationLabel: " Istanbul ",
        latitude: 41.01,
        longitude: 28.97
      },
      managerActor as never
    );

    expect(storageService.resolveUniqueProjectStorageRoot).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        name: "Yeni Proje",
        createdAt: expect.any(Date)
      }),
      expect.objectContaining({
        id: "customer-1",
        name: "Merkez Holding"
      })
    );
    expect(storageDriver.ensureDirectory).toHaveBeenNthCalledWith(
      1,
      "projects/test-proje__merkez-holding__2026-04-09/main"
    );
    expect(storageDriver.ensureDirectory).toHaveBeenNthCalledWith(
      2,
      "projects/test-proje__merkez-holding__2026-04-09/timeline"
    );
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: "customer-1",
        name: "Yeni Proje",
        code: "Merkez_Holding_09_04_2026_00 0002",
        description: "Ilk kurulum",
        locationLabel: "Istanbul",
        latitude: 41.01,
        longitude: 28.97,
        storageRoot: "projects/test-proje__merkez-holding__2026-04-09",
        createdById: "manager-1",
        createdAt: expect.any(Date)
      }),
      include: expect.any(Object)
    });
    expect(storageService.ensureProjectScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "project-1",
        name: "Yeni Proje"
      })
    );
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith({
      project: expect.objectContaining({
        id: "project-1",
        name: "Yeni Proje"
      }),
      actor: managerActor,
      eventType: "PROJECT_CREATED",
      payload: {
        name: "Yeni Proje",
        customerName: "Merkez Holding"
      },
      timestamp: new Date("2026-04-09T08:00:00.000Z")
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "project-1",
        name: "Yeni Proje",
        code: "Merkez_Holding_09_04_2026_00 0002",
        isArchived: false,
        customer: expect.objectContaining({
          id: "customer-1",
          name: "Merkez Holding"
        })
      })
    );
  });

  it("updates and archives a project while rewriting metadata and audit state", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const storageDriver = createStorageDriverMock();
    const storagePaths = createStoragePathServiceMock();
    const service = new ProjectsService(
      prisma as never,
      storageService as never,
      storageDriver as never,
      storagePaths as never
    );

    prisma.project.findUnique.mockResolvedValue({
      id: "project-1",
      name: "Merkez Santiye"
    });
    prisma.project.update.mockResolvedValue(
      buildProjectRecord({
        name: "Arsiv Proje",
        code: null,
        description: null,
        locationLabel: "Izmir",
        latitude: 38.42,
        longitude: 27.14,
        isArchived: true,
        customer: null
      })
    );

    const result = await service.update(
      "project-1",
      {
        customerId: null,
        name: "  Arsiv Proje ",
        code: "DENENECEK-AMA-YOK-SAYILMALI",
        description: null,
        locationLabel: " Izmir ",
        latitude: 38.42,
        longitude: 27.14,
        isArchived: true
      } as any,
      managerActor as never
    );

    expect(prisma.project.update).toHaveBeenCalledWith({
      where: { id: "project-1" },
      data: {
        customerId: null,
        name: "Arsiv Proje",
        description: null,
        locationLabel: "Izmir",
        latitude: 38.42,
        longitude: 27.14,
        isArchived: true
      },
      include: expect.any(Object)
    });
    expect(storageService.writeProjectMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "project-1",
        isArchived: true
      })
    );
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith({
      project: expect.objectContaining({
        id: "project-1",
        isArchived: true
      }),
      actor: managerActor,
      eventType: "PROJECT_UPDATED",
      payload: {
        name: "Arsiv Proje",
        customerName: null,
        isArchived: true
      }
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: "project-1",
        name: "Arsiv Proje",
        isArchived: true,
        customer: null
      })
    );
  });

  it("rejects deleting projects that already have operational history", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const storageDriver = createStorageDriverMock();
    const storagePaths = createStoragePathServiceMock();
    const service = new ProjectsService(
      prisma as never,
      storageService as never,
      storageDriver as never,
      storagePaths as never
    );

    prisma.project.findUnique.mockResolvedValue({
      id: "project-1",
      storageRoot: "projects/test-proje__merkez-holding__2026-04-09",
      _count: {
        programProjects: 1,
        files: 0,
        entries: 0,
        locationPings: 0
      }
    });

    await expect(service.remove("project-1", managerActor as never)).rejects.toBeInstanceOf(
      BadRequestException
    );

    expect(prisma.project.delete).not.toHaveBeenCalled();
    expect(storageDriver.removeTree).not.toHaveBeenCalled();
  });

  it("deletes projects without history and cleans their storage tree", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const storageDriver = createStorageDriverMock();
    const storagePaths = createStoragePathServiceMock();
    const service = new ProjectsService(
      prisma as never,
      storageService as never,
      storageDriver as never,
      storagePaths as never
    );

    prisma.project.findUnique.mockResolvedValue({
      id: "project-2",
      storageRoot: "projects/silinecek-proje__carisiz__2026-04-09",
      _count: {
        programProjects: 0,
        files: 0,
        entries: 0,
        locationPings: 0
      }
    });
    prisma.project.delete.mockResolvedValue(undefined);

    const result = await service.remove("project-2", managerActor as never);

    expect(prisma.project.delete).toHaveBeenCalledWith({
      where: { id: "project-2" }
    });
    expect(storageDriver.removeTree).toHaveBeenCalledWith(
      "projects/silinecek-proje__carisiz__2026-04-09"
    );
    expect(result).toEqual({ success: true });
  });

  it("restricts lifecycle mutations to manager actors", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const storageDriver = createStorageDriverMock();
    const storagePaths = createStoragePathServiceMock();
    const service = new ProjectsService(
      prisma as never,
      storageService as never,
      storageDriver as never,
      storagePaths as never
    );

    await expect(
      service.create(
        {
          name: "Yetkisiz Proje"
        },
        fieldActor as never
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.project.create).not.toHaveBeenCalled();
  });
});
