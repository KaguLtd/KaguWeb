import { ForbiddenException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { RoutingService } from "../src/routing/routing.service";

describe("RoutingService", () => {
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
      dailyProgram: {
        findUnique: jest.fn()
      }
    };
  }

  it("rejects route recommendations for non-manager actors", async () => {
    const prisma = createPrismaMock();
    const service = new RoutingService(prisma as never);

    await expect(service.getRecommendations(fieldActor as never, {})).rejects.toBeInstanceOf(
      ForbiddenException
    );

    expect(prisma.dailyProgram.findUnique).not.toHaveBeenCalled();
  });

  it("returns a nearest-neighbor recommendation using the selected user's latest location", async () => {
    const prisma = createPrismaMock();
    const service = new RoutingService(prisma as never);

    prisma.dailyProgram.findUnique.mockResolvedValue({
      id: "program-1",
      programProjects: [
        {
          id: "program-project-1",
          sortOrder: 2,
          createdAt: new Date("2026-04-10T07:00:00.000Z"),
          project: {
            id: "project-1",
            name: "Merkez Santiye",
            locationLabel: "Ankara",
            latitude: 39.93,
            longitude: 32.85
          },
          assignments: [
            {
              user: {
                id: "field-1",
                displayName: "Saha Bir"
              },
              workSessions: [{ id: "session-1" }],
              locationPings: [
                {
                  capturedAt: new Date("2026-04-10T08:30:00.000Z"),
                  latitude: 39.925,
                  longitude: 32.84
                }
              ]
            }
          ]
        },
        {
          id: "program-project-2",
          sortOrder: 1,
          createdAt: new Date("2026-04-10T06:00:00.000Z"),
          project: {
            id: "project-2",
            name: "Kuzey Depo",
            locationLabel: "Kazan",
            latitude: 40.1,
            longitude: 32.9
          },
          assignments: [
            {
              user: {
                id: "field-2",
                displayName: "Saha Iki"
              },
              workSessions: [],
              locationPings: []
            }
          ]
        },
        {
          id: "program-project-3",
          sortOrder: 3,
          createdAt: new Date("2026-04-10T08:00:00.000Z"),
          project: {
            id: "project-3",
            name: "Guney Ofis",
            locationLabel: "Golbasi",
            latitude: 39.7,
            longitude: 32.82
          },
          assignments: []
        },
        {
          id: "program-project-4",
          sortOrder: 4,
          createdAt: new Date("2026-04-10T09:00:00.000Z"),
          project: {
            id: "project-4",
            name: "Koordinatsiz Nokta",
            locationLabel: null,
            latitude: null,
            longitude: null
          },
          assignments: []
        }
      ]
    });

    const result = await service.getRecommendations(managerActor as never, {
      date: "2026-04-10",
      userId: "field-1"
    });

    expect(prisma.dailyProgram.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { date: new Date("2026-04-10T00:00:00.000Z") }
      })
    );
    expect(result.selectedDate).toBe("2026-04-10");
    expect(result.anchor).toEqual({
      strategy: "latest-user-location",
      userId: "field-1",
      projectId: "project-1",
      latitude: 39.925,
      longitude: 32.84
    });
    expect(result.routeMode).toBe("nearest-neighbor");
    expect(result.stops.map((stop) => stop.projectId)).toEqual([
      "project-1",
      "project-2",
      "project-3"
    ]);
    expect(result.stops[0]).toEqual({
      recommendationRank: 1,
      projectId: "project-1",
      projectName: "Merkez Santiye",
      locationLabel: "Ankara",
      latitude: 39.93,
      longitude: 32.85,
      assignmentCount: 1,
      activeSessionCount: 1,
      assignedUsers: [
        {
          userId: "field-1",
          displayName: "Saha Bir",
          hasActiveSession: true,
          lastLocationAt: "2026-04-10T08:30:00.000Z"
        }
      ],
      currentSortOrder: 2,
      distanceFromPreviousKm: null
    });
    expect(result.stops[1].distanceFromPreviousKm).not.toBeNull();
    expect(result.skippedProjects).toEqual([
      {
        projectId: "project-4",
        projectName: "Koordinatsiz Nokta",
        reason: "missing-coordinates"
      }
    ]);
  });

  it("falls back to ordered geocoded projects when no anchor can be resolved", async () => {
    const prisma = createPrismaMock();
    const service = new RoutingService(prisma as never);

    prisma.dailyProgram.findUnique.mockResolvedValue({
      id: "program-1",
      programProjects: [
        {
          id: "program-project-1",
          sortOrder: 1,
          createdAt: new Date("2026-04-10T06:00:00.000Z"),
          project: {
            id: "project-1",
            name: "Birinci",
            locationLabel: "A",
            latitude: 39.9,
            longitude: 32.8
          },
          assignments: []
        },
        {
          id: "program-project-2",
          sortOrder: 2,
          createdAt: new Date("2026-04-10T07:00:00.000Z"),
          project: {
            id: "project-2",
            name: "Ikinci",
            locationLabel: "B",
            latitude: 40.0,
            longitude: 32.9
          },
          assignments: []
        }
      ]
    });

    const result = await service.getRecommendations(managerActor as never, {
      date: "2026-04-10",
      userId: "missing-user"
    });

    expect(result.anchor).toBeNull();
    expect(result.routeMode).toBe("program-order-fallback");
    expect(result.stops.map((stop) => stop.projectId)).toEqual(["project-1", "project-2"]);
    expect(result.stops.every((stop) => stop.distanceFromPreviousKm === null)).toBe(true);
  });
});
