import { DashboardService } from "../src/dashboard/dashboard.service";
import { NotificationCampaignType, NotificationDeliveryStatus } from "@prisma/client";

describe("DashboardService", () => {
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns an empty overview when the selected date has no activity", async () => {
    const service = new DashboardService(prisma as never);

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
    expect(result.notificationSummary.totalCount).toBe(0);
  });

  it("exports csv with a BOM and header row", async () => {
    const service = new DashboardService(prisma as never);

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

    const service = new DashboardService(prisma as never);
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
  });
});
