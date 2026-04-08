import { ForbiddenException, Injectable } from "@nestjs/common";
import { FileScope, Role } from "@prisma/client";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { toDateOnly } from "../common/utils/date";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  private buildDateRange(date?: string) {
    if (!date) {
      return null;
    }

    const start = new Date(`${toDateOnly(date).toISOString().slice(0, 10)}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return { start, end };
  }

  async getOverview(
    actor: CurrentUserPayload,
    filters: { date?: string; projectId?: string; userId?: string }
  ) {
    this.assertManager(actor);

    const range = this.buildDateRange(filters.date);
    const locationWhere = this.buildLocationWhere(filters);
    const sessionWhere = {
      endedAt: null as null,
      startedAt: range ? { lt: range.end } : undefined,
      assignment: {
        userId: filters.userId,
        dailyProgramProject: {
          projectId: filters.projectId
        }
      }
    };

    const [activeSessions, recentLocations, projectLocations] = await Promise.all([
      this.prisma.workSession.findMany({
        where: sessionWhere,
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
          assignment: {
            include: {
              dailyProgramProject: {
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
                  }
                }
              }
            }
          }
        },
        orderBy: { startedAt: "asc" }
      }),
      this.prisma.locationPing.findMany({
        where: locationWhere,
        include: {
          actor: {
            select: {
              id: true,
              username: true,
              displayName: true,
              role: true
            }
          }
        },
        orderBy: { capturedAt: "desc" },
        take: 120
      }),
      this.prisma.project.findMany({
        where: {
          id: filters.projectId,
          latitude: { not: null },
          longitude: { not: null },
          programProjects: filters.date
            ? {
                some: {
                  dailyProgram: { date: toDateOnly(filters.date) }
                }
              }
            : undefined
        },
        select: {
          id: true,
          name: true,
          locationLabel: true,
          latitude: true,
          longitude: true
        },
        orderBy: { name: "asc" }
      })
    ]);

    return {
      selectedDate: filters.date ?? null,
      activeSessions: activeSessions.map((session) => ({
        assignmentId: session.assignmentId,
        user: {
          id: session.user.id,
          username: session.user.username,
          displayName: session.user.displayName,
          role: session.user.role,
          isActive: session.user.isActive,
          createdAt: session.user.createdAt.toISOString(),
          assignmentCount: undefined,
          openSessionCount: 1,
          subscriptionCount: undefined
        },
        project: {
          id: session.assignment.dailyProgramProject.project.id,
          code: session.assignment.dailyProgramProject.project.code,
          name: session.assignment.dailyProgramProject.project.name,
          description: session.assignment.dailyProgramProject.project.description,
          locationLabel: session.assignment.dailyProgramProject.project.locationLabel,
          latitude: session.assignment.dailyProgramProject.project.latitude,
          longitude: session.assignment.dailyProgramProject.project.longitude,
          isArchived: session.assignment.dailyProgramProject.project.isArchived,
          storageRoot: session.assignment.dailyProgramProject.project.storageRoot,
          createdAt: session.assignment.dailyProgramProject.project.createdAt.toISOString(),
          updatedAt: session.assignment.dailyProgramProject.project.updatedAt.toISOString(),
          customer: session.assignment.dailyProgramProject.project.customer
            ? {
                id: session.assignment.dailyProgramProject.project.customer.id,
                name: session.assignment.dailyProgramProject.project.customer.name,
                note: session.assignment.dailyProgramProject.project.customer.note,
                isArchived: session.assignment.dailyProgramProject.project.customer.isArchived
              }
            : null,
          mainFileCount: session.assignment.dailyProgramProject.project.files.length,
          programUsageCount: session.assignment.dailyProgramProject.project.programProjects.length,
          timelineEntryCount: session.assignment.dailyProgramProject.project._count.entries
        },
        startedAt: session.startedAt.toISOString()
      })),
      recentLocations: recentLocations.map((location) => ({
        id: location.id,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        capturedAt: location.capturedAt.toISOString(),
        actor: location.actor,
        projectId: location.projectId,
        source: location.source
      })),
      projectLocations: projectLocations.map((project) => ({
        projectId: project.id,
        projectName: project.name,
        locationLabel: project.locationLabel,
        latitude: project.latitude!,
        longitude: project.longitude!
      }))
    };
  }

  async getHistory(
    actor: CurrentUserPayload,
    filters: { date?: string; projectId?: string; userId?: string }
  ) {
    this.assertManager(actor);
    const history = await this.prisma.locationPing.findMany({
      where: this.buildLocationWhere(filters),
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true
          }
        }
      },
      orderBy: { capturedAt: "asc" },
      take: 500
    });

    return history.map((location) => ({
      id: location.id,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      capturedAt: location.capturedAt.toISOString(),
      actor: location.actor,
      projectId: location.projectId,
      source: location.source
    }));
  }

  async getProjectLocations(actor: CurrentUserPayload, date?: string) {
    this.assertManager(actor);
    const projects = await this.prisma.project.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        programProjects: date
          ? {
              some: {
                dailyProgram: { date: toDateOnly(date) }
              }
            }
          : undefined
      },
      select: {
        id: true,
        name: true,
        locationLabel: true,
        latitude: true,
        longitude: true
      },
      orderBy: { name: "asc" }
    });

    return projects.map((project) => ({
      projectId: project.id,
      projectName: project.name,
      locationLabel: project.locationLabel,
      latitude: project.latitude!,
      longitude: project.longitude!
    }));
  }

  private buildLocationWhere(filters: { date?: string; projectId?: string; userId?: string }) {
    const range = this.buildDateRange(filters.date);
    return {
      projectId: filters.projectId,
      actorId: filters.userId,
      capturedAt: range
        ? {
            gte: range.start,
            lt: range.end
          }
        : undefined
    };
  }

  private assertManager(actor: CurrentUserPayload) {
    if (actor.role !== Role.MANAGER) {
      throw new ForbiddenException("Bu islem icin yonetici yetkisi gerekli.");
    }
  }
}
