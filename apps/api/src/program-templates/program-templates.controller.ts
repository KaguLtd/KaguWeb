import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateProgramTemplateDto } from "./dto/create-program-template.dto";
import { MaterializeProgramTemplateDto } from "./dto/materialize-program-template.dto";
import { UpdateProgramTemplateDto } from "./dto/update-program-template.dto";
import { ProgramTemplatesService } from "./program-templates.service";

@Controller("program-templates")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.MANAGER)
export class ProgramTemplatesController {
  constructor(private readonly programTemplatesService: ProgramTemplatesService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.programTemplatesService.list(user);
  }

  @Get(":id")
  getOne(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.programTemplatesService.getOne(id, user);
  }

  @Post()
  create(@Body() dto: CreateProgramTemplateDto, @CurrentUser() user: CurrentUserPayload) {
    return this.programTemplatesService.create(dto, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateProgramTemplateDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.programTemplatesService.update(id, dto, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.programTemplatesService.remove(id, user);
  }

  @Post(":id/activate")
  activate(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.programTemplatesService.setActive(id, true, user);
  }

  @Post(":id/deactivate")
  deactivate(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.programTemplatesService.setActive(id, false, user);
  }

  @Post(":id/preview")
  preview(
    @Param("id") id: string,
    @Body() dto: MaterializeProgramTemplateDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.programTemplatesService.previewMaterialization(id, dto, user);
  }

  @Post(":id/materialize")
  materialize(
    @Param("id") id: string,
    @Body() dto: MaterializeProgramTemplateDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.programTemplatesService.materialize(id, dto, user);
  }
}
