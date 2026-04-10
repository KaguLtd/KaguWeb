import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateFieldFormResponseDto } from "./dto/create-field-form-response.dto";
import { FieldFormResponseFiltersDto } from "./dto/field-form-response-filters.dto";
import { CreateFieldFormTemplateDto } from "./dto/create-field-form-template.dto";
import { CreateFieldFormVersionDto } from "./dto/create-field-form-version.dto";
import { FieldFormsService } from "./field-forms.service";
import { UpdateFieldFormTemplateDto } from "./dto/update-field-form-template.dto";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FieldFormsController {
  constructor(private readonly fieldFormsService: FieldFormsService) {}

  @Get("field-form-templates")
  @Roles(Role.MANAGER)
  listTemplates(@CurrentUser() user: CurrentUserPayload) {
    return this.fieldFormsService.listTemplates(user);
  }

  @Get("field-form-templates/:id")
  @Roles(Role.MANAGER)
  getTemplate(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.fieldFormsService.getTemplate(id, user);
  }

  @Post("field-form-templates")
  @Roles(Role.MANAGER)
  createTemplate(@Body() dto: CreateFieldFormTemplateDto, @CurrentUser() user: CurrentUserPayload) {
    return this.fieldFormsService.createTemplate(dto, user);
  }

  @Patch("field-form-templates/:id")
  @Roles(Role.MANAGER)
  updateTemplate(
    @Param("id") id: string,
    @Body() dto: UpdateFieldFormTemplateDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.fieldFormsService.updateTemplate(id, dto, user);
  }

  @Post("field-form-templates/:id/versions")
  @Roles(Role.MANAGER)
  createVersion(
    @Param("id") id: string,
    @Body() dto: CreateFieldFormVersionDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.fieldFormsService.createVersion(id, dto, user);
  }

  @Post("field-form-responses")
  submitResponse(@Body() dto: CreateFieldFormResponseDto, @CurrentUser() user: CurrentUserPayload) {
    return this.fieldFormsService.submitResponse(dto, user);
  }

  @Get("field-form-responses")
  @Roles(Role.MANAGER)
  listResponses(@Query() filters: FieldFormResponseFiltersDto, @CurrentUser() user: CurrentUserPayload) {
    return this.fieldFormsService.listResponses(filters, user);
  }

  @Get("field-form-responses/:id")
  @Roles(Role.MANAGER)
  getResponse(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.fieldFormsService.getResponse(id, user);
  }
}
