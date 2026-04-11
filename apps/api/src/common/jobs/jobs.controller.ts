import { Body, Controller, Get, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { Role } from "@prisma/client";
import { CurrentUser } from "../decorators/current-user.decorator";
import type { CurrentUserPayload } from "../decorators/current-user.decorator";
import { Roles } from "../decorators/roles.decorator";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { CreateBackupExportDto } from "./dto/create-backup-export.dto";
import { CreateBackupRestorePrepareDto } from "./dto/create-backup-restore-prepare.dto";
import { RolesGuard } from "../guards/roles.guard";
import { ListJobExecutionsQueryDto } from "./dto/list-job-executions-query.dto";
import { JobsService } from "./jobs.service";

@Controller("jobs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get("executions")
  listExecutions(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListJobExecutionsQueryDto
  ) {
    return this.jobsService.listExecutions(user, query);
  }

  @Post("backup-export")
  createBackupExport(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBackupExportDto
  ) {
    return this.jobsService.createBackupExport(user, dto);
  }

  @Post("backup-restore-prepare")
  prepareBackupRestore(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBackupRestorePrepareDto
  ) {
    return this.jobsService.prepareBackupRestore(user, dto);
  }

  @Get("artifacts/download")
  async downloadArtifact(
    @CurrentUser() user: CurrentUserPayload,
    @Query("path") path: string,
    @Res({ passthrough: true }) response: Response
  ) {
    const payload = await this.jobsService.resolveArtifactDownload(user, path);
    if (payload.access.kind === "redirect") {
      response.redirect(payload.access.url);
      return;
    }

    response.setHeader("Content-Type", payload.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(payload.filename)}"`
    );
    return payload.access.stream;
  }

  @Get("artifacts/preview")
  previewArtifact(@CurrentUser() user: CurrentUserPayload, @Query("path") path: string) {
    return this.jobsService.previewArtifact(user, path);
  }
}
