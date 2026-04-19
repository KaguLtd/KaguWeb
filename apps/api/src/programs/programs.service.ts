import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { FileScope, Prisma, ProjectEntryType, Role } from "@prisma/client";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { IdempotencyService } from "../common/idempotency/idempotency.service";
import { StructuredLoggerService } from "../common/observability/structured-logger.service";
import { toDateOnly } from "../common/utils/date";
import {
  isImage,
  isInlinePreviewable
} from "../common/utils/file-policy";
import { cleanupUploadedTempFiles } from "../common/utils/upload-temp-storage";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ProgramTemplatesService } from "../program-templates/program-templates.service";
import { StorageService } from "../storage/storage.service";
import { AddProgramProjectDto } from "./dto/add-program-project.dto";
import { AssignFieldUsersDto } from "./dto/assign-field-users.dto";
import { CreateDailyProgramDto } from "./dto/create-daily-program.dto";
import { CreateEntryDto } from "./dto/create-entry.dto";
import { LocationPingDto } from "./dto/location-ping.dto";
import { ProgramMonthQueryDto } from "./dto/program-month-query.dto";
import { ReorderProgramProjectsDto } from "./dto/reorder-program-projects.dto";
import { UpdateProgramNoteDto } from "./dto/update-program-note.dto";
import { WorkSessionDto } from "./dto/work-session.dto";

