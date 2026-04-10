import { BadRequestException } from "@nestjs/common";
import {
  NotificationCampaignType,
  NotificationDeliveryStatus,
  Role
} from "@prisma/client";
import * as webpush from "web-push";
import { NotificationsService } from "../src/notifications/notifications.service";

jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn()
}));

describe("NotificationsService", () => {
  const originalVapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const originalVapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const originalVapidSubject = process.env.VAPID_SUBJECT;

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
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  afterAll(() => {
    process.env.VAPID_PUBLIC_KEY = originalVapidPublicKey;
    process.env.VAPID_PRIVATE_KEY = originalVapidPrivateKey;
    process.env.VAPID_SUBJECT = originalVapidSubject;
  });

  function createPrismaMock() {
    return {
      user: {
        findMany: jest.fn()
      },
      dailyProgram: {
        findUnique: jest.fn()
      },
      notificationCampaign: {
        count: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn()
      },
      notificationSubscription: {
        findMany: jest.fn(),
        update: jest.fn()
      },
      notificationDelivery: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn()
      }
    };
  }

  function createStorageServiceMock() {
    return {
      appendSystemEvent: jest.fn().mockResolvedValue(undefined),
      appendProjectEvent: jest.fn().mockResolvedValue(undefined)
    };
  }

  function createIdempotencyServiceMock() {
    return {
      execute: jest.fn(async ({ action }) => action())
    };
  }

  function createLoggerMock() {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  }

  function createService() {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const idempotencyService = createIdempotencyServiceMock();
    const logger = createLoggerMock();

    return {
      service: new NotificationsService(
        prisma as never,
        storageService as never,
        idempotencyService as never,
        logger as never
      ),
      prisma,
      storageService,
      idempotencyService,
      logger
    };
  }

  it("rejects manual notification when the target list contains invalid users", async () => {
    const { service, prisma } = createService();
    prisma.user.findMany.mockResolvedValue([
      {
        id: "field-1",
        role: Role.FIELD,
        isActive: true
      }
    ]);

    await expect(
      service.sendManual(managerActor as never, {
        title: "Acil duyuru",
        message: "Merkeze donun",
        userIds: ["field-1", "missing-user"]
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.notificationCampaign.create).not.toHaveBeenCalled();
  });

  it("records manual campaigns and falls back to failed deliveries when push is not configured", async () => {
    const { service, prisma, storageService, idempotencyService } = createService();
    const createdAt = new Date("2026-04-09T08:30:00.000Z");
    const userCreatedAt = new Date("2026-01-01T00:00:00.000Z");
    const deliveryCreatedAt = new Date("2026-04-09T08:31:00.000Z");
    const missingPushReason =
      "Web push yapilandirilmasi eksik. VAPID_PUBLIC_KEY ve VAPID_PRIVATE_KEY tanimlanmali.";

    prisma.user.findMany
      .mockResolvedValueOnce([
        {
          id: "field-1",
          role: Role.FIELD,
          isActive: true
        },
        {
          id: "field-2",
          role: Role.FIELD,
          isActive: true
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "manager-1",
          username: "yonetici",
          displayName: "Ana Yonetici",
          role: Role.MANAGER,
          isActive: true,
          createdAt: userCreatedAt
        },
        {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Bir",
          role: Role.FIELD,
          isActive: true,
          createdAt: userCreatedAt
        },
        {
          id: "field-2",
          username: "saha-2",
          displayName: "Saha Iki",
          role: Role.FIELD,
          isActive: true,
          createdAt: userCreatedAt
        }
      ]);
    prisma.notificationCampaign.create.mockResolvedValue({
      id: "campaign-1"
    });
    prisma.notificationSubscription.findMany.mockResolvedValue([
      {
        id: "subscription-1",
        userId: "field-1",
        endpoint: "https://push.example.com/subscriptions/1",
        p256dhKey: "p256dh-key",
        authKey: "auth-key",
        isActive: true
      }
    ]);
    prisma.notificationDelivery.create
      .mockResolvedValueOnce({
        id: "delivery-1",
        targetUserId: "field-1",
        subscriptionId: "subscription-1"
      })
      .mockResolvedValueOnce({
        id: "delivery-2",
        targetUserId: "field-2",
        subscriptionId: null
      });
    prisma.notificationDelivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationCampaign.findUnique.mockResolvedValue({
      id: "campaign-1",
      senderId: "manager-1",
      type: NotificationCampaignType.MANUAL,
      title: "Acil duyuru",
      message: "Merkeze donun",
      targetDate: null,
      createdAt,
      deliveries: [
        {
          id: "delivery-1",
          status: NotificationDeliveryStatus.FAILED,
          sentAt: null,
          failureReason: missingPushReason,
          targetUserId: "field-1",
          createdAt: deliveryCreatedAt
        },
        {
          id: "delivery-2",
          status: NotificationDeliveryStatus.FAILED,
          sentAt: null,
          failureReason: "Bu kullanici icin aktif bildirim cihazi bulunamadi.",
          targetUserId: "field-2",
          createdAt: deliveryCreatedAt
        }
      ]
    });

    const result = await service.sendManual(managerActor as never, {
      title: "  Acil duyuru  ",
      message: " Merkeze donun ",
      userIds: ["field-1", "field-2"]
    });

    expect(prisma.notificationCampaign.create).toHaveBeenCalledWith({
      data: {
        senderId: "manager-1",
        type: NotificationCampaignType.MANUAL,
        title: "Acil duyuru",
        message: "Merkeze donun"
      }
    });
    expect(idempotencyService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "manager-1",
        scope: "notifications:manual:create",
        key: undefined
      })
    );
    expect(prisma.notificationDelivery.create).toHaveBeenNthCalledWith(1, {
      data: {
        campaignId: "campaign-1",
        targetUserId: "field-1",
        subscriptionId: "subscription-1"
      }
    });
    expect(prisma.notificationDelivery.create).toHaveBeenNthCalledWith(2, {
      data: {
        campaignId: "campaign-1",
        targetUserId: "field-2",
        subscriptionId: null,
        status: NotificationDeliveryStatus.FAILED,
        failureReason: "Bu kullanici icin aktif bildirim cihazi bulunamadi."
      }
    });
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["delivery-1"]
        }
      },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        failureReason: missingPushReason
      }
    });
    expect(storageService.appendSystemEvent).toHaveBeenCalledWith({
      actor: managerActor,
      eventType: "MANUAL_NOTIFICATION_SENT",
      payload: {
        campaignId: "campaign-1",
        targetUserIds: ["field-1", "field-2"],
        title: "Acil duyuru"
      }
    });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "campaign-1",
      type: NotificationCampaignType.MANUAL,
      title: "Acil duyuru",
      message: "Merkeze donun",
      targetDate: null,
      createdAt: createdAt.toISOString(),
      sender: {
        id: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: Role.MANAGER
      },
      deliveries: [
        {
          id: "delivery-1",
          status: NotificationDeliveryStatus.FAILED,
          sentAt: null,
          failureReason: missingPushReason,
          targetUser: {
            id: "field-1",
            username: "saha-1",
            displayName: "Saha Bir",
            role: Role.FIELD,
            isActive: true,
            createdAt: userCreatedAt.toISOString()
          }
        },
        {
          id: "delivery-2",
          status: NotificationDeliveryStatus.FAILED,
          sentAt: null,
          failureReason: "Bu kullanici icin aktif bildirim cihazi bulunamadi.",
          targetUser: {
            id: "field-2",
            username: "saha-2",
            displayName: "Saha Iki",
            role: Role.FIELD,
            isActive: true,
            createdAt: userCreatedAt.toISOString()
          }
        }
      ]
    });
  });

  it("builds daily reminder campaigns for unique active field assignees and audits each project", async () => {
    const { service, prisma, storageService, idempotencyService } = createService();
    const targetDate = new Date("2026-04-10T00:00:00.000Z");
    const createdAt = new Date("2026-04-09T09:00:00.000Z");
    const userCreatedAt = new Date("2026-02-15T00:00:00.000Z");

    prisma.dailyProgram.findUnique.mockResolvedValue({
      id: "program-1",
      programProjects: [
        {
          project: {
            id: "project-1",
            name: "Merkez Santiye",
            storageRoot: "projects/merkez-santiye"
          },
          assignments: [
            {
              user: {
                id: "field-1",
                role: Role.FIELD,
                isActive: true
              }
            },
            {
              user: {
                id: "manager-2",
                role: Role.MANAGER,
                isActive: true
              }
            }
          ]
        },
        {
          project: {
            id: "project-2",
            name: "Kuzey Depo",
            storageRoot: "projects/kuzey-depo"
          },
          assignments: [
            {
              user: {
                id: "field-1",
                role: Role.FIELD,
                isActive: true
              }
            },
            {
              user: {
                id: "field-4",
                role: Role.FIELD,
                isActive: true
              }
            },
            {
              user: {
                id: "field-5",
                role: Role.FIELD,
                isActive: false
              }
            }
          ]
        }
      ]
    });
    prisma.notificationCampaign.create.mockResolvedValue({
      id: "campaign-2"
    });
    prisma.notificationSubscription.findMany.mockResolvedValue([]);
    prisma.notificationDelivery.create
      .mockResolvedValueOnce({
        id: "delivery-3",
        targetUserId: "field-1",
        subscriptionId: null
      })
      .mockResolvedValueOnce({
        id: "delivery-4",
        targetUserId: "field-4",
        subscriptionId: null
      });
    prisma.notificationDelivery.updateMany.mockResolvedValue({ count: 0 });
    prisma.notificationCampaign.findUnique.mockResolvedValue({
      id: "campaign-2",
      senderId: "manager-1",
      type: NotificationCampaignType.DAILY_REMINDER,
      title: "Gunluk program hatirlatmasi",
      message: "Bugun atanmis projeler: Merkez Santiye, Kuzey Depo",
      targetDate,
      createdAt,
      deliveries: [
        {
          id: "delivery-3",
          status: NotificationDeliveryStatus.FAILED,
          sentAt: null,
          failureReason: "Bu kullanici icin aktif bildirim cihazi bulunamadi.",
          targetUserId: "field-1",
          createdAt
        },
        {
          id: "delivery-4",
          status: NotificationDeliveryStatus.FAILED,
          sentAt: null,
          failureReason: "Bu kullanici icin aktif bildirim cihazi bulunamadi.",
          targetUserId: "field-4",
          createdAt
        }
      ]
    });
    prisma.user.findMany.mockResolvedValue([
      {
        id: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: Role.MANAGER,
        isActive: true,
        createdAt: userCreatedAt
      },
      {
        id: "field-1",
        username: "saha-1",
        displayName: "Saha Bir",
        role: Role.FIELD,
        isActive: true,
        createdAt: userCreatedAt
      },
      {
        id: "field-4",
        username: "saha-4",
        displayName: "Saha Dort",
        role: Role.FIELD,
        isActive: true,
        createdAt: userCreatedAt
      }
    ]);

    const result = await service.sendDailyReminder(managerActor as never, {
      date: "2026-04-10"
    });

    expect(prisma.notificationCampaign.create).toHaveBeenCalledWith({
      data: {
        senderId: "manager-1",
        type: NotificationCampaignType.DAILY_REMINDER,
        title: "Gunluk program hatirlatmasi",
        message: "Bugun atanmis projeler: Merkez Santiye, Kuzey Depo",
        dailyProgramId: "program-1",
        targetDate
      }
    });
    expect(idempotencyService.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "manager-1",
        scope: "notifications:daily-reminder:2026-04-10",
        key: undefined
      })
    );
    expect(prisma.notificationDelivery.create).toHaveBeenCalledTimes(2);
    expect(prisma.notificationDelivery.create).toHaveBeenNthCalledWith(1, {
      data: {
        campaignId: "campaign-2",
        targetUserId: "field-1",
        subscriptionId: null,
        status: NotificationDeliveryStatus.FAILED,
        failureReason: "Bu kullanici icin aktif bildirim cihazi bulunamadi."
      }
    });
    expect(prisma.notificationDelivery.create).toHaveBeenNthCalledWith(2, {
      data: {
        campaignId: "campaign-2",
        targetUserId: "field-4",
        subscriptionId: null,
        status: NotificationDeliveryStatus.FAILED,
        failureReason: "Bu kullanici icin aktif bildirim cihazi bulunamadi."
      }
    });
    expect(storageService.appendProjectEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        project: expect.objectContaining({
          id: "project-1",
          storageRoot: "projects/merkez-santiye"
        }),
        actor: managerActor,
        eventType: "DAILY_REMINDER_SENT",
        payload: {
          campaignId: "campaign-2",
          targetDate: "2026-04-10",
          title: "Gunluk program hatirlatmasi",
          targetUserIds: ["field-1"]
        }
      })
    );
    expect(storageService.appendProjectEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        project: expect.objectContaining({
          id: "project-2",
          storageRoot: "projects/kuzey-depo"
        }),
        actor: managerActor,
        eventType: "DAILY_REMINDER_SENT",
        payload: {
          campaignId: "campaign-2",
          targetDate: "2026-04-10",
          title: "Gunluk program hatirlatmasi",
          targetUserIds: ["field-1", "field-4"]
        }
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "campaign-2",
        type: NotificationCampaignType.DAILY_REMINDER,
        targetDate: "2026-04-10"
      })
    );
  });

  it("logs failed notification deliveries and deactivates expired subscriptions", async () => {
    const { service, prisma, logger } = createService();
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    const pushError = Object.assign(new Error("gone"), { statusCode: 410 });

    prisma.user.findMany
      .mockResolvedValueOnce([
        {
          id: "field-1",
          role: Role.FIELD,
          isActive: true
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "manager-1",
          username: "yonetici",
          displayName: "Ana Yonetici",
          role: Role.MANAGER,
          isActive: true,
          createdAt: new Date("2026-01-01T00:00:00.000Z")
        },
        {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Bir",
          role: Role.FIELD,
          isActive: true,
          createdAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ]);
    prisma.notificationCampaign.create.mockResolvedValue({
      id: "campaign-9"
    });
    prisma.notificationSubscription.findMany.mockResolvedValue([
      {
        id: "subscription-1",
        userId: "field-1",
        endpoint: "https://push.example.com/subscriptions/1",
        p256dhKey: "p256dh-key",
        authKey: "auth-key",
        isActive: true
      }
    ]);
    prisma.notificationDelivery.create.mockResolvedValue({
      id: "delivery-9",
      targetUserId: "field-1",
      subscriptionId: "subscription-1"
    });
    prisma.notificationDelivery.update.mockResolvedValue(undefined);
    prisma.notificationSubscription.update.mockResolvedValue(undefined);
    prisma.notificationCampaign.findUnique.mockResolvedValue({
      id: "campaign-9",
      senderId: "manager-1",
      type: NotificationCampaignType.MANUAL,
      title: "Acil duyuru",
      message: "Merkeze donun",
      targetDate: null,
      createdAt: new Date("2026-04-10T08:30:00.000Z"),
      deliveries: [
        {
          id: "delivery-9",
          status: NotificationDeliveryStatus.FAILED,
          sentAt: null,
          failureReason: "gone",
          targetUserId: "field-1",
          createdAt: new Date("2026-04-10T08:31:00.000Z")
        }
      ]
    });
    (webpush.sendNotification as jest.Mock).mockRejectedValue(pushError);

    await service.sendManual(managerActor as never, {
      title: "Acil duyuru",
      message: "Merkeze donun",
      userIds: ["field-1"]
    });

    expect(logger.warn).toHaveBeenCalledWith("notification.delivery.failed", {
      campaignId: "campaign-9",
      deliveryId: "delivery-9",
      targetUserId: "field-1",
      subscriptionId: "subscription-1",
      failureReason: "gone",
      statusCode: 410
    });
    expect(logger.info).toHaveBeenCalledWith("notification.subscription.deactivated", {
      campaignId: "campaign-9",
      deliveryId: "delivery-9",
      subscriptionId: "subscription-1",
      targetUserId: "field-1",
      reason: "push-status-410"
    });
    expect(prisma.notificationSubscription.update).toHaveBeenCalledWith({
      where: { id: "subscription-1" },
      data: { isActive: false }
    });
  });

  it("clamps history pagination and prefers a sent delivery when one exists", async () => {
    const { service, prisma } = createService();
    const createdAt = new Date("2026-04-10T08:00:00.000Z");
    const sentAt = new Date("2026-04-10T08:05:00.000Z");

    prisma.notificationCampaign.count.mockResolvedValue(1);
    prisma.notificationCampaign.findMany.mockResolvedValue([
      {
        id: "campaign-3",
        title: "Gunluk program hatirlatmasi",
        message: "Bugunku programinizi kontrol edin",
        type: NotificationCampaignType.DAILY_REMINDER,
        createdAt,
        targetDate: new Date("2026-04-10T00:00:00.000Z"),
        deliveries: [
          {
            status: NotificationDeliveryStatus.FAILED,
            sentAt: null,
            failureReason: "Ilk deneme basarisiz."
          },
          {
            status: NotificationDeliveryStatus.SENT,
            sentAt,
            failureReason: null
          }
        ]
      }
    ]);

    const result = await service.listHistory(fieldActor as never, {
      page: 9,
      pageSize: 99
    });

    expect(prisma.notificationCampaign.findMany).toHaveBeenCalledWith({
      where: {
        deliveries: {
          some: {
            targetUserId: "field-1"
          }
        }
      },
      include: {
        deliveries: {
          where: {
            targetUserId: "field-1"
          },
          orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }]
        }
      },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 10
    });
    expect(result).toEqual({
      items: [
        {
          id: "campaign-3",
          title: "Gunluk program hatirlatmasi",
          message: "Bugunku programinizi kontrol edin",
          type: NotificationCampaignType.DAILY_REMINDER,
          createdAt: createdAt.toISOString(),
          targetDate: "2026-04-10",
          status: NotificationDeliveryStatus.SENT,
          sentAt: sentAt.toISOString(),
          failureReason: null
        }
      ],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1
    });
  });
});
