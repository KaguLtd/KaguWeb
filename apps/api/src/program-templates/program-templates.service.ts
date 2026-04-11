import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { RecurrenceFrequency, Role } from "@prisma/client";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { JobsService } from "../common/jobs/jobs.service";
import { formatDateOnly, toDateOnly } from "../common/utils/date";
import { StructuredLoggerService } from "../common/observability/structured-logger.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { CreateProgramTemplateDto } from "./dto/create-program-template.dto";
import { MaterializeProgramTemplateDto } from "./dto/materialize-program-template.dto";
import { UpdateProgramTemplateDto } from "./dto/update-program-template.dto";

type TemplateRuleRecord = {
  frequency: RecurrenceFrequency;
  weekdays: number[];
  startDate: Date;
  endDate: Date | null;
};

type TemplateProjectSummary = {
  assignments: Array<unknown>;
};

type TemplateAssignmentRecord = {
  userId: string;
  user?: {
    id: string;
    username: string;
    displayName: string;
    role: Role;
    isActive?: boolean;
  };
};

type TemplateProjectRecord = {
  id?: string;
  projectId: string;
  sortOrder: number;
  note?: string | null;
  project?: {
    id: string;
    code?: string | null;
    name: string;
    storageRoot?: string;
    isArchived?: boolean;
  };
  assignments: TemplateAssignmentRecord[];
};

type TemplateSummaryRecord = {
  id: string;
  name: string;
  managerNote: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  recurrenceRules: TemplateRuleRecord[];
  templateProjects: TemplateProjectSummary[];
};

