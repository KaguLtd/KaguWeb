import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards
} from "@nestjs/common";
import { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ManagerDashboardQueryDto } from "./dto/manager-dashboard-query.dto";
import { ProjectDurationReportQueryDto } from "./dto/project-duration-report-query.dto";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("manager")
  overview(@CurrentUser() user: CurrentUserPayload, @Query() query: ManagerDashboardQueryDto) {
    return this.dashboardService.getManagerOverview(user, query.date);
  }

  @Get("manager/project-duration-report")
  projectDurationReport(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ProjectDurationReportQueryDto
  ) {
    return this.dashboardService.getProjectDurationReport(user, query);
  }

  @Get("manager/export")
  async exportCsv(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ManagerDashboardQueryDto,
    @Res({ passthrough: true }) response: Response
  ) {
    const selectedDate = query.date ?? new Date().toISOString().slice(0, 10);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="kagu-dashboard-${selectedDate}.csv"`
    );
    return this.dashboardService.exportManagerOverviewCsv(user, query.date);
  }
}
