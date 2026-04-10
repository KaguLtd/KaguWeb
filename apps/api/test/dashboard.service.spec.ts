import { DashboardService } from "../src/dashboard/dashboard.service";
import { NotificationCampaignType, NotificationDeliveryStatus } from "@prisma/client";

describe("DashboardService", () => {
  const routingService = {
    getRecommendations: jest.fn()
  };

  const prisma = {
    dailyProgram: {
      findUnique: jest.fn()
    },
    projectEntry: {
      findMany: jest.fn()
    },
    workSession: {
      findMany: jest.fn()
    },
    notificationCampaign: {
      findMany: jest.fn()
    },
    fieldFormResponse: {
      findMany: jest.fn()
    }
  };

  const actor = {
    sub: "manager-1",
    username: "yonetici",
    displayName: "Ana Yonetici",
    role: "MANAGER" as const
  };

  beforeEach(() => {
    prisma.dailyProgram.findUnique.mockResolvedValue(null);
    prisma.projectEntry.findMany.mockResolvedValue([]);
    prisma.workSession.findMany.mockResolvedValue([]);
    prisma.notificationCampaign.findMany.mockResolvedValue([]);
    prisma.fieldFormResponse.findMany.mockResolvedValue([]);
    routingService.getRecommendations.mockResolvedValue({
      selectedDate: "2026-03-29",
      anchor: null,
      routeMode: "no-program",
      stops: [],
      skippedProjects: []
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns an empty overview when the selected date has no activity", async () => {
    const service = new DashboardService(prisma as never, routingService as never);

    const result = await service.getManagerOverview(actor, "2026-03-29");

    expect(result.selectedDate).toBe("2026-03-29");
    expect(result.summaryCards).toEqual({
      projectCount: 0,
      assignedFieldCount: 0,
      openSessionCount: 0,
      activityCount: 0,
      notificationCount: 0
    });
    expect(result.programProjects).toEqual([]);
    expect(result.recentActivities).toEqual([]);
    expect(result.activeSessions).toEqual([]);
    expect(result.routingSummary).toEqual({
      routeMode: "no-program",
      anchor: null,
      recommendedStopCount: 0,
      skippedProjectCount: 0,
      topStops: []
    });
    expect(result.fieldFormSummary).toEqual({
      totalCount: 0,
      uniqueTemplateCount: 0,
      uniqueProjectCount: 0,
      recentResponses: []
    });
    expect(result.notificationSummary.totalCount).toBe(0);
  });

  it("exports csv with a BOM and header row", async () => {
    const service = new DashboardService(prisma as never, routingService as never);

    const csv = await service.exportManagerOverviewCsv(actor, "2026-03-29");

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Tarih,Proje,Cari");
  });

  it("filters notifications by target day for reminders and createdAt for manual campaigns", async () => {
    prisma.notificationCampaign.findMany.mockResolvedValue([
      {
        id: "campaign-1",
        type: NotificationCampaignType.DAILY_REMINDER,
        title: "Hatirlatma",
        message: "Bugun saha var",
        targetDate: new Date("2026-03-29T00:00:00.000Z"),
        createdAt: new Date("2026-03-28T18:00:00.000Z"),
        deliveries: [{ status: NotificationDeliveryStatus.SENT }]
      },
      {
        id: "campaign-2",
        type: NotificationCampaignType.MANUAL,
        title: "Mesaj",
        message: "Kontrol edin",
        targetDate: null,
        createdAt: new Date("2026-03-29T10:00:00.000Z"),
        deliveries: [{ status: NotificationDeliveryStatus.FAILED }]
      }
    ]);

    const service = new DashboardService(prisma as never, routingService as never);
    const result = await service.getManagerOverview(actor, "2026-03-29");

    expect(prisma.notificationCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              type: NotificationCampaignType.DAILY_REMINDER,
              targetDate: new Date("2026-03-29T00:00:00.000Z")
            },
            {
              type: NotificationCampaignType.MANUAL,
              createdAt: {
                gte: new Date("2026-03-29T00:00:00.000Z"),
                lt: new Date("2026-03-30T00:00:00.000Z")
              }
            }
          ]
        }
      })
    );
    expect(result.notificationSummary.totalCount).toBe(2);
    expect(result.notificationSummary.sentCount).toBe(1);
    expect(result.notificationSummary.failedCount).toBe(1);
    expect(routingService.getRecommendations).toHaveBeenCalledWith(actor, {
      date: "2026-03-29"
    });
  });

  it("includes a condensed routing summary with the top recommended stops", async () => {
    routingService.getRecommendations.mockResolvedValue({
      selectedDate: "2026-03-29",
      anchor: {
        strategy: "anchor-project",
        userId: null,
        projectId: "project-1",
        latitude: 39.92,
        longitude: 32.85
      },
      routeMode: "nearest-neighbor",
      stops: [
        {
          recommendationRank: 1,
          projectId: "project-1",
          projectName: "Merkez",
          locationLabel: "Ankara",
          latitude: 39.92,
          longitude: 32.85,
          assignmentCount: 2,
          activeSessionCount: 1,
          assignedUsers: [],
          currentSortOrder: 1,
          distanceFromPreviousKm: null
        },
        {
          recommendationRank: 2,
          projectId: "project-2",
          projectName: "Kuzey",
          locationLabel: "Kazan",
          latitude: 40.1,
          longitude: 32.9,
          assignmentCount: 1,
          activeSessionCount: 0,
          assignedUsers: [],
          currentSortOrder: 2,
          distanceFromPreviousKm: 12.4
        },
        {
          recommendationRank: 3,
          projectId: "project-3",
          projectName: "Guney",
          locationLabel: "Golbasi",
          latitude: 39.7,
          longitude: 32.82,
          assignmentCount: 1,
          activeSessionCount: 0,
          assignedUsers: [],
          currentSortOrder: 3,
          distanceFromPreviousKm: 18.1
        },
        {
          recommendationRank: 4,
          projectId: "project-4",
          projectName: "Dogu",
          locationLabel: "Elmadag",
          latitude: 39.95,
          longitude: 33.1,
          assignmentCount: 1,
          activeSessionCount: 0,
          assignedUsers: [],
          currentSortOrder: 4,
          distanceFromPreviousKm: 14.6
        }
      ],
      skippedProjects: [{ projectId: "project-9", projectName: "Eksik", reason: "missing-coordinates" }]
    });

    const service = new DashboardService(prisma as never, routingService as never);
    const result = await service.getManagerOverview(actor, "2026-03-29");

    expect(result.routingSummary).toEqual({
      routeMode: "nearest-neighbor",
      anchor: {
        strategy: "anchor-project",
        userId: null,
        projectId: "project-1",
        latitude: 39.92,
        longitude: 32.85
      },
      recommendedStopCount: 4,
      skippedProjectCount: 1,
      topStops: [
        {
          recommendationRank: 1,
          projectId: "project-1",
          projectName: "Merkez",
          assignmentCount: 2,
          activeSessionCount: 1,
          distanceFromPreviousKm: null
        },
        {
          recommendationRank: 2,
          projectId: "project-2",
          projectName: "Kuzey",
          assignmentCount: 1,
          activeSessionCount: 0,
          distanceFromPreviousKm: 12.4
        },
        {
          recommendationRank: 3,
          projectId: "project-3",
          projectName: "Guney",
          assignmentCount: 1,
          activeSessionCount: 0,
          distanceFromPreviousKm: 18.1
        }
      ]
    });
  });

  it("includes a field form response summary for the selected day", async () => {
    prisma.fieldFormResponse.findMany.mockResolvedValue([
      {
        id: "response-1",
        templateId: "template-1",
        projectId: "project-1",
        createdAt: new Date("2026-03-29T08:00:00.000Z"),
        actor: {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Personeli",
          role: "FIELD"
        },
        project: {
          id: "project-1",
          name: "Merkez"
        },
        template: {
          id: "template-1",
          name: "Kontrol Formu"
        },
        templateVersion: {
          id: "version-1",
          versionNumber: 1,
          title: "v1"
        }
      },
      {
        id: "response-2",
        templateId: "template-2",
        projectId: "project-1",
        createdAt: new Date("2026-03-29T09:00:00.000Z"),
        actor: {
          id: "field-2",
          username: "saha-2",
          displayName: "Ikinci Saha",
          role: "FIELD"
        },
        project: {
          id: "project-1",
          name: "Merkez"
        },
        template: {
          id: "template-2",
          name: "Teslim Formu"
        },
        templateVersion: {
          id: "version-3",
          versionNumber: 3,
          title: "v3"
        }
      }
    ]);

    const service = new DashboardService(prisma as never, routingService as never);
    const result = await service.getManagerOverview(actor, "2026-03-29");

    expect(prisma.fieldFormResponse.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date("2026-03-29T00:00:00.000Z"),
          lt: new Date("2026-03-30T00:00:00.000Z")
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
        },
        project: {
          select: {
            id: true,
            name: true
          }
        },
        template: {
          select: {
            id: true,
            name: true
          }
        },
        templateVersion: {
          select: {
            id: true,
            versionNumber: true,
            title: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 12
    });
    expect(result.fieldFormSummary).toEqual({
      totalCount: 2,
      uniqueTemplateCount: 2,
      uniqueProjectCount: 1,
      recentResponses: [
        {
          id: "response-1",
          templateId: "template-1",
          templateName: "Kontrol Formu",
          templateVersionId: "version-1",
          templateVersionNumber: 1,
          templateVersionTitle: "v1",
          projectId: "project-1",
          projectName: "Merkez",
          actor: {
            id: "field-1",
            username: "saha-1",
            displayName: "Saha Personeli",
            role: "FIELD"
          },
          createdAt: "2026-03-29T08:00:00.000Z"
        },
        {
          id: "response-2",
          templateId: "template-2",
          templateName: "Teslim Formu",
          templateVersionId: "version-3",
          templateVersionNumber: 3,
          templateVersionTitle: "v3",
          projectId: "project-1",
          projectName: "Merkez",
          actor: {
            id: "field-2",
            username: "saha-2",
            displayName: "Ikinci Saha",
            role: "FIELD"
          },
          createdAt: "2026-03-29T09:00:00.000Z"
        }
      ]
    });
  });
});