@Injectable()
export class ProgramTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly jobsService: JobsService,
    private readonly logger: StructuredLoggerService
  ) {}

  async list(actor: CurrentUserPayload) {
    this.assertManager(actor);

    const templates = await this.prisma.programTemplate.findMany({
      include: {
        recurrenceRules: true,
        templateProjects: {
          include: {
            assignments: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }]
    });

    return (templates as TemplateSummaryRecord[]).map((template) => ({
      id: template.id,
      name: template.name,
      managerNote: template.managerNote,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      rule: this.mapRule(template.recurrenceRules[0]),
      projectCount: template.templateProjects.length,
      assignmentCount: template.templateProjects.reduce((sum: number, project: TemplateProjectSummary) => {
        return sum + project.assignments.length;
      }, 0)
    }));
  }

  async create(dto: CreateProgramTemplateDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    this.assertValidRule(dto.rule.startDate, dto.rule.endDate);

    const uniqueProjectIds = [...new Set(dto.projects.map((project) => project.projectId))];
    if (uniqueProjectIds.length !== dto.projects.length) {
      throw new BadRequestException("Template proje listesinde tekrar eden proje var.");
    }

    const uniqueUserIds = [...new Set(dto.projects.flatMap((project) => project.userIds))];
    const [projects, users] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          id: { in: uniqueProjectIds },
          isArchived: false
        },
        select: {
          id: true
        }
      }),
      uniqueUserIds.length
        ? this.prisma.user.findMany({
            where: {
              id: { in: uniqueUserIds },
              role: Role.FIELD,
              isActive: true
            },
            select: {
              id: true
            }
          })
        : Promise.resolve([])
    ]);

    if (projects.length !== uniqueProjectIds.length) {
      throw new BadRequestException("Template icin gecersiz veya arsivlenmis proje secildi.");
    }

    if (users.length !== uniqueUserIds.length) {
      throw new BadRequestException("Template atamalarinda gecersiz saha personeli var.");
    }

    const template = await this.prisma.programTemplate.create({
      data: {
        name: dto.name.trim(),
        managerNote: dto.managerNote?.trim() || null,
        isActive: dto.isActive ?? true,
        createdById: actor.sub,
        recurrenceRules: {
          create: {
            frequency: RecurrenceFrequency.WEEKLY,
            interval: 1,
            weekdays: [...new Set(dto.rule.weekdays)].sort((left, right) => left - right),
            startDate: toDateOnly(dto.rule.startDate),
            endDate: dto.rule.endDate ? toDateOnly(dto.rule.endDate) : null
          }
        },
        templateProjects: {
          create: dto.projects.map((project, index) => ({
            projectId: project.projectId,
            sortOrder: index,
            note: project.note?.trim() || null,
            assignments: {
              create: [...new Set(project.userIds)].map((userId) => ({
                userId
              }))
            }
          }))
        }
      },
      include: {
        recurrenceRules: true,
        templateProjects: {
          include: {
            assignments: true
          }
        }
      }
    });

    await this.storageService.appendSystemEvent({
      actor,
      eventType: "PROGRAM_TEMPLATE_CREATED",
      payload: {
        templateId: template.id,
        name: template.name,
        projectCount: template.templateProjects.length
      }
    });

    return {
      id: template.id,
      name: template.name,
      managerNote: template.managerNote,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      rule: this.mapRule(template.recurrenceRules[0]),
      projectCount: template.templateProjects.length,
      assignmentCount: (template.templateProjects as TemplateProjectSummary[]).reduce(
        (sum: number, project) => {
          return sum + project.assignments.length;
        },
        0
      )
    };
  }

  async getOne(id: string, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const template = await this.prisma.programTemplate.findUnique({
      where: { id },
      include: {
        recurrenceRules: true,
        templateProjects: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            project: {
              select: {
                id: true,
                code: true,
                name: true,
                isArchived: true
              }
            },
            assignments: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    role: true,
                    isActive: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!template) {
      throw new NotFoundException("Program template bulunamadi.");
    }

    return this.mapTemplateDetail(template as TemplateSummaryRecord & {
      templateProjects: TemplateProjectRecord[];
    });
  }

  async update(id: string, dto: UpdateProgramTemplateDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    this.assertValidRule(dto.rule.startDate, dto.rule.endDate);

    const existingTemplate = await this.prisma.programTemplate.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!existingTemplate) {
      throw new NotFoundException("Program template bulunamadi.");
    }

    const uniqueProjectIds = [...new Set(dto.projects.map((project) => project.projectId))];
    if (uniqueProjectIds.length !== dto.projects.length) {
      throw new BadRequestException("Template proje listesinde tekrar eden proje var.");
    }

    const uniqueUserIds = [...new Set(dto.projects.flatMap((project) => project.userIds))];
    const [projects, users] = await Promise.all([
      this.prisma.project.findMany({
        where: {
          id: { in: uniqueProjectIds },
          isArchived: false
        },
        select: { id: true }
      }),
      uniqueUserIds.length
        ? this.prisma.user.findMany({
            where: {
              id: { in: uniqueUserIds },
              role: Role.FIELD,
              isActive: true
            },
            select: { id: true }
          })
        : Promise.resolve([])
    ]);

    if (projects.length !== uniqueProjectIds.length) {
      throw new BadRequestException("Template icin gecersiz veya arsivlenmis proje secildi.");
    }

    if (users.length !== uniqueUserIds.length) {
      throw new BadRequestException("Template atamalarinda gecersiz saha personeli var.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.programTemplate.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          managerNote: dto.managerNote?.trim() || null,
          isActive: dto.isActive
        }
      });

      await tx.programTemplateRecurrenceRule.deleteMany({
        where: {
          programTemplateId: id
        }
      });

      await tx.programTemplateRecurrenceRule.create({
        data: {
          programTemplateId: id,
          frequency: RecurrenceFrequency.WEEKLY,
          interval: 1,
          weekdays: [...new Set(dto.rule.weekdays)].sort((left, right) => left - right),
          startDate: toDateOnly(dto.rule.startDate),
          endDate: dto.rule.endDate ? toDateOnly(dto.rule.endDate) : null
        }
      });

      await tx.programTemplateProject.deleteMany({
        where: {
          programTemplateId: id
        }
      });

      for (const [index, project] of dto.projects.entries()) {
        await tx.programTemplateProject.create({
          data: {
            programTemplateId: id,
            projectId: project.projectId,
            sortOrder: index,
            note: project.note?.trim() || null,
            assignments: {
              create: [...new Set(project.userIds)].map((userId) => ({
                userId
              }))
            }
          }
        });
      }
    });

    await this.storageService.appendSystemEvent({
      actor,
      eventType: "PROGRAM_TEMPLATE_UPDATED",
      payload: {
        templateId: id,
        name: dto.name.trim(),
        projectCount: dto.projects.length,
        isActive: dto.isActive
      }
    });

    return this.getOne(id, actor);
  }

  async setActive(id: string, isActive: boolean, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const existingTemplate = await this.prisma.programTemplate.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true }
    });

    if (!existingTemplate) {
      throw new NotFoundException("Program template bulunamadi.");
    }

    await this.prisma.programTemplate.update({
      where: { id },
      data: { isActive }
    });

    await this.storageService.appendSystemEvent({
      actor,
      eventType: isActive ? "PROGRAM_TEMPLATE_ACTIVATED" : "PROGRAM_TEMPLATE_DEACTIVATED",
      payload: {
        templateId: id,
        name: existingTemplate.name,
        isActive
      }
    });

    return this.getOne(id, actor);
  }

  async previewMaterialization(id: string, dto: MaterializeProgramTemplateDto, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const template = await this.prisma.programTemplate.findUnique({
      where: { id },
      include: {
        recurrenceRules: true,
        templateProjects: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: {
            project: {
              select: {
                id: true,
                code: true,
                name: true,
                storageRoot: true
              }
            },
            assignments: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    role: true,
                    isActive: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!template) {
      throw new NotFoundException("Program template bulunamadi.");
    }

    const targetDate = toDateOnly(dto.date);
    const rule = template.recurrenceRules[0];
    const matchesRule = Boolean(rule && this.matchesRule(rule, targetDate));

    const existingProgram = await this.prisma.dailyProgram.findUnique({
      where: { date: targetDate },
      include: {
        programProjects: {
          include: {
            assignments: {
              select: {
                id: true,
                userId: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    const existingProgramProjects = new Map(
      (existingProgram?.programProjects ?? []).map((programProject) => [
        programProject.projectId,
        programProject
      ])
    );

    const projectPlans = (template.templateProjects as TemplateProjectRecord[]).map((templateProject) => {
      const existingProgramProject = existingProgramProjects.get(templateProject.projectId);
      const existingAssignments = existingProgramProject?.assignments ?? [];

      const assignmentPlans = templateProject.assignments.map((assignment) => {
        const existing = existingAssignments.find((current) => current.userId === assignment.userId);
        return {
          user: assignment.user
            ? {
                id: assignment.user.id,
                username: assignment.user.username,
                displayName: assignment.user.displayName,
                role: assignment.user.role,
                isActive: assignment.user.isActive ?? true
              }
            : {
                id: assignment.userId,
                username: "unknown",
                displayName: "Silinmis Kullanici",
                role: Role.FIELD,
                isActive: false
              },
          action: !existing ? "create" : existing.isActive ? "keep" : "activate"
        };
      });

      return {
        templateProjectId: templateProject.id ?? null,
        project: templateProject.project ?? {
          id: templateProject.projectId,
          code: null,
          name: "Bilinmeyen Proje"
        },
        action: existingProgramProject ? "merge" : "create",
        assignmentPlans
      };
    });

    return {
      templateId: template.id,
      targetDate: formatDateOnly(targetDate),
      matchesRule,
      existingDailyProgramId: existingProgram?.id ?? null,
      wouldCreateDailyProgram: !existingProgram,
      projectPlans,
      summary: {
        createProjectCount: projectPlans.filter((project) => project.action === "create").length,
        mergeProjectCount: projectPlans.filter((project) => project.action === "merge").length,
        createAssignmentCount: projectPlans.flatMap((project) => project.assignmentPlans).filter((assignment) => assignment.action === "create").length,
        activateAssignmentCount: projectPlans.flatMap((project) => project.assignmentPlans).filter((assignment) => assignment.action === "activate").length
      }
    };
  }

  async materialize(id: string, dto: MaterializeProgramTemplateDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const targetDate = toDateOnly(dto.date);

    return this.jobsService.run({
      jobName: "program-templates.materialize",
      triggerSource: "api",
      actor,
      scope: `program-template:${id}`,
      targetDate,
      summarizeResult: (result) => ({
        templateId: result.templateId,
        dailyProgramId: result.dailyProgramId,
        date: result.date,
        projectCount: result.projectCount,
        createdProjectCount: result.createdProjectCount,
        createdAssignmentCount: result.createdAssignmentCount
      }),
      action: async () => {
        const template = await this.prisma.programTemplate.findUnique({
          where: { id },
          include: {
            recurrenceRules: true,
            templateProjects: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
              include: {
                project: {
                  select: {
                    id: true,
                    storageRoot: true,
                    name: true
                  }
                },
                assignments: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        role: true,
                        isActive: true
                      }
                    }
                  }
                }
              }
            }
          }
        });

        if (!template) {
          throw new NotFoundException("Program template bulunamadi.");
        }

        if (!template.isActive) {
          throw new BadRequestException("Pasif template materialize edilemez.");
        }

        const rule = template.recurrenceRules[0];
        if (!rule || !this.matchesRule(rule, targetDate)) {
          this.logger.warn("program-template.materialize.rejected", {
            templateId: id,
            targetDate: formatDateOnly(targetDate),
            reason: "rule-mismatch"
          });
          throw new BadRequestException("Template secilen tarihe uymuyor.");
        }

        const dailyProgram = await this.prisma.dailyProgram.upsert({
          where: { date: targetDate },
          update: {},
          create: {
            date: targetDate,
            createdById: actor.sub,
            managerNote: template.managerNote ?? null
          }
        });

        let createdProjectCount = 0;
        let createdAssignmentCount = 0;

        for (const templateProject of template.templateProjects) {
          const existingProgramProject = await this.prisma.dailyProgramProject.findUnique({
            where: {
              dailyProgramId_projectId: {
                dailyProgramId: dailyProgram.id,
                projectId: templateProject.projectId
              }
            },
            select: {
              id: true
            }
          });
          const programProject = await this.prisma.dailyProgramProject.upsert({
            where: {
              dailyProgramId_projectId: {
                dailyProgramId: dailyProgram.id,
                projectId: templateProject.projectId
              }
            },
            update: {},
            create: {
              dailyProgramId: dailyProgram.id,
              projectId: templateProject.projectId,
              addedById: actor.sub,
              sortOrder: templateProject.sortOrder
            }
          });

          const existingAssignments = await this.prisma.projectAssignment.findMany({
            where: {
              dailyProgramProjectId: programProject.id
            },
            select: {
              userId: true,
              isActive: true,
              id: true
            }
          });

          for (const templateAssignment of templateProject.assignments) {
            const existing = existingAssignments.find(
              (assignment) => assignment.userId === templateAssignment.userId
            );

            if (!existing) {
              await this.prisma.projectAssignment.create({
                data: {
                  dailyProgramProjectId: programProject.id,
                  userId: templateAssignment.userId,
                  assignedById: actor.sub,
                  isActive: true
                }
              });
              createdAssignmentCount += 1;
              continue;
            }

            if (!existing.isActive) {
              await this.prisma.projectAssignment.update({
                where: { id: existing.id },
                data: { isActive: true }
              });
            }
          }

          await this.storageService.appendProjectEvent({
            project: templateProject.project,
            actor,
            eventType: "PROGRAM_TEMPLATE_MATERIALIZED",
            payload: {
              templateId: template.id,
              templateName: template.name,
              targetDate: formatDateOnly(targetDate),
              dailyProgramId: dailyProgram.id
            }
          });

          if (!existingProgramProject) {
            createdProjectCount += 1;
          }
        }

        await this.storageService.appendProgramEvent({
          programDate: targetDate,
          actor,
          eventType: "PROGRAM_TEMPLATE_MATERIALIZED",
          payload: {
            templateId: template.id,
            templateName: template.name,
            targetDate: formatDateOnly(targetDate),
            dailyProgramId: dailyProgram.id,
            projectCount: template.templateProjects.length,
            createdProjectCount,
            createdAssignmentCount
          }
        });

        return {
          templateId: template.id,
          dailyProgramId: dailyProgram.id,
          date: formatDateOnly(targetDate),
          projectCount: template.templateProjects.length,
          createdProjectCount,
          createdAssignmentCount
        };
      }
    });
  }

  private mapRule(
    rule:
      | {
          frequency: RecurrenceFrequency;
          weekdays: number[];
          startDate: Date;
          endDate: Date | null;
        }
      | undefined
  ) {
    if (!rule) {
      return null;
    }

    return {
      frequency: rule.frequency,
      weekdays: rule.weekdays,
      startDate: formatDateOnly(rule.startDate),
      endDate: rule.endDate ? formatDateOnly(rule.endDate) : null
    };
  }

  private mapTemplateDetail(template: TemplateSummaryRecord & { templateProjects: TemplateProjectRecord[] }) {
    return {
      id: template.id,
      name: template.name,
      managerNote: template.managerNote,
      isActive: template.isActive,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      rule: this.mapRule(template.recurrenceRules[0]),
      projects: template.templateProjects.map((project: TemplateProjectRecord) => ({
        id: project.id ?? null,
        sortOrder: project.sortOrder,
        note: project.note ?? null,
        project: project.project
          ? {
              id: project.project.id,
              code: project.project.code ?? null,
              name: project.project.name,
              isArchived: project.project.isArchived ?? false
            }
          : {
              id: project.projectId,
              code: null,
              name: "Bilinmeyen Proje",
              isArchived: true
            },
        assignments: project.assignments.map((assignment: TemplateAssignmentRecord) => ({
          user: assignment.user
            ? {
                id: assignment.user.id,
                username: assignment.user.username,
                displayName: assignment.user.displayName,
                role: assignment.user.role,
                isActive: assignment.user.isActive ?? true
              }
            : {
                id: assignment.userId,
                username: "unknown",
                displayName: "Silinmis Kullanici",
                role: Role.FIELD,
                isActive: false
              }
        }))
      }))
    };
  }

  private matchesRule(
    rule: {
      frequency: RecurrenceFrequency;
      weekdays: number[];
      startDate: Date;
      endDate: Date | null;
    },
    targetDate: Date
  ) {
    if (rule.frequency !== RecurrenceFrequency.WEEKLY) {
      return false;
    }

    if (targetDate < rule.startDate) {
      return false;
    }

    if (rule.endDate && targetDate > rule.endDate) {
      return false;
    }

    const day = targetDate.getUTCDay();
    const isoDay = day === 0 ? 7 : day;
    return rule.weekdays.includes(isoDay);
  }

  private assertValidRule(startDate: string, endDate?: string) {
    const start = toDateOnly(startDate);
    const end = endDate ? toDateOnly(endDate) : null;

    if (end && end < start) {
      throw new BadRequestException("Template bitis tarihi baslangictan once olamaz.");
    }
  }

  private assertManager(actor: CurrentUserPayload) {
    if (actor.role !== Role.MANAGER) {
      throw new ForbiddenException("Bu islem icin yonetici yetkisi gerekli.");
    }
  }
}
