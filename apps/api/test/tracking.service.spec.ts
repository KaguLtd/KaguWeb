import { ForbiddenException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { TrackingService } from "../src/tracking/tracking.service";

describe("TrackingService", () => {
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
  });

  function createPrismaMock() {
    return {
      workSession: {
        findMany: jest.fn()
      },
      locationPing: {
        findMany: jest.fn()
      },
      project: {
        findMany: jest.fn()
      }
    };
  }

  it("rejects overview access for non-manager actors", async () => {
    const prisma = createPrismaMock();
    const service = new TrackingService(prisma as never);

    await expect(service.getOverview(fieldActor as never, {})).rejects.toBeInstanceOf(
      ForbiddenException
    );

    expect(prisma.workSession.findMany).not.toHaveBeenCalled();
  });

  it("builds filtered overview queries and maps sessions, pings, and project points", async () => {
    const prisma = createPrismaMock();
    const service = new TrackingService(prisma as never);
    const selectedDate = "2026-04-09";
    const rangeStart = new Date("2026-04-09T00:00:00.000Z");
    const rangeEnd = new Date("2026-04-10T00:00:00.000Z");
    const userCreatedAt = new Date("2026-01-15T00:00:00.000Z");
    const projectCreatedAt = new Date("2026-02-01T08:00:00.000Z");
    const projectUpdatedAt = new Date("2026-04-01T08:00:00.000Z");
    const sessionStartedAt = new Date("2026-04-09T07:30:00.000Z");
    const pingCapturedAt = new Date("2026-04-09T09:10:00.000Z");

    prisma.workSession.findMany.mockResolvedValue([
      {
        assignmentId: "assignment-1",
        startedAt: sessionStartedAt,
        user: {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Personeli",
          role: Role.FIELD,
          isActive: true,
          createdAt: userCreatedAt
        },
        assignment: {
          dailyProgramProject: {
            project: {
              id: "project-1",
              code: "PRJ-001",
              name: "Merkez Santiye",
              description: "Ana saha",
              locationLabel: "Ankara",
              latitude: 39.92,
              longitude: 32.85,
              isArchived: false,
              storageRoot: "projects/merkez-santiye",
              createdAt: projectCreatedAt,
              updatedAt: projectUpdatedAt,
              customer: {
                id: "customer-1",
                name: "Merkez Holding",
                note: "Oncelikli musteri",
                isArchived: false
              },
              files: [{ id: "main-file-1" }],
              programProjects: [{ id: "program-project-1" }],
              _count: {
                entries: 4
              }
            }
          }
        }
      }
    ]);
    prisma.locationPing.findMany.mockResolvedValue([
      {
        id: "ping-1",
        latitude: 39.93,
        longitude: 32.86,
        accuracy: 12,
        capturedAt: pingCapturedAt,
        actor: {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Personeli",
          role: Role.FIELD
        },
        projectId: "project-1",
        source: "GPS"
      }
    ]);
    prisma.project.findMany.mockResolvedValue([
      {
        id: "project-1",
        name: "Merkez Santiye",
        locationLabel: "Ankara",
        latitude: 39.92,
        longitude: 32.85
      }
    ]);

    const result = await service.getOverview(managerActor as never, {
      date: selectedDate,
      projectId: "project-1",
      userId: "field-1"
    });

    expect(prisma.workSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          endedAt: null,
          startedAt: { lt: rangeEnd },
          assignment: {
            userId: "field-1",
            dailyProgramProject: {
              projectId: "project-1"
            }
          }
        },
        orderBy: { startedAt: "asc" }
      })
    );
    expect(prisma.locationPing.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        actorId: "field-1",
        capturedAt: {
          gte: rangeStart,
          lt: rangeEnd
        }
      },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true
          }
        }
      },
      orderBy: { capturedAt: "desc" },
      take: 120
    });
    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: {
        id: "project-1",
        latitude: { not: null },
        longitude: { not: null },
        programProjects: {
          some: {
            dailyProgram: { date: rangeStart }
          }
        }
      },
      select: {
        id: true,
        name: true,
        locationLabel: true,
        latitude: true,
        longitude: true
      },
      orderBy: { name: "asc" }
    });
    expect(result).toEqual({
      selectedDate,
      activeSessions: [
        {
          assignmentId: "assignment-1",
          user: {
            id: "field-1",
            username: "saha-1",
            displayName: "Saha Personeli",
            role: Role.FIELD,
            isActive: true,
            createdAt: userCreatedAt.toISOString(),
            assignmentCount: undefined,
            openSessionCount: 1,
            subscriptionCount: undefined
          },
          project: {
            id: "project-1",
            code: "PRJ-001",
            name: "Merkez Santiye",
            description: "Ana saha",
            locationLabel: "Ankara",
            latitude: 39.92,
            longitude: 32.85,
            isArchived: false,
            storageRoot: "projects/merkez-santiye",
            createdAt: projectCreatedAt.toISOString(),
            updatedAt: projectUpdatedAt.toISOString(),
            customer: {
              id: "customer-1",
              name: "Merkez Holding",
              note: "Oncelikli musteri",
              isArchived: false
            },
            mainFileCount: 1,
            programUsageCount: 1,
            timelineEntryCount: 4
          },
          startedAt: sessionStartedAt.toISOString()
        }
      ],
      recentLocations: [
        {
          id: "ping-1",
          latitude: 39.93,
          longitude: 32.86,
          accuracy: 12,
          capturedAt: pingCapturedAt.toISOString(),
          actor: {
            id: "field-1",
            username: "saha-1",
            displayName: "Saha Personeli",
            role: Role.FIELD
          },
          projectId: "project-1",
          source: "GPS"
        }
      ],
      projectLocations: [
        {
          projectId: "project-1",
          projectName: "Merkez Santiye",
          locationLabel: "Ankara",
          latitude: 39.92,
          longitude: 32.85
        }
      ]
    });
  });

  it("returns filtered location history in ascending capture order", async () => {
    const prisma = createPrismaMock();
    const service = new TrackingService(prisma as never);
    const firstPingAt = new Date("2026-04-09T06:00:00.000Z");
    const secondPingAt = new Date("2026-04-09T06:05:00.000Z");

    prisma.locationPing.findMany.mockResolvedValue([
      {
        id: "ping-1",
        latitude: 39.9,
        longitude: 32.8,
        accuracy: 20,
        capturedAt: firstPingAt,
        actor: {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Personeli",
          role: Role.FIELD
        },
        projectId: "project-1",
        source: "GPS"
      },
      {
        id: "ping-2",
        latitude: 39.91,
        longitude: 32.81,
        accuracy: null,
        capturedAt: secondPingAt,
        actor: {
          id: "field-2",
          username: "saha-2",
          displayName: "Ikinci Saha",
          role: Role.FIELD
        },
        projectId: "project-1",
        source: "MANUAL"
      }
    ]);

    const result = await service.getHistory(managerActor as never, {
      projectId: "project-1",
      userId: "field-1"
    });

    expect(prisma.locationPing.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        actorId: "field-1",
        capturedAt: undefined
      },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true
          }
        }
      },
      orderBy: { capturedAt: "asc" },
      take: 500
    });
    expect(result).toEqual([
      {
        id: "ping-1",
        latitude: 39.9,
        longitude: 32.8,
        accuracy: 20,
        capturedAt: firstPingAt.toISOString(),
        actor: {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Personeli",
          role: Role.FIELD
        },
        projectId: "project-1",
        source: "GPS"
      },
      {
        id: "ping-2",
        latitude: 39.91,
        longitude: 32.81,
        accuracy: null,
        capturedAt: secondPingAt.toISOString(),
        actor: {
          id: "field-2",
          username: "saha-2",
          displayName: "Ikinci Saha",
          role: Role.FIELD
        },
        projectId: "project-1",
        source: "MANUAL"
      }
    ]);
  });

  it("returns geocoded project locations filtered by scheduled day", async () => {
    const prisma = createPrismaMock();
    const service = new TrackingService(prisma as never);
    const selectedDate = "2026-04-09";

    prisma.project.findMany.mockResolvedValue([
      {
        id: "project-1",
        name: "Merkez Santiye",
        locationLabel: "Ankara",
        latitude: 39.92,
        longitude: 32.85
      },
      {
        id: "project-2",
        name: "Kuzey Depo",
        locationLabel: null,
        latitude: 40.0,
        longitude: 33.0
      }
    ]);

    const result = await service.getProjectLocations(managerActor as never, selectedDate);

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        programProjects: {
          some: {
            dailyProgram: { date: new Date("2026-04-09T00:00:00.000Z") }
          }
        }
      },
      select: {
        id: true,
        name: true,
        locationLabel: true,
        latitude: true,
        longitude: true
      },
      orderBy: { name: "asc" }
    });
    expect(result).toEqual([
      {
        projectId: "project-1",
        projectName: "Merkez Santiye",
        locationLabel: "Ankara",
        latitude: 39.92,
        longitude: 32.85
      },
      {
        projectId: "project-2",
        projectName: "Kuzey Depo",
        locationLabel: null,
        latitude: 40,
        longitude: 33
      }
    ]);
  });
});