@Injectable()
export class ProgramsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
    private readonly idempotencyService: IdempotencyService,
    private readonly logger: StructuredLoggerService,
    private readonly programTemplatesService: ProgramTemplatesService
  ) {}

  async createDailyProgram(dto: CreateDailyProgramDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const date = toDateOnly(dto.date);

    const program = await this.prisma.dailyProgram.upsert({
      where: { date },
      update: {},
      create: {
        date,
        createdById: actor.sub
      }
    });

    await this.programTemplatesService.seedDailyProgramForDate(date, actor);

    return program;
  }

  async getProgramMonthSummary(query: ProgramMonthQueryDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const monthValue = query.month ?? new Date().toISOString().slice(0, 7);
    const [year, month] = monthValue.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    await this.programTemplatesService.seedDailyProgramsForMonth(monthValue, actor);

    const programs = await this.prisma.dailyProgram.findMany({
      where: {
        date: {
          gte: start,
          lt: end
        }
      },
      include: {
        programProjects: {
          include: {
            project: {
              select: { name: true }
            },
            assignments: {
              where: { isActive: true },
              select: { userId: true }
            },
            entries: {
              where: {
                OR: [
                  { note: { not: null } },
                  {
                    files: {
                      some: {}
                    }
                  }
                ]
              },
              select: { id: true },
              take: 1
            }
          }
        }
      },
      orderBy: { date: "asc" }
    });

    return programs.map((program) => ({
      date: program.date.toISOString().slice(0, 10),
      projectCount: program.programProjects.length,
      userCount: new Set(
        program.programProjects.flatMap((programProject) =>
          programProject.assignments.map((assignment) => assignment.userId)
        )
      ).size,
      note:
        program.managerNote ??
        (program.programProjects.some((programProject) => programProject.entries.length > 0)
          ? "Proje notu var"
          : null),
      projectNames: program.programProjects.map((programProject) => programProject.project.name)
    }));
  }

  async getProgramByDate(date: string, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const targetDate = toDateOnly(date);

    await this.programTemplatesService.seedDailyProgramForDate(targetDate, actor);

    const program = await this.prisma.dailyProgram.findUnique({
      where: { date: targetDate },
      include: {
        programProjects: {
          include: {
            project: {
              include: {
                customer: true,
                files: {
                  where: { scope: FileScope.MAIN },
                  select: { id: true }
                },
                programProjects: {
                  select: { id: true }
                },
                _count: {
                  select: { entries: true }
                }
              }
            },
            assignments: {
              where: { isActive: true },
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    role: true,
                    isActive: true,
                    createdAt: true
                  }
                },
                workSessions: {
                  where: { endedAt: null },
                  orderBy: { startedAt: "desc" },
                  take: 1
                },
                locationPings: {
                  orderBy: { capturedAt: "desc" },
                  take: 1,
                  include: {
                    actor: {
                      select: {
                        id: true,
                        username: true,
                        displayName: true,
                        role: true
                      }
                    }
                  }
                }
              }
            },
            entries: {
              include: {
                actor: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    role: true
                  }
                },
                files: {
                  include: {
                    versions: {
                      orderBy: { versionNumber: "desc" },
                      take: 1
                    }
                  }
                }
              },
              orderBy: [{ createdAt: "desc" }]
            }
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!program) {
      return null;
    }

    return {
      id: program.id,
      date: program.date.toISOString().slice(0, 10),
      managerNote: program.managerNote,
      programProjects: program.programProjects.map((programProject) => ({
        id: programProject.id,
        sortOrder: programProject.sortOrder,
        project: {
          id: programProject.project.id,
          code: programProject.project.code,
          name: programProject.project.name,
          description: programProject.project.description,
          locationLabel: programProject.project.locationLabel,
          latitude: programProject.project.latitude,
          longitude: programProject.project.longitude,
          isArchived: programProject.project.isArchived,
          storageRoot: programProject.project.storageRoot,
          createdAt: programProject.project.createdAt.toISOString(),
          updatedAt: programProject.project.updatedAt.toISOString(),
          customer: programProject.project.customer
            ? {
                id: programProject.project.customer.id,
                name: programProject.project.customer.name,
                note: programProject.project.customer.note,
                isArchived: programProject.project.customer.isArchived,
                projectCount: undefined
              }
            : null,
          mainFileCount: programProject.project.files.length,
          programUsageCount: programProject.project.programProjects.length,
          timelineEntryCount: programProject.project._count.entries
        },
        assignments: programProject.assignments.map((assignment) => ({
          id: assignment.id,
          user: {
            id: assignment.user.id,
            username: assignment.user.username,
            displayName: assignment.user.displayName,
            role: assignment.user.role,
            isActive: assignment.user.isActive,
            createdAt: assignment.user.createdAt.toISOString(),
            assignmentCount: undefined,
            openSessionCount: assignment.workSessions.length,
            subscriptionCount: undefined
          },
          activeSession: assignment.workSessions[0]
            ? {
                id: assignment.workSessions[0].id,
                startedAt: assignment.workSessions[0].startedAt.toISOString(),
                endedAt: null
              }
            : null,
          lastLocation: assignment.locationPings[0]
            ? {
                id: assignment.locationPings[0].id,
                latitude: assignment.locationPings[0].latitude,
                longitude: assignment.locationPings[0].longitude,
                accuracy: assignment.locationPings[0].accuracy,
                capturedAt: assignment.locationPings[0].capturedAt.toISOString(),
                actor: assignment.locationPings[0].actor,
                projectId: programProject.project.id,
                source: assignment.locationPings[0].source
              }
            : null
        })),
        dayEntries: programProject.entries.map((entry) => this.mapProgramEntry(entry))
      }))
    };
  }

  async updateProgramNote(programId: string, dto: UpdateProgramNoteDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const program = await this.prisma.dailyProgram.update({
      where: { id: programId },
      data: {
        managerNote: dto.managerNote?.trim() || null
      },
      include: {
        programProjects: {
          include: {
            project: {
              include: {
                customer: true
              }
            }
          }
        }
      }
    });

    if (program.programProjects.length) {
      await Promise.all(
        program.programProjects.map(async (programProject) => {
          await this.storageService.appendProjectEvent({
            project: programProject.project,
            actor,
            eventType: "DAILY_PROGRAM_NOTE_UPDATED",
            payload: {
              programId: program.id,
              programDate: program.date.toISOString().slice(0, 10),
              note: program.managerNote
            }
          });

          if (program.managerNote?.trim()) {
            await this.storageService.appendProjectNote({
              project: programProject.project,
              actor,
              note: program.managerNote,
              source: "GUNLUK_SAHA",
              context: {
                programId: program.id,
                programDate: program.date.toISOString().slice(0, 10)
              }
            });
          }
        })
      );
    } else {
      await this.storageService.appendProgramEvent({
        programDate: program.date,
        actor,
        eventType: "DAILY_PROGRAM_NOTE_UPDATED",
        payload: {
          programId: program.id,
          note: program.managerNote
        }
      });
    }

    return program;
  }

  async addProjectToProgram(programId: string, dto: AddProgramProjectDto, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const program = await this.prisma.dailyProgram.findUnique({
      where: { id: programId },
      include: {
        _count: {
          select: { programProjects: true }
        }
      }
    });
    if (!program) {
      throw new NotFoundException("Gunluk program bulunamadi.");
    }

    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) {
      throw new NotFoundException("Proje bulunamadi.");
    }
    if (project.isArchived) {
      throw new BadRequestException("Arsivlenmis proje gunluk programa eklenemez.");
    }

    const record = await this.prisma.dailyProgramProject.upsert({
      where: {
        dailyProgramId_projectId: {
          dailyProgramId: programId,
          projectId: dto.projectId
        }
      },
      update: {},
      create: {
        dailyProgramId: programId,
        projectId: dto.projectId,
        addedById: actor.sub,
        sortOrder: program._count.programProjects
      }
    });

    if (dto.note?.trim()) {
      await this.prisma.projectEntry.create({
        data: {
          projectId: dto.projectId,
          dailyProgramProjectId: record.id,
          actorId: actor.sub,
          entryType: ProjectEntryType.MANAGER_NOTE,
          note: dto.note.trim(),
          entryDate: program.date
        }
      });

      await this.storageService.appendProjectNote({
        project,
        actor,
        note: dto.note.trim(),
        source: "GUNLUK_SAHA",
        context: {
          programId,
          dailyProgramProjectId: record.id,
          programDate: program.date.toISOString().slice(0, 10)
        }
      });
    }

    await this.storageService.appendProjectEvent({
      project,
      actor,
      eventType: "PROJECT_ADDED_TO_PROGRAM",
      payload: {
        programId,
        dailyProgramProjectId: record.id,
        programDate: program.date.toISOString().slice(0, 10),
        note: dto.note?.trim() || null
      }
    });

    return record;
  }

  async removeProjectFromProgram(programProjectId: string, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const programProject = await this.prisma.dailyProgramProject.findUnique({
      where: { id: programProjectId },
      include: {
        _count: {
          select: {
            assignments: true,
            entries: true
          }
        },
        assignments: {
          include: {
            _count: {
              select: {
                workSessions: true,
                locationPings: true
              }
            }
          }
        }
      }
    });

    if (!programProject) {
      throw new NotFoundException("Gunluk proje kaydi bulunamadi.");
    }

    const hasHistory =
      programProject._count.entries > 0 ||
      programProject.assignments.some(
        (assignment) => assignment._count.workSessions > 0 || assignment._count.locationPings > 0
      );

    if (hasHistory) {
      throw new BadRequestException(
        "Bu gunluk proje kaydi silinemez. Kayit gecmisi bulundugu icin programdan kaldirma reddedildi."
      );
    }

    await this.prisma.$transaction([
      this.prisma.projectAssignment.deleteMany({
        where: { dailyProgramProjectId: programProjectId }
      }),
      this.prisma.dailyProgramProject.delete({ where: { id: programProjectId } })
    ]);

    return { success: true };
  }

  async reorderProgramProjects(
    programId: string,
    dto: ReorderProgramProjectsDto,
    actor: CurrentUserPayload
  ) {
    this.assertManager(actor);

    const programProjects = await this.prisma.dailyProgramProject.findMany({
      where: { dailyProgramId: programId },
      select: { id: true }
    });

    const knownIds = new Set(programProjects.map((item) => item.id));
    if (
      dto.orderedIds.length !== programProjects.length ||
      dto.orderedIds.some((id) => !knownIds.has(id))
    ) {
      throw new BadRequestException("Program siralamasi gecerli degil.");
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.dailyProgramProject.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );

    return this.getProgramByDate(
      (
        await this.prisma.dailyProgram.findUnique({
          where: { id: programId },
          select: { date: true }
        })
      )!.date.toISOString().slice(0, 10),
      actor
    );
  }

  async assignUsers(programProjectId: string, dto: AssignFieldUsersDto, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const programProject = await this.prisma.dailyProgramProject.findUnique({
      where: { id: programProjectId },
      include: {
        project: {
          select: { id: true, name: true, storageRoot: true }
        },
        dailyProgram: {
          select: { date: true }
        }
      }
    });
    if (!programProject) {
      throw new NotFoundException("Gunluk proje kaydi bulunamadi.");
    }

    const uniqueIds = [...new Set(dto.userIds)];
    const users = uniqueIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: uniqueIds },
            role: Role.FIELD
          }
        })
      : [];

    if (users.length !== uniqueIds.length) {
      throw new BadRequestException("Atama listesinde gecersiz saha personeli var.");
    }

    const existingAssignments = await this.prisma.projectAssignment.findMany({
      where: { dailyProgramProjectId: programProjectId }
    });

    await this.prisma.$transaction(async (tx) => {
      for (const assignment of existingAssignments) {
        const shouldBeActive = uniqueIds.includes(assignment.userId);
        if (assignment.isActive !== shouldBeActive) {
          await tx.projectAssignment.update({
            where: { id: assignment.id },
            data: { isActive: shouldBeActive }
          });
        }
      }

      for (const userId of uniqueIds) {
        const existing = existingAssignments.find((assignment) => assignment.userId === userId);
        if (!existing) {
          await tx.projectAssignment.create({
            data: {
              dailyProgramProjectId: programProjectId,
              userId,
              assignedById: actor.sub,
              isActive: true
            }
          });
        }
      }
    });

    if (uniqueIds.length) {
      await this.notificationsService.sendAssignmentNotice(actor, {
        userIds: uniqueIds,
        projectId: programProject.projectId,
        projectStorageRoot: programProject.project.storageRoot,
        projectName: programProject.project.name,
        targetDate: programProject.dailyProgram.date
      });
    }

    await this.storageService.appendProjectEvent({
      project: {
        id: programProject.projectId,
        storageRoot: programProject.project.storageRoot
      },
      actor,
      eventType: "PROJECT_ASSIGNMENTS_UPDATED",
      payload: {
        programProjectId,
        programDate: programProject.dailyProgram.date.toISOString().slice(0, 10),
        userIds: uniqueIds
      }
    });

    return this.prisma.projectAssignment.findMany({
      where: {
        dailyProgramProjectId: programProjectId,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
            isActive: true,
            createdAt: true
          }
        },
        workSessions: {
          where: { endedAt: null },
          orderBy: { startedAt: "desc" },
          take: 1
        },
        locationPings: {
          orderBy: { capturedAt: "desc" },
          take: 1,
          include: {
            actor: {
              select: {
                id: true,
                username: true,
                displayName: true,
                role: true
              }
            }
          }
        }
      }
    });
  }

  async workStart(
    assignmentId: string,
    dto: WorkSessionDto,
    actor: CurrentUserPayload,
    idempotencyKey?: string
  ) {
    return this.idempotencyService.execute({
      actorId: actor.sub,
      scope: `assignment:${assignmentId}:work-start`,
      key: idempotencyKey,
      action: async () => {
        if (actor.role !== "FIELD") {
          throw new ForbiddenException("Sadece saha personeli is basi yapabilir.");
        }

        const assignment = await this.getOwnAssignment(assignmentId, actor.sub);
        if (!assignment.isActive) {
          throw new BadRequestException("Bu atama artik aktif degil.");
        }

        const activeSession = await this.prisma.workSession.findFirst({
          where: {
            userId: actor.sub,
            endedAt: null
          },
          include: {
            assignment: {
              include: {
                dailyProgramProject: {
                  include: { project: true }
                }
              }
            }
          }
        });

        if (activeSession) {
          this.logger.warn("programs.work-start.conflict", {
            assignmentId,
            actorId: actor.sub,
            existingProjectName: activeSession.assignment.dailyProgramProject.project.name
          });
          throw new BadRequestException(
            `Aktif oturumunuz ${activeSession.assignment.dailyProgramProject.project.name} projesinde zaten acik.`
          );
        }

        const session = await this.prisma.$transaction(async (tx) => {
          const session = await tx.workSession.create({
            data: {
              assignmentId,
              userId: actor.sub,
              startedAt: new Date(),
              startedNote: dto.note?.trim(),
              startedLat: dto.latitude,
              startedLng: dto.longitude
            }
          });

          await tx.projectEntry.create({
            data: {
              projectId: assignment.dailyProgramProject.projectId,
              dailyProgramProjectId: assignment.dailyProgramProjectId,
              actorId: actor.sub,
              workSessionId: session.id,
              entryType: ProjectEntryType.WORK_START,
              note: dto.note?.trim(),
              entryDate: assignment.dailyProgramProject.dailyProgram.date
            }
          });

          if (dto.latitude !== undefined && dto.longitude !== undefined) {
            await tx.locationPing.create({
              data: {
                projectId: assignment.dailyProgramProject.projectId,
                assignmentId,
                workSessionId: session.id,
                actorId: actor.sub,
                latitude: dto.latitude,
                longitude: dto.longitude,
                source: "work-start"
              }
            });
          }

          return session;
        });

        await this.storageService.appendProjectEvent({
          project: {
            id: assignment.dailyProgramProject.projectId,
            storageRoot: assignment.dailyProgramProject.project.storageRoot
          },
          actor,
          eventType: "WORK_STARTED",
          payload: {
            assignmentId,
            sessionId: session.id,
            note: dto.note?.trim() || null
          }
        });

        if (dto.note?.trim()) {
          await this.storageService.appendProjectNote({
            project: {
              id: assignment.dailyProgramProject.projectId,
              storageRoot: assignment.dailyProgramProject.project.storageRoot
            },
            actor,
            note: dto.note.trim(),
            context: {
              assignmentId,
              sessionId: session.id,
              entryType: ProjectEntryType.WORK_START
            }
          });
        }

        return session;
      }
    });
  }

  async workEnd(
    assignmentId: string,
    dto: WorkSessionDto,
    actor: CurrentUserPayload,
    idempotencyKey?: string
  ) {
    return this.idempotencyService.execute({
      actorId: actor.sub,
      scope: `assignment:${assignmentId}:work-end`,
      key: idempotencyKey,
      action: async () => {
        if (actor.role !== "FIELD") {
          throw new ForbiddenException("Sadece saha personeli gun sonu yapabilir.");
        }

        const assignment = await this.getOwnAssignment(assignmentId, actor.sub, true);
        const activeSession = await this.prisma.workSession.findFirst({
          where: {
            assignmentId,
            userId: actor.sub,
            endedAt: null
          }
        });

        if (!activeSession) {
          this.logger.warn("programs.work-end.conflict", {
            assignmentId,
            actorId: actor.sub,
            reason: "missing-active-session"
          });
          throw new BadRequestException("Kapatilacak aktif oturum bulunamadi.");
        }

        const session = await this.prisma.$transaction(async (tx) => {
          const session = await tx.workSession.update({
            where: { id: activeSession.id },
            data: {
              endedAt: new Date(),
              endedNote: dto.note?.trim(),
              endedLat: dto.latitude,
              endedLng: dto.longitude
            }
          });

          await tx.projectEntry.create({
            data: {
              projectId: assignment.dailyProgramProject.projectId,
              dailyProgramProjectId: assignment.dailyProgramProjectId,
              actorId: actor.sub,
              workSessionId: session.id,
              entryType: ProjectEntryType.WORK_END,
              note: dto.note?.trim(),
              entryDate: assignment.dailyProgramProject.dailyProgram.date
            }
          });

          if (dto.latitude !== undefined && dto.longitude !== undefined) {
            await tx.locationPing.create({
              data: {
                projectId: assignment.dailyProgramProject.projectId,
                assignmentId,
                workSessionId: session.id,
                actorId: actor.sub,
                latitude: dto.latitude,
                longitude: dto.longitude,
                source: "work-end"
              }
            });
          }

          return session;
        });

        await this.storageService.appendProjectEvent({
          project: {
            id: assignment.dailyProgramProject.projectId,
            storageRoot: assignment.dailyProgramProject.project.storageRoot
          },
          actor,
          eventType: "WORK_ENDED",
          payload: {
            assignmentId,
            sessionId: session.id,
            note: dto.note?.trim() || null
          }
        });

        if (dto.note?.trim()) {
          await this.storageService.appendProjectNote({
            project: {
              id: assignment.dailyProgramProject.projectId,
              storageRoot: assignment.dailyProgramProject.project.storageRoot
            },
            actor,
            note: dto.note.trim(),
            context: {
              assignmentId,
              sessionId: session.id,
              entryType: ProjectEntryType.WORK_END
            }
          });
        }

        return session;
      }
    });
  }

  async createEntry(
    programProjectId: string,
    dto: CreateEntryDto,
    files: Express.Multer.File[] | undefined,
    actor: CurrentUserPayload,
    idempotencyKey?: string
  ) {
    return this.idempotencyService.execute({
      actorId: actor.sub,
      scope: `program-project:${programProjectId}:entry-create`,
      key: idempotencyKey,
      action: async () => {
        const programProject = await this.prisma.dailyProgramProject.findUnique({
          where: { id: programProjectId },
          include: {
            dailyProgram: true,
            project: true,
            assignments: true
          }
        });

        if (!programProject) {
          throw new NotFoundException("Gunluk proje kaydi bulunamadi.");
        }

        if (
          actor.role === "FIELD" &&
          !programProject.assignments.some((assignment) => assignment.userId === actor.sub && assignment.isActive)
        ) {
          throw new ForbiddenException("Bu kayda erisiminiz yok.");
        }

        if (!dto.note?.trim() && !files?.length) {
          throw new BadRequestException("Not veya dosya girmelisiniz.");
        }

        let stagedFiles: Awaited<ReturnType<ProjectsService["stageTimelineFiles"]>> = [];
        try {
          stagedFiles = files?.length
            ? await this.projectsService.stageTimelineFiles(
                { storageRoot: programProject.project.storageRoot },
                programProject.dailyProgram.date,
                files
              )
            : [];
        } finally {
          await cleanupUploadedTempFiles(files);
        }

        try {
          const entry = await this.prisma.$transaction(async (tx) => {
            const entry = await tx.projectEntry.create({
              data: {
                projectId: programProject.projectId,
                dailyProgramProjectId: programProjectId,
                actorId: actor.sub,
                entryType: this.resolveEntryType(actor.role, files),
                note: dto.note?.trim(),
                entryDate: programProject.dailyProgram.date
              }
            });

            if (stagedFiles.length) {
              await this.projectsService.createTimelineFiles(
                tx as unknown as PrismaService,
                entry.id,
                { id: programProject.projectId, storageRoot: programProject.project.storageRoot },
                actor.sub,
                stagedFiles
              );
            }

            return entry;
          });

          await this.storageService.appendProjectEvent({
            project: {
              id: programProject.projectId,
              storageRoot: programProject.project.storageRoot
            },
            actor,
            eventType: "PROJECT_ENTRY_CREATED",
            payload: {
              entryId: entry.id,
              entryType: entry.entryType,
              fileCount: stagedFiles.length,
              note: dto.note?.trim() || null
            }
          });

          if (dto.note?.trim()) {
            await this.storageService.appendProjectNote({
              project: {
                id: programProject.projectId,
                storageRoot: programProject.project.storageRoot
              },
              actor,
              note: dto.note.trim(),
              context: {
                entryId: entry.id,
                entryType: entry.entryType,
                fileCount: stagedFiles.length
              }
            });
          }

          return entry;
        } catch (error) {
          if (stagedFiles.length) {
            await this.projectsService.cleanupStagedTimelineFiles(
              stagedFiles,
              `${programProject.project.storageRoot}/timeline`
            );
          }
          throw error;
        }
      }
    });
  }

  async createLocationPing(
    assignmentId: string,
    dto: LocationPingDto,
    actor: CurrentUserPayload,
    idempotencyKey?: string
  ) {
    return this.idempotencyService.execute({
      actorId: actor.sub,
      scope: `assignment:${assignmentId}:location-ping`,
      key: idempotencyKey,
      action: async () => {
        if (actor.role !== "FIELD") {
          throw new ForbiddenException("Sadece saha personeli konum gonderebilir.");
        }

        const assignment = await this.getOwnAssignment(assignmentId, actor.sub, true);
        const activeSession = await this.prisma.workSession.findFirst({
          where: {
            assignmentId,
            userId: actor.sub,
            endedAt: null
          }
        });

        if (!activeSession) {
          this.logger.warn("programs.location-ping.rejected", {
            assignmentId,
            actorId: actor.sub,
            source: dto.source?.trim() || "watch",
            reason: "missing-active-session"
          });
          throw new BadRequestException("Konum icin acik oturum gerekli.");
        }

        const source = dto.source?.trim() || "watch";

        const ping = await this.prisma.locationPing.create({
          data: {
            projectId: assignment.dailyProgramProject.projectId,
            assignmentId,
            workSessionId: activeSession.id,
            actorId: actor.sub,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracy: dto.accuracy,
            source
          }
        });

        if (source !== "watch") {
          await this.prisma.projectEntry.create({
            data: {
              projectId: assignment.dailyProgramProject.projectId,
              dailyProgramProjectId: assignment.dailyProgramProjectId,
              actorId: actor.sub,
              workSessionId: activeSession.id,
              entryType: ProjectEntryType.LOCATION_EVENT,
              note: `${dto.latitude}, ${dto.longitude}`,
              entryDate: assignment.dailyProgramProject.dailyProgram.date
            }
          });
        }

        await this.storageService.appendProjectEvent({
          project: {
            id: assignment.dailyProgramProject.projectId,
            storageRoot: assignment.dailyProgramProject.project.storageRoot
          },
          actor,
          eventType: "LOCATION_RECORDED",
          payload: {
            assignmentId,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracy: dto.accuracy ?? null,
            source
          }
        });

        return ping;
      }
    });
  }

  private assertManager(actor: CurrentUserPayload) {
    if (actor.role !== "MANAGER") {
      throw new ForbiddenException("Bu islem icin yonetici yetkisi gerekli.");
    }
  }

  private mapProgramEntry(entry: {
    id: string;
    projectId: string;
    entryType: ProjectEntryType;
    note: string | null;
    entryDate: Date;
    createdAt: Date;
    actor: {
      id: string;
      username: string;
      displayName: string;
      role: Role;
    };
    files: Array<{
      versions: Array<{
        id: string;
        originalName: string;
        mimeType: string;
        extension: string;
        size: number;
        createdAt: Date;
      }>;
    }>;
  }) {
    return {
      id: entry.id,
      projectId: entry.projectId,
      entryType: entry.entryType,
      note: entry.note,
      entryDate: entry.entryDate.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      actor: entry.actor,
      files: entry.files
        .map((file) => file.versions[0])
        .filter(Boolean)
        .map((version) => ({
          id: version!.id,
          originalName: version!.originalName,
          mimeType: version!.mimeType,
          extension: version!.extension,
          size: version!.size,
          createdAt: version!.createdAt.toISOString(),
          downloadUrl: `/api/project-files/${version!.id}/download`,
          inlineUrl: isInlinePreviewable(version!.originalName)
            ? `/api/project-files/${version!.id}/download?inline=true`
            : undefined
        }))
    };
  }

  private async getOwnAssignment(assignmentId: string, userId: string, allowInactive = false) {
    const assignment = await this.prisma.projectAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        dailyProgramProject: {
          include: {
            dailyProgram: true,
            project: true
          }
        }
      }
    });

    if (!assignment || assignment.userId !== userId) {
      throw new NotFoundException("Atama bulunamadi.");
    }

    if (!allowInactive && !assignment.isActive) {
      throw new BadRequestException("Bu atama artik aktif degil.");
    }

    return assignment;
  }

  private resolveEntryType(role: "MANAGER" | "FIELD", files?: Express.Multer.File[]) {
    if (files?.length) {
      return files.every((file) => isImage(file.originalname))
        ? ProjectEntryType.IMAGE_UPLOAD
        : ProjectEntryType.FILE_UPLOAD;
    }

    return role === "MANAGER" ? ProjectEntryType.MANAGER_NOTE : ProjectEntryType.FIELD_NOTE;
  }
}
