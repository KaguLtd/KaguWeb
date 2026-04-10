import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { RoutingService } from "./routing.service";

@Controller("routing")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Get("recommendations")
  recommendations(
    @CurrentUser() user: CurrentUserPayload,
    @Query("date") date?: string,
    @Query("userId") userId?: string,
    @Query("anchorProjectId") anchorProjectId?: string
  ) {
    return this.routingService.getRecommendations(user, { date, userId, anchorProjectId });
  }
}
