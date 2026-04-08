import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  NotificationCampaignType,
  NotificationDeliveryStatus,
  Role
} from "@prisma/client";
import type { FieldNotificationHistoryPage } from "@kagu/contracts";
import * as webpush from "web-push";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { toDateOnly } from "../common/utils/date";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationHistoryQueryDto } from "./dto/notification-history-query.dto";
import { StorageService } from "../storage/storage.service";
import { RegisterSubscriptionDto } from "./dto/register-subscription.dto";
import { SendDailyReminderDto } from "./dto/send-daily-reminder.dto";
import { SendManualNotificationDto } from "./dto/send-manual-notification.dto";

type PushPayload = {
  title: string;
  body: string;
  url: string;
  campaignId: string;
  type: NotificationCampaignType;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService
  ) {
    if (this.isPushConfigured()) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? "mailto:admin@kagu.local",
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
      );
    }
  }

  getPublicConfig() {
    return {
      enabled: this.isPushConfigured(),
      publicKey: process.env.VAPID_PUBLIC_KEY ?? null
    };
  }

  async registerSubscription(actor: CurrentUserPayload, dto: RegisterSubscriptionDto) {
    const subscription = await this.prisma.notificationSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: {
        userId: actor.sub,
        p256dhKey: dto.keys.p256dh,
        authKey: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
        isActive: true,
        lastSeenAt: new Date()
      },
      create: {
        userId: actor.sub,
        endpoint: dto.endpoint,
        p256dhKey: dto.keys.p256dh,
        authKey: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
        isActive: true
      }
    });

    return this.mapSubscription(subscription);
  }

  async unregisterSubscription(id: string, actor: CurrentUserPayload) {
    const subscription = await this.prisma.notificationSubscription.findUnique({
      where: { id }
    });

    if (!subscription) {
      throw new NotFoundException("Bildirim cihazi bulunamadi.");
    }

    if (actor.role !== Role.MANAGER && subscription.userId !== actor.sub) {
      throw new ForbiddenException("Bu bildirimi kapatma yetkiniz yok.");
    }

    const updated = await this.prisma.notificationSubscription.update({
      where: { id },
      data: {
        isActive: false
      }
    });

    return this.mapSubscription(updated);
  }

  async listCampaigns(actor: CurrentUserPayload) {
    this.assertManager(actor);
    const campaigns = await this.prisma.notificationCampaign.findMany({
      include: {
        deliveries: {
          select: {
            id: true,
            status: true,
            sentAt: true,
            failureReason: true,
            targetUserId: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 40
    });

    const userIds = [
      ...new Set(
        campaigns.flatMap((campaign) => [
          campaign.senderId,
          ...campaign.deliveries.map((delivery) => delivery.targetUserId)
        ])
      )
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });
    const userMap = new Map(users.map((user) => [user.id, user]));

    return campaigns.map((campaign) => ({
      id: campaign.id,
      type: campaign.type,
      title: campaign.title,
      message: campaign.message,
      targetDate: campaign.targetDate?.toISOString().slice(0, 10) ?? null,
      createdAt: campaign.createdAt.toISOString(),
      sender: this.toSessionUser(userMap.get(campaign.senderId), campaign.senderId),
      deliveries: campaign.deliveries.map((delivery) => ({
        id: delivery.id,
        status: delivery.status,
        sentAt: delivery.sentAt?.toISOString() ?? null,
        failureReason: delivery.failureReason,
        targetUser: this.toManagerUserSummary(
          userMap.get(delivery.targetUserId),
          delivery.targetUserId,
          delivery.createdAt
        )
      }))
    }));
  }

  async listHistory(
    actor: CurrentUserPayload,
    query: NotificationHistoryQueryDto = {}
  ): Promise<FieldNotificationHistoryPage> {
    const pageSize = Math.min(10, Math.max(1, query.pageSize ?? 10));
    const requestedPage = Math.max(1, query.page ?? 1);
    const where = {
      deliveries: {
        some: {
          targetUserId: actor.sub
        }
      }
    };

    const totalCount = await this.prisma.notificationCampaign.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const campaigns = await this.prisma.notificationCampaign.findMany({
      where,
      include: {
        deliveries: {
          where: {
            targetUserId: actor.sub
          },
          orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }]
        }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items: campaigns.map((campaign) => {
        const preferredDelivery =
          campaign.deliveries.find((delivery) => delivery.status === NotificationDeliveryStatus.SENT) ??
          campaign.deliveries[0];

        return {
          id: campaign.id,
          title: campaign.title,
          message: campaign.message,
          type: campaign.type,
          createdAt: campaign.createdAt.toISOString(),
          targetDate: campaign.targetDate?.toISOString().slice(0, 10) ?? null,
          status: preferredDelivery?.status ?? NotificationDeliveryStatus.PENDING,
          sentAt: preferredDelivery?.sentAt?.toISOString() ?? null,
          failureReason: preferredDelivery?.failureReason ?? null
        };
      }),
      page,
      pageSize,
      totalCount,
      totalPages
    };
  }

  async sendManual(actor: CurrentUserPayload, dto: SendManualNotificationDto) {
    this.assertManager(actor);

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: dto.userIds },
        role: Role.FIELD,
        isActive: true
      }
    });

    if (users.length !== new Set(dto.userIds).size) {
      throw new BadRequestException("Bildirim hedefinde gecersiz kullanici var.");
    }

    const campaign = await this.prisma.notificationCampaign.create({
      data: {
        senderId: actor.sub,
        type: NotificationCampaignType.MANUAL,
        title: dto.title.trim(),
        message: dto.message.trim()
      }
    });

    await this.dispatchCampaign(campaign.id, dto.userIds, {
      title: dto.title.trim(),
      body: dto.message.trim(),
      url: "/dashboard/tracking",
      campaignId: campaign.id,
      type: NotificationCampaignType.MANUAL
    });

    await this.storageService.appendSystemEvent({
      actor,
      eventType: "MANUAL_NOTIFICATION_SENT",
      payload: {
        campaignId: campaign.id,
        targetUserIds: dto.userIds,
        title: dto.title.trim()
      }
    });

    return this.getCampaignById(campaign.id);
  }

  async sendDailyReminder(actor: CurrentUserPayload, dto: SendDailyReminderDto) {
    this.assertManager(actor);
    const date = toDateOnly(dto.date ?? new Date().toISOString().slice(0, 10));
    const program = await this.prisma.dailyProgram.findUnique({
      where: { date },
      include: {
        programProjects: {
          include: {
            project: {
              select: { id: true, name: true, storageRoot: true }
            },
            assignments: {
              where: { isActive: true },
              include: {
                user: {
                  select: { id: true, role: true, isActive: true }
                }
              }
            }
          }
        }
      }
    });

    if (!program) {
      throw new NotFoundException("Secilen tarih icin gunluk program bulunamadi.");
    }

    const uniqueUserIds = [
      ...new Set(
        program.programProjects.flatMap((programProject) =>
          programProject.assignments
            .filter((assignment) => assignment.user.role === Role.FIELD && assignment.user.isActive)
            .map((assignment) => assignment.user.id)
        )
      )
    ];

    if (!uniqueUserIds.length) {
      throw new BadRequestException("Bu tarih icin bildirilecek aktif saha atamasi bulunamadi.");
    }

    const projectNames = program.programProjects.map((item) => item.project.name);
    const title = "Gunluk program hatirlatmasi";
    const body = projectNames.length
      ? `Bugun atanmis projeler: ${projectNames.join(", ")}`
      : "Bugun icin size atanmis saha programi bulunuyor.";

    const campaign = await this.prisma.notificationCampaign.create({
      data: {
        senderId: actor.sub,
        type: NotificationCampaignType.DAILY_REMINDER,
        title,
        message: body,
        dailyProgramId: program.id,
        targetDate: date
      }
    });

    await this.dispatchCampaign(campaign.id, uniqueUserIds, {
      title,
      body,
      url: "/dashboard",
      campaignId: campaign.id,
      type: NotificationCampaignType.DAILY_REMINDER
    });

    await Promise.all(
      program.programProjects.map((programProject) =>
        this.storageService.appendProjectEvent({
          project: programProject.project,
          actor,
          eventType: "DAILY_REMINDER_SENT",
          payload: {
            campaignId: campaign.id,
            targetDate: date.toISOString().slice(0, 10),
            title,
            targetUserIds: programProject.assignments
              .filter((assignment) => assignment.user.role === Role.FIELD && assignment.user.isActive)
              .map((assignment) => assignment.user.id)
          }
        })
      )
    );

    return this.getCampaignById(campaign.id);
  }

  async sendAssignmentNotice(
    actor: CurrentUserPayload,
    params: {
      userIds: string[];
      projectId: string;
      projectStorageRoot: string;
      projectName: string;
      targetDate: Date;
    }
  ) {
    this.assertManager(actor);

    const uniqueUserIds = [...new Set(params.userIds)];
    if (!uniqueUserIds.length) {
      return null;
    }

    const title = "Yeni saha atamasi";
    const targetDate = params.targetDate.toISOString().slice(0, 10);
    const message = `${targetDate} icin ${params.projectName} projesine atandiniz.`;

    const campaign = await this.prisma.notificationCampaign.create({
      data: {
        senderId: actor.sub,
        type: NotificationCampaignType.MANUAL,
        title,
        message,
        targetDate: params.targetDate
      }
    });

    await this.dispatchCampaign(campaign.id, uniqueUserIds, {
      title,
      body: message,
      url: "/dashboard",
      campaignId: campaign.id,
      type: NotificationCampaignType.MANUAL
    });

    await this.storageService.appendProjectEvent({
      project: {
        id: params.projectId,
        storageRoot: params.projectStorageRoot
      },
      actor,
      eventType: "ASSIGNMENT_NOTICE_SENT",
      payload: {
        campaignId: campaign.id,
        projectName: params.projectName,
        targetDate,
        targetUserIds: uniqueUserIds
      }
    });

    return this.getCampaignById(campaign.id);
  }

  private async getCampaignById(campaignId: string) {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      include: {
        deliveries: {
          select: {
            id: true,
            status: true,
            sentAt: true,
            failureReason: true,
            targetUserId: true,
            createdAt: true
          }
        }
      }
    });

    if (!campaign) {
      throw new NotFoundException("Bildirim kampanyasi bulunamadi.");
    }

    const userIds = [
      ...new Set([campaign.senderId, ...campaign.deliveries.map((delivery) => delivery.targetUserId)])
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });
    const userMap = new Map(users.map((user) => [user.id, user]));

    return {
      id: campaign.id,
      type: campaign.type,
      title: campaign.title,
      message: campaign.message,
      targetDate: campaign.targetDate?.toISOString().slice(0, 10) ?? null,
      createdAt: campaign.createdAt.toISOString(),
      sender: this.toSessionUser(userMap.get(campaign.senderId), campaign.senderId),
      deliveries: campaign.deliveries.map((delivery) => ({
        id: delivery.id,
        status: delivery.status,
        sentAt: delivery.sentAt?.toISOString() ?? null,
        failureReason: delivery.failureReason,
        targetUser: this.toManagerUserSummary(
          userMap.get(delivery.targetUserId),
          delivery.targetUserId,
          delivery.createdAt
        )
      }))
    };
  }

  private toSessionUser(
    user:
      | {
          id: string;
          username: string;
          displayName: string;
          role: Role;
        }
      | undefined,
    fallbackId: string
  ) {
    if (user) {
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role
      };
    }

    return {
      id: fallbackId,
      username: "unknown",
      displayName: "Silinmis Kullanici",
      role: Role.MANAGER
    };
  }

  private toManagerUserSummary(
    user:
      | {
          id: string;
          username: string;
          displayName: string;
          role: Role;
          isActive: boolean;
          createdAt: Date;
        }
      | undefined,
    fallbackId: string,
    fallbackDate: Date
  ) {
    if (user) {
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString()
      };
    }

    return {
      id: fallbackId,
      username: "unknown",
      displayName: "Silinmis Kullanici",
      role: Role.FIELD,
      isActive: false,
      createdAt: fallbackDate.toISOString()
    };
  }

  private async dispatchCampaign(campaignId: string, userIds: string[], payload: PushPayload) {
    const subscriptions = await this.prisma.notificationSubscription.findMany({
      where: {
        userId: { in: userIds },
        isActive: true
      }
    });

    const deliveries = [];
    for (const userId of userIds) {
      const userSubscriptions = subscriptions.filter((subscription) => subscription.userId === userId);
      if (!userSubscriptions.length) {
        deliveries.push(
          await this.prisma.notificationDelivery.create({
            data: {
              campaignId,
              targetUserId: userId,
              subscriptionId: null,
              status: NotificationDeliveryStatus.FAILED,
              failureReason: "Bu kullanici icin aktif bildirim cihazi bulunamadi."
            }
          })
        );
        continue;
      }

      for (const subscription of userSubscriptions) {
        deliveries.push(
          await this.prisma.notificationDelivery.create({
            data: {
              campaignId,
              targetUserId: subscription.userId,
              subscriptionId: subscription.id
            }
          })
        );
      }
    }

    if (!this.isPushConfigured()) {
      await this.prisma.notificationDelivery.updateMany({
        where: {
          id: {
            in: deliveries
              .filter((delivery) => delivery.subscriptionId)
              .map((delivery) => delivery.id)
          }
        },
        data: {
          status: NotificationDeliveryStatus.FAILED,
          failureReason:
            "Web push yapilandirilmasi eksik. VAPID_PUBLIC_KEY ve VAPID_PRIVATE_KEY tanimlanmali."
        }
      });
      return [];
    }

    for (const delivery of deliveries.filter((item) => item.subscriptionId)) {
      const subscription = subscriptions.find((item) => item.id === delivery.subscriptionId)!;

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dhKey,
              auth: subscription.authKey
            }
          },
          JSON.stringify(payload)
        );

        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationDeliveryStatus.SENT,
            sentAt: new Date(),
            failureReason: null
          }
        });
      } catch (error) {
        const failureReason = error instanceof Error ? error.message : "Push gonderimi basarisiz.";
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: NotificationDeliveryStatus.FAILED,
            failureReason
          }
        });

        if (
          typeof error === "object" &&
          error &&
          "statusCode" in error &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          await this.prisma.notificationSubscription.update({
            where: { id: subscription.id },
            data: { isActive: false }
          });
        }
      }
    }
  }

  private mapSubscription(subscription: {
    id: string;
    endpoint: string;
    userAgent: string | null;
    isActive: boolean;
    createdAt: Date;
    lastSeenAt: Date;
  }) {
    return {
      id: subscription.id,
      endpoint: subscription.endpoint,
      userAgent: subscription.userAgent,
      isActive: subscription.isActive,
      createdAt: subscription.createdAt.toISOString(),
      lastSeenAt: subscription.lastSeenAt.toISOString()
    };
  }

  private isPushConfigured() {
    return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  }

  private assertManager(actor: CurrentUserPayload) {
    if (actor.role !== Role.MANAGER) {
      throw new ForbiddenException("Bu islem icin yonetici yetkisi gerekli.");
    }
  }
}
