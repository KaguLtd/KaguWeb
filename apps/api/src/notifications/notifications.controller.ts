import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { IdempotencyKey } from "../common/decorators/idempotency-key.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { NotificationHistoryQueryDto } from "./dto/notification-history-query.dto";
import { RegisterSubscriptionDto } from "./dto/register-subscription.dto";
import { SendDailyReminderDto } from "./dto/send-daily-reminder.dto";
import { SendManualNotificationDto } from "./dto/send-manual-notification.dto";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("public-key")
  publicKey() {
    return this.notificationsService.getPublicConfig();
  }

  @Get("campaigns")
  @Roles(Role.MANAGER)
  campaigns(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.listCampaigns(user);
  }

  @Get("history")
  history(@CurrentUser() user: CurrentUserPayload, @Query() query: NotificationHistoryQueryDto) {
    return this.notificationsService.listHistory(user, query);
  }

  @Post("subscriptions")
  registerSubscription(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RegisterSubscriptionDto
  ) {
    return this.notificationsService.registerSubscription(user, dto);
  }

  @Delete("subscriptions/:id")
  unregisterSubscription(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.unregisterSubscription(id, user);
  }

  @Post("manual")
  @Roles(Role.MANAGER)
  sendManual(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SendManualNotificationDto,
    @IdempotencyKey() idempotencyKey?: string
  ) {
    return this.notificationsService.sendManual(user, dto, idempotencyKey);
  }

  @Post("daily-reminder")
  @Roles(Role.MANAGER)
  sendDailyReminder(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SendDailyReminderDto,
    @IdempotencyKey() idempotencyKey?: string
  ) {
    return this.notificationsService.sendDailyReminder(user, dto, idempotencyKey);
  }
}
