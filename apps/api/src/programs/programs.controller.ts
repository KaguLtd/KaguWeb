import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { IdempotencyKey } from "../common/decorators/idempotency-key.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { RateLimit } from "../common/security/rate-limit.decorator";
import { RateLimitGuard } from "../common/security/rate-limit.guard";
import { TIMELINE_ENTRY_UPLOAD_RATE_LIMITS } from "../common/security/rate-limit-policies";
import { uploadDiskStorageOptions } from "../common/utils/upload-temp-storage";
import { AddProgramProjectDto } from "./dto/add-program-project.dto";
import { AssignFieldUsersDto } from "./dto/assign-field-users.dto";
import { CreateDailyProgramDto } from "./dto/create-daily-program.dto";
import { CreateEntryDto } from "./dto/create-entry.dto";
import { LocationPingDto } from "./dto/location-ping.dto";
import { ProgramMonthQueryDto } from "./dto/program-month-query.dto";
import { ReorderProgramProjectsDto } from "./dto/reorder-program-projects.dto";
import { UpdateProgramNoteDto } from "./dto/update-program-note.dto";
import { WorkSessionDto } from "./dto/work-session.dto";
import { ProgramsService } from "./programs.service";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Post("daily-programs")
  @Roles(Role.MANAGER)
  createDailyProgram(@Body() dto: CreateDailyProgramDto, @CurrentUser() user: CurrentUserPayload) {
    return this.programsService.createDailyProgram(dto, user);
  }

  @Get("daily-programs")
  @Roles(Role.MANAGER)
  getProgramMonthSummary(@Query() query: ProgramMonthQueryDto, @CurrentUser() user: CurrentUserPayload) {
    return this.programsService.getProgramMonthSummary(query, user);
  }

  @Get("daily-programs/:date")
  @Roles(Role.MANAGER)
  getDailyProgram(@Param("date") date: string, @CurrentUser() user: CurrentUserPayload) {
    return this.programsService.getProgramByDate(date, user);
  }

  @Patch("daily-programs/:id/note")
  @Roles(Role.MANAGER)
  updateProgramNote(
    @Param("id") id: string,
    @Body() dto: UpdateProgramNoteDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.programsService.updateProgramNote(id, dto, user);
  }

  @Post("daily-programs/:id/projects")
  @Roles(Role.MANAGER)
  addProjectToProgram(@Param("id") id: string, @Body() dto: AddProgramProjectDto, @CurrentUser() user: CurrentUserPayload) {
    return this.programsService.addProjectToProgram(id, dto, user);
  }

  @Delete("program-projects/:id")
  @Roles(Role.MANAGER)
  removeProjectFromProgram(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.programsService.removeProjectFromProgram(id, user);
  }

  @Patch("daily-programs/:id/reorder")
  @Roles(Role.MANAGER)
  reorderProgramProjects(
    @Param("id") id: string,
    @Body() dto: ReorderProgramProjectsDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.programsService.reorderProgramProjects(id, dto, user);
  }

  @Post("program-projects/:id/assignments")
  @Roles(Role.MANAGER)
  assignUsers(@Param("id") id: string, @Body() dto: AssignFieldUsersDto, @CurrentUser() user: CurrentUserPayload) {
    return this.programsService.assignUsers(id, dto, user);
  }

  @Post("assignments/:id/work-start")
  @Roles(Role.FIELD)
  workStart(
    @Param("id") id: string,
    @Body() dto: WorkSessionDto,
    @CurrentUser() user: CurrentUserPayload,
    @IdempotencyKey() idempotencyKey?: string
  ) {
    return this.programsService.workStart(id, dto, user, idempotencyKey);
  }

  @Post("assignments/:id/work-end")
  @Roles(Role.FIELD)
  workEnd(
    @Param("id") id: string,
    @Body() dto: WorkSessionDto,
    @CurrentUser() user: CurrentUserPayload,
    @IdempotencyKey() idempotencyKey?: string
  ) {
    return this.programsService.workEnd(id, dto, user, idempotencyKey);
  }

  @Post("program-projects/:id/entries")
  @UseGuards(RateLimitGuard)
  @RateLimit(...TIMELINE_ENTRY_UPLOAD_RATE_LIMITS)
  @UseInterceptors(
    FilesInterceptor("files", 12, uploadDiskStorageOptions)
  )
  createEntry(
    @Param("id") id: string,
    @Body() dto: CreateEntryDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: CurrentUserPayload,
    @IdempotencyKey() idempotencyKey?: string
  ) {
    return this.programsService.createEntry(id, dto, files, user, idempotencyKey);
  }

  @Post("assignments/:id/location-pings")
  @Roles(Role.FIELD)
  createLocationPing(
    @Param("id") id: string,
    @Body() dto: LocationPingDto,
    @CurrentUser() user: CurrentUserPayload,
    @IdempotencyKey() idempotencyKey?: string
  ) {
    return this.programsService.createLocationPing(id, dto, user, idempotencyKey);
  }
}
