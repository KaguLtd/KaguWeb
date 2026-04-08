import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { TrackingService } from "./tracking.service";

@Controller("tracking")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get("overview")
  overview(
    @CurrentUser() user: CurrentUserPayload,
    @Query("date") date?: string,
    @Query("projectId") projectId?: string,
    @Query("userId") userId?: string
  ) {
    return this.trackingService.getOverview(user, { date, projectId, userId });
  }

  @Get("history")
  history(
    @CurrentUser() user: CurrentUserPayload,
    @Query("date") date?: string,
    @Query("projectId") projectId?: string,
    @Query("userId") userId?: string
  ) {
    return this.trackingService.getHistory(user, { date, projectId, userId });
  }

  @Get("project-locations")
  projectLocations(@CurrentUser() user: CurrentUserPayload, @Query("date") date?: string) {
    return this.trackingService.getProjectLocations(user, date);
  }
}
