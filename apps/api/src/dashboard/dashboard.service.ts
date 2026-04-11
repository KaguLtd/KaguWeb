import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  NotificationCampaignType,
  NotificationDeliveryStatus,
  Role
} from "@prisma/client";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { toDateOnly } from "../common/utils/date";
import { PrismaService } from "../prisma/prisma.service";
import { RoutingService } from "../routing/routing.service";
import { ProjectDurationReportQueryDto } from "./dto/project-duration-report-query.dto";

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService
  ) {}

  async getManagerOverview(actor: CurrentUserPayload, date?: string) {
    this.assertManager(actor);
    const selectedDate = date ?? new Date().toISOString().slice(0, 10);
    const dateOnly = toDateOnly(selectedDate);
    const rangeEnd = new Date(dateOnly);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    const jobExecution = (this.prisma as any).jobExecution;

    const [program, recentActivities, activeSessions, campaigns, fieldFormResponses, jobExecutions, routingRecommendations] =
      await Promise.all([
      this.prisma.dailyProgram.findUnique({
        where: { date: dateOnly },
        include: {
          programProjects: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true,
                  locationLabel: true,
                  customer: {
                    select: {
                      name: true
                    }
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
                  }
                }
              },
              entries: {
                select: {
                  id: true,
                  note: true,
                  createdAt: true,
                  files: {
                    select: {
                      id: true
                    }
                  }
                },
                orderBy: { createdAt: "desc" }
              }
            },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
          }
        }
      }),
      this.prisma.projectEntry.findMany({
        where: {
          dailyProgramProject: {
            dailyProgram: {
              date: dateOnly
            }
          }
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
          project: {
            select: {
              id: true,
              name: true
            }
          },
          files: {
            select: {
              id: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 16
      }),
      this.prisma.workSession.findMany({
        where: {
          endedAt: null,
          assignment: {
            dailyProgramProject: {
              dailyProgram: {
                date: dateOnly
              }
            }
          }
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
          assignment: {
            include: {
              dailyProgramProject: {
                include: {
                  project: {
                    include: {
                      customer: {
                        select: {
                          name: true
                        }
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
      this.prisma.notificationCampaign.findMany({
        where: {
          OR: [
            {
              type: NotificationCampaignType.DAILY_REMINDER,
              targetDate: dateOnly
            },
            {
              type: NotificationCampaignType.MANUAL,
              createdAt: {
                gte: dateOnly,
                lt: rangeEnd
              }
            }
          ]
        },
        include: {
          deliveries: {
            select: {
              status: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 12
      }),
      this.prisma.fieldFormResponse.findMany({
        where: {
          createdAt: {
            gte: dateOnly,
            lt: rangeEnd
          }
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
          project: {
            select: {
              id: true,
              name: true
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
          }
        },
        orderBy: { createdAt: "desc" },
        take: 12
      }),
      jobExecution.findMany({
        where: {
          OR: [
            {
              targetDate: dateOnly
            },
            {
              startedAt: {
                gte: dateOnly,
                lt: rangeEnd
              }
            }
          ]
        },
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
        orderBy: { startedAt: "desc" },
        take: 8
      }),
      this.routingService.getRecommendations(actor, { date: selectedDate })
    ]);

    const programProjects = (program?.programProjects ?? []).map((programProject) => {
      const noteCount = programProject.entries.filter((entry) => Boolean(entry.note?.trim())).length;
      const fileCount = programProject.entries.reduce(
        (total, entry) => total + entry.files.length,
        0
      );

      return {
        id: programProject.id,
        projectId: programProject.project.id,
        projectName: programProject.project.name,
        customerName: programProject.project.customer?.name ?? null,
        locationLabel: programProject.project.locationLabel,
        assignmentCount: programProject.assignments.length,
        activeSessionCount: programProject.assignments.filter(
          (assignment) => assignment.workSessions.length > 0
        ).length,
        noteCount,
        fileCount,
        latestActivityAt: programProject.entries[0]?.createdAt.toISOString() ?? null
      };
    });

    const notificationSummary = {
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        type: campaign.type,
        title: campaign.title,
        message: campaign.message,
        targetDate: campaign.targetDate?.toISOString().slice(0, 10) ?? null,
        createdAt: campaign.createdAt.toISOString(),
        deliveryCount: campaign.deliveries.length,
        sentCount: campaign.deliveries.filter(
          (delivery) => delivery.status === NotificationDeliveryStatus.SENT
        ).length,
        failedCount: campaign.deliveries.filter(
          (delivery) => delivery.status === NotificationDeliveryStatus.FAILED
        ).length
      })),
      totalCount: campaigns.length,
      sentCount: campaigns.reduce(
        (total, campaign) =>
          total +
          campaign.deliveries.filter(
            (delivery) => delivery.status === NotificationDeliveryStatus.SENT
          ).length,
        0
      ),
      failedCount: campaigns.reduce(
        (total, campaign) =>
          total +
          campaign.deliveries.filter(
            (delivery) => delivery.status === NotificationDeliveryStatus.FAILED
          ).length,
        0
      )
    };

    const fieldFormSummary = {
      totalCount: fieldFormResponses.length,
      uniqueTemplateCount: new Set(fieldFormResponses.map((response) => response.templateId)).size,
      uniqueProjectCount: new Set(fieldFormResponses.map((response) => response.projectId)).size,
      recentResponses: fieldFormResponses.map((response) => ({
        id: response.id,
        templateId: response.template.id,
        templateName: response.template.name,
        templateVersionId: response.templateVersion.id,
        templateVersionNumber: response.templateVersion.versionNumber,
        templateVersionTitle: response.templateVersion.title,
        projectId: response.project.id,
        projectName: response.project.name,
        actor: response.actor,
        createdAt: response.createdAt.toISOString()
      }))
    };

    const jobSummary = {
      totalCount: jobExecutions.length,
      runningCount: jobExecutions.filter((execution: any) => execution.status === "RUNNING").length,
      failedCount: jobExecutions.filter((execution: any) => execution.status === "FAILED").length,
      recentExecutions: jobExecutions.map((execution: any) => ({
        id: execution.id,
        jobName: execution.jobName,
        status: execution.status,
        triggerSource: execution.triggerSource,
        startedAt: execution.startedAt.toISOString(),
        targetDate: execution.targetDate?.toISOString().slice(0, 10) ?? null,
        actor: execution.actor
          ? {
              id: execution.actor.id,
              username: execution.actor.username,
              displayName: execution.actor.displayName,
              role: execution.actor.role
            }
          : null
        }))
    };

    const backupRestoreExecutions = jobExecutions.filter(
      (execution: any) => execution.jobName === "system.backup-restore-prepare"
    );
    const latestRestorePrepare = backupRestoreExecutions[0] as any | undefined;
    const latestRestoreSummary =
      latestRestorePrepare?.resultSummary && typeof latestRestorePrepare.resultSummary === "object"
        ? (latestRestorePrepare.resultSummary as Record<string, unknown>)
        : null;
    const latestRestoreMissingArtifacts = Array.isArray(latestRestoreSummary?.missingArtifacts)
      ? latestRestoreSummary?.missingArtifacts.filter(
          (value): value is string => typeof value === "string"
        )
      : [];

    const backupOpsSummary = {
      exportCount: jobExecutions.filter((execution: any) => execution.jobName === "system.backup-export")
        .length,
      restorePrepareCount: backupRestoreExecutions.length,
      latestRestorePrepare: latestRestorePrepare
        ? {
            id: latestRestorePrepare.id,
            startedAt: latestRestorePrepare.startedAt.toISOString(),
            status: latestRestorePrepare.status,
            integrityVerified:
              typeof latestRestoreSummary?.integrityVerified === "boolean"
                ? latestRestoreSummary.integrityVerified
                : null,
            inventoryVerified:
              typeof latestRestoreSummary?.inventoryVerified === "boolean"
                ? latestRestoreSummary.inventoryVerified
                : null,
            missingArtifactCount: latestRestoreMissingArtifacts.length
          }
        : null
    };

    return {
      selectedDate,
      summaryCards: {
        projectCount: programProjects.length,
        assignedFieldCount: new Set(
          (program?.programProjects ?? []).flatMap((programProject) =>
            programProject.assignments.map((assignment) => assignment.user.id)
          )
        ).size,
        openSessionCount: activeSessions.length,
        activityCount: (program?.programProjects ?? []).reduce(
          (total, programProject) => total + programProject.entries.length,
          0
        ),
        notificationCount: notificationSummary.totalCount
      },
      programProjects,
      recentActivities: recentActivities.map((entry) => ({
        id: entry.id,
        projectId: entry.project.id,
        projectName: entry.project.name,
        entryType: entry.entryType,
        note: entry.note,
        fileCount: entry.files.length,
        createdAt: entry.createdAt.toISOString(),
        actor: entry.actor
      })),
      activeSessions: activeSessions.map((session) => ({
        assignmentId: session.assignmentId,
        startedAt: session.startedAt.toISOString(),
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
          name: session.assignment.dailyProgramProject.project.name,
          customerName: session.assignment.dailyProgramProject.project.customer?.name ?? null
        }
      })),
      routingSummary: {
        routeMode: routingRecommendations.routeMode,
        anchor: routingRecommendations.anchor,
        recommendedStopCount: routingRecommendations.stops.length,
        skippedProjectCount: routingRecommendations.skippedProjects.length,
        topStops: routingRecommendations.stops.slice(0, 3).map((stop) => ({
          recommendationRank: stop.recommendationRank,
          projectId: stop.projectId,
          projectName: stop.projectName,
          assignmentCount: stop.assignmentCount,
          activeSessionCount: stop.activeSessionCount,
          distanceFromPreviousKm: stop.distanceFromPreviousKm
        }))
      },
      fieldFormSummary,
      jobSummary,
      backupOpsSummary,
      notificationSummary
    };
  }

  async exportManagerOverviewCsv(actor: CurrentUserPayload, date?: string) {
    const overview = await this.getManagerOverview(actor, date);
    const lines = [
      [
        "Tarih",
        "Proje",
        "Cari",
        "Konum Etiketi",
        "Atanan Saha Sayisi",
        "Aktif Oturum Sayisi",
        "Not Kaydi Sayisi",
        "Dosya Kaydi Sayisi",
        "Son Aktivite Zamani"
      ].join(",")
    ];

    for (const row of overview.programProjects) {
      lines.push(
        [
          overview.selectedDate,
          row.projectName,
          row.customerName,
          row.locationLabel,
          row.assignmentCount,
          row.activeSessionCount,
          row.noteCount,
          row.fileCount,
          row.latestActivityAt
        ]
          .map((value) => this.escapeCsv(value))
          .join(",")
      );
    }

    return `\uFEFF${lines.join("\n")}`;
  }

  async getProjectDurationReport(
    actor: CurrentUserPayload,
    query: ProjectDurationReportQueryDto
  ) {
    this.assertManager(actor);

    const reportRows = await this.prisma.dailyProgramProject.findMany({
      where: {
        projectId: query.projectId?.trim() || undefined
      },
      select: {
        projectId: true,
        dailyProgramId: true,
        assignments: {
          select: {
            userId: true
          }
        }
      },
      orderBy: [{ projectId: "asc" }, { createdAt: "asc" }]
    });

    if (!reportRows.length) {
      return [];
    }

    const projectIds = [...new Set(reportRows.map((row) => row.projectId))];
    const programIds = [...new Set(reportRows.map((row) => row.dailyProgramId))];

    const [projects, programs] = await Promise.all([
      this.prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true,
          name: true
        }
      }),
      this.prisma.dailyProgram.findMany({
        where: { id: { in: programIds } },
        select: {
          id: true,
          date: true
        }
      })
    ]);

    const projectMap = new Map(projects.map((project) => [project.id, project.name]));
    const programMap = new Map(programs.map((program) => [program.id, program.date]));

    const searchTerm = query.search?.trim().toLocaleLowerCase("tr-TR") ?? "";

    const map = new Map<
      string,
      {
        projectId: string;
        projectName: string;
        firstProgramDate: string;
        lastProgramDate: string;
        daySet: Set<string>;
        userSet: Set<string>;
      }
    >();

    for (const row of reportRows) {
      const projectName = projectMap.get(row.projectId);
      const programDate = programMap.get(row.dailyProgramId);
      if (!projectName || !programDate) {
        continue;
      }

      if (searchTerm && !projectName.toLocaleLowerCase("tr-TR").includes(searchTerm)) {
        continue;
      }

      const date = programDate.toISOString().slice(0, 10);
      const current = map.get(row.projectId);
      if (!current) {
        const userSet = new Set<string>();
        for (const assignment of row.assignments) {
          userSet.add(assignment.userId);
        }
        map.set(row.projectId, {
          projectId: row.projectId,
          projectName,
          firstProgramDate: date,
          lastProgramDate: date,
          daySet: new Set<string>([date]),
          userSet
        });
        continue;
      }

      current.daySet.add(date);
      if (date < current.firstProgramDate) {
        current.firstProgramDate = date;
      }
      if (date > current.lastProgramDate) {
        current.lastProgramDate = date;
      }
      for (const assignment of row.assignments) {
        current.userSet.add(assignment.userId);
      }
    }

    return [...map.values()]
      .map((item) => ({
        projectId: item.projectId,
        projectName: item.projectName,
        firstProgramDate: item.firstProgramDate,
        lastProgramDate: item.lastProgramDate,
        totalVisitDays: item.daySet.size,
        totalUniqueFieldUsers: item.userSet.size
      }))
      .sort((left, right) => left.projectName.localeCompare(right.projectName, "tr"));
  }

  private escapeCsv(value: string | number | null) {
    const normalized = value === null || value === undefined ? "" : String(value);
    return `"${normalized.replaceAll('"', '""')}"`;
  }

  private assertManager(actor: CurrentUserPayload) {
    if (actor.role !== Role.MANAGER) {
      throw new ForbiddenException("Bu islem icin yonetici yetkisi gerekli.");
    }
  }
}
