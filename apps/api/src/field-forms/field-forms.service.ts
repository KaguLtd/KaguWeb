import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Role } from "@prisma/client";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { CreateFieldFormResponseDto } from "./dto/create-field-form-response.dto";
import { FieldFormResponseFiltersDto } from "./dto/field-form-response-filters.dto";
import { CreateFieldFormTemplateDto } from "./dto/create-field-form-template.dto";
import { CreateFieldFormVersionDto } from "./dto/create-field-form-version.dto";
import { UpdateFieldFormTemplateDto } from "./dto/update-field-form-template.dto";

@Injectable()
export class FieldFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService
  ) {}

  async listTemplates(actor: CurrentUserPayload) {
    this.assertManager(actor);

    const templates = await this.prisma.fieldFormTemplate.findMany({
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1
        },
        _count: {
          select: {
            responses: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }]
    });

    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      latestVersion: template.versions[0]
        ? {
            id: template.versions[0].id,
            versionNumber: template.versions[0].versionNumber,
            title: template.versions[0].title,
            createdAt: template.versions[0].createdAt.toISOString()
          }
        : null,
      responseCount: template._count.responses
    }));
  }

  async getTemplate(id: string, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const template = await this.prisma.fieldFormTemplate.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" }
        }
      }
    });

    if (!template) {
      throw new NotFoundException("Saha form template bulunamadi.");
    }

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      versions: template.versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        schema: version.schema,
        createdAt: version.createdAt.toISOString()
      }))
    };
  }

  async createTemplate(dto: CreateFieldFormTemplateDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    this.assertValidSchema(dto.schema);

    const template = await this.prisma.fieldFormTemplate.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
        createdById: actor.sub,
        versions: {
          create: {
            versionNumber: 1,
            title: dto.versionTitle.trim(),
            schema: dto.schema as never
          }
        }
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" }
        }
      }
    });

    await this.storageService.appendSystemEvent({
      actor,
      eventType: "FIELD_FORM_TEMPLATE_CREATED",
      payload: {
        templateId: template.id,
        name: template.name,
        versionId: template.versions[0]?.id ?? null
      }
    });

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      versions: template.versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        title: version.title,
        schema: version.schema,
        createdAt: version.createdAt.toISOString()
      }))
    };
  }

  async updateTemplate(id: string, dto: UpdateFieldFormTemplateDto, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const template = await this.prisma.fieldFormTemplate.findUnique({
      where: { id }
    });

    if (!template) {
      throw new NotFoundException("Saha form template bulunamadi.");
    }

    const updated = await this.prisma.fieldFormTemplate.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive
      }
    });

    await this.storageService.appendSystemEvent({
      actor,
      eventType: "FIELD_FORM_TEMPLATE_UPDATED",
      payload: {
        templateId: updated.id,
        name: updated.name,
        isActive: updated.isActive
      }
    });

    return this.getTemplate(id, actor);
  }

  async createVersion(id: string, dto: CreateFieldFormVersionDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    this.assertValidSchema(dto.schema);

    const template = await this.prisma.fieldFormTemplate.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1
        }
      }
    });

    if (!template) {
      throw new NotFoundException("Saha form template bulunamadi.");
    }

    const version = await this.prisma.fieldFormTemplateVersion.create({
      data: {
        templateId: id,
        versionNumber: (template.versions[0]?.versionNumber ?? 0) + 1,
        title: dto.title.trim(),
        schema: dto.schema as never
      }
    });

    await this.storageService.appendSystemEvent({
      actor,
      eventType: "FIELD_FORM_TEMPLATE_VERSION_CREATED",
      payload: {
        templateId: id,
        versionId: version.id,
        versionNumber: version.versionNumber,
        title: version.title
      }
    });

    return {
      id: version.id,
      templateId: id,
      versionNumber: version.versionNumber,
      title: version.title,
      schema: version.schema,
      createdAt: version.createdAt.toISOString()
    };
  }

  async submitResponse(dto: CreateFieldFormResponseDto, actor: CurrentUserPayload) {
    const version = await this.prisma.fieldFormTemplateVersion.findUnique({
      where: { id: dto.templateVersionId },
      include: {
        template: true
      }
    });

    if (!version) {
      throw new NotFoundException("Saha form versiyonu bulunamadi.");
    }

    if (!version.template.isActive) {
      throw new BadRequestException("Pasif saha form template icin cevap kaydedilemez.");
    }

    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { id: true, storageRoot: true }
    });

    if (!project) {
      throw new NotFoundException("Proje bulunamadi.");
    }

    if (actor.role === Role.FIELD) {
      const assignment = await this.prisma.projectAssignment.findFirst({
        where: {
          userId: actor.sub,
          isActive: true,
          dailyProgramProject: {
            projectId: dto.projectId
          }
        },
        select: { id: true }
      });

      if (!assignment) {
        throw new ForbiddenException("Bu proje icin form cevabi kaydetme yetkiniz yok.");
      }
    }

    if (dto.dailyProgramProjectId) {
      const programProject = await this.prisma.dailyProgramProject.findUnique({
        where: { id: dto.dailyProgramProjectId },
        select: { id: true, projectId: true }
      });

      if (!programProject || programProject.projectId !== dto.projectId) {
        throw new BadRequestException("Gunluk proje baglami secilen projeyle uyusmuyor.");
      }
    }

    if (dto.projectEntryId) {
      const entry = await this.prisma.projectEntry.findUnique({
        where: { id: dto.projectEntryId },
        select: { id: true, projectId: true }
      });

      if (!entry || entry.projectId !== dto.projectId) {
        throw new BadRequestException("Timeline kaydi secilen projeyle uyusmuyor.");
      }
    }

    const response = await this.prisma.fieldFormResponse.create({
      data: {
        templateId: version.templateId,
        templateVersionId: version.id,
        projectId: dto.projectId,
        dailyProgramProjectId: dto.dailyProgramProjectId ?? null,
        projectEntryId: dto.projectEntryId ?? null,
        actorId: actor.sub,
        payload: dto.payload as never
      }
    });

    await this.storageService.appendProjectEvent({
      project,
      actor,
      eventType: "FIELD_FORM_RESPONSE_RECORDED",
      payload: {
        responseId: response.id,
        templateId: version.templateId,
        templateVersionId: version.id,
        projectEntryId: dto.projectEntryId ?? null
      }
    });

    return {
      id: response.id,
      templateId: response.templateId,
      templateVersionId: response.templateVersionId,
      projectId: response.projectId,
      dailyProgramProjectId: response.dailyProgramProjectId,
      projectEntryId: response.projectEntryId,
      actorId: response.actorId,
      payload: response.payload,
      createdAt: response.createdAt.toISOString()
    };
  }

  async listResponses(filters: FieldFormResponseFiltersDto, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const responses = await this.prisma.fieldFormResponse.findMany({
      where: {
        templateId: filters.templateId?.trim() || undefined,
        projectId: filters.projectId?.trim() || undefined,
        actorId: filters.actorId?.trim() || undefined
      },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true
          }
        },
        template: {
          select: {
            id: true,
            name: true
          }
        },
        templateVersion: {
          select: {
            id: true,
            versionNumber: true,
            title: true
          }
        },
        project: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });

    return responses.map((response) => this.mapResponse(response));
  }

  async getResponse(id: string, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const response = await this.prisma.fieldFormResponse.findUnique({
      where: { id },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true
          }
        },
        template: {
          select: {
            id: true,
            name: true
          }
        },
        templateVersion: {
          select: {
            id: true,
            versionNumber: true,
            title: true
          }
        },
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!response) {
      throw new NotFoundException("Saha form cevabi bulunamadi.");
    }

    return this.mapResponse(response);
  }

  private assertValidSchema(schema: { fields: Array<{ key: string; label: string }> }) {
    if (!schema.fields.length) {
      throw new BadRequestException("Form schema en az bir alan icermeli.");
    }

    const uniqueKeys = new Set(schema.fields.map((field) => field.key.trim()));
    if (uniqueKeys.size !== schema.fields.length) {
      throw new BadRequestException("Form alan anahtarlari benzersiz olmali.");
    }
  }

  private assertManager(actor: CurrentUserPayload) {
    if (actor.role !== Role.MANAGER) {
      throw new ForbiddenException("Bu islem icin yonetici yetkisi gerekli.");
    }
  }

  private mapResponse(response: {
    id: string;
    templateId: string;
    templateVersionId: string;
    projectId: string;
    dailyProgramProjectId: string | null;
    projectEntryId: string | null;
    actorId: string;
    payload: unknown;
    createdAt: Date;
    updatedAt?: Date;
    actor: {
      id: string;
      username: string;
      displayName: string;
      role: Role;
    };
    template: {
      id: string;
      name: string;
    };
    templateVersion: {
      id: string;
      versionNumber: number;
      title: string;
    };
    project: {
      id: string;
      name: string;
    };
  }) {
    return {
      id: response.id,
      templateId: response.templateId,
      templateName: response.template.name,
      templateVersionId: response.templateVersionId,
      templateVersionNumber: response.templateVersion.versionNumber,
      templateVersionTitle: response.templateVersion.title,
      projectId: response.projectId,
      projectName: response.project.name,
      dailyProgramProjectId: response.dailyProgramProjectId,
      projectEntryId: response.projectEntryId,
      actorId: response.actorId,
      actor: response.actor,
      payload: response.payload,
      createdAt: response.createdAt.toISOString(),
      updatedAt: response.updatedAt?.toISOString()
    };
  }
}
