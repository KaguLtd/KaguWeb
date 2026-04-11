import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseBoolPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { Role } from "@prisma/client";
import { memoryStorage } from "multer";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { MAIN_FILE_UPLOAD_RATE_LIMITS } from "../common/security/rate-limit-policies";
import { RateLimit } from "../common/security/rate-limit.decorator";
import { RateLimitGuard } from "../common/security/rate-limit.guard";
import { MAX_FILE_SIZE } from "../common/utils/file-policy";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
import { ProjectFiltersDto } from "./dto/project-filters.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { UploadMainFileDto } from "./dto/upload-main-file.dto";
import { ProjectsService } from "./projects.service";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get("customers")
  @Roles(Role.MANAGER)
  customers(
    @CurrentUser() user: CurrentUserPayload,
    @Query("query") query?: string,
    @Query("includeArchived", new ParseBoolPipe({ optional: true })) includeArchived = false
  ) {
    return this.projectsService.listCustomers(user, query, includeArchived);
  }

  @Post("customers")
  @Roles(Role.MANAGER)
  createCustomer(@Body() dto: CreateCustomerDto, @CurrentUser() user: CurrentUserPayload) {
    return this.projectsService.createCustomer(dto, user);
  }

  @Get("projects")
  findAll(@CurrentUser() user: CurrentUserPayload, @Query() filters: ProjectFiltersDto) {
    return this.projectsService.findAll(user, filters);
  }

  @Post("projects")
  @Roles(Role.MANAGER)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: CurrentUserPayload) {
    return this.projectsService.create(dto, user);
  }

  @Get("projects/:id")
  findOne(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.projectsService.findOne(id, user);
  }

  @Patch("projects/:id")
  @Roles(Role.MANAGER)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.projectsService.update(id, dto, user);
  }

  @Delete("projects/:id")
  @Roles(Role.MANAGER)
  remove(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.projectsService.remove(id, user);
  }

  @Get("projects/:id/main-files")
  listMainFiles(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.projectsService.listMainFiles(id, user);
  }

  @Post("projects/:id/main-files")
  @Roles(Role.MANAGER)
  @UseGuards(RateLimitGuard)
  @RateLimit(...MAIN_FILE_UPLOAD_RATE_LIMITS)
  @UseInterceptors(
    FilesInterceptor("files", 12, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE }
    })
  )
  uploadMainFiles(
    @Param("id") id: string,
    @Body() dto: UploadMainFileDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.projectsService.uploadMainFiles(id, dto, files, user);
  }

  @Get("projects/:id/timeline")
  timeline(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.projectsService.getTimeline(id, user);
  }

  @Get("projects/:id/location-feed")
  @Roles(Role.MANAGER)
  locationFeed(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.projectsService.getLocationFeed(id, user);
  }

  @Delete("projects/:id/main-files/:fileId")
  @Roles(Role.MANAGER)
  deleteMainFile(
    @Param("id") id: string,
    @Param("fileId") fileId: string,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.projectsService.deleteMainFile(id, fileId, user);
  }

  @Get("project-files/:fileId/download")
  async downloadFile(
    @Param("fileId") fileId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query("inline", new ParseBoolPipe({ optional: true })) inline = false,
    @Res({ passthrough: true }) response: Response
  ) {
    const payload = await this.projectsService.downloadVersion(fileId, user, inline);
    if (payload.access.kind === "redirect") {
      response.redirect(payload.access.url);
      return;
    }

    response.setHeader("Content-Type", payload.version.mimeType);
    response.setHeader(
      "Content-Disposition",
      `${payload.inline ? "inline" : "attachment"}; filename="${encodeURIComponent(payload.version.originalName)}"`
    );
    return payload.access.stream;
  }
}
