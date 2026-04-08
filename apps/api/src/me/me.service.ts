import { Injectable } from "@nestjs/common";
import { FileScope } from "@prisma/client";
import { FieldAssignedProjectSummary } from "@kagu/contracts";
import { toDateOnly } from "../common/utils/date";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getAssignedProgramProjects(userId: string) {
    const today = toDateOnly(new Date());
    const assignments = await this.prisma.projectAssignment.findMany({
      where: {
        userId,
        isActive: true,
        dailyProgramProject: {
          dailyProgram: {
            date: today
          }
        }
      },
      include: {
        dailyProgramProject: {
          include: {
            dailyProgram: true,
            project: {
              include: {
                customer: true,
                files: {
                  where: { scope: FileScope.MAIN },
                  include: {
                    versions: {
                      orderBy: { versionNumber: "desc" },
                      take: 1
                    },
                    _count: {
                      select: {
                        versions: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        workSessions: {
          where: { endedAt: null },
          orderBy: { startedAt: "desc" },
          take: 1
        }
      },
      orderBy: {
        dailyProgramProject: {
          dailyProgram: {
            date: "desc"
          }
        }
      }
    });

    return assignments.map<FieldAssignedProjectSummary>((assignment) => ({
      assignmentId: assignment.id,
      dailyProgramProjectId: assignment.dailyProgramProjectId,
      dailyProgramId: assignment.dailyProgramProject.dailyProgramId,
      dailyProgramDate: assignment.dailyProgramProject.dailyProgram.date.toISOString(),
      projectId: assignment.dailyProgramProject.projectId,
      projectName: assignment.dailyProgramProject.project.name,
      projectCode: assignment.dailyProgramProject.project.code,
      description: assignment.dailyProgramProject.project.description,
      customerName: assignment.dailyProgramProject.project.customer?.name ?? null,
      locationLabel: assignment.dailyProgramProject.project.locationLabel,
      latitude: assignment.dailyProgramProject.project.latitude,
      longitude: assignment.dailyProgramProject.project.longitude,
      activeSession: assignment.workSessions[0]
        ? {
            id: assignment.workSessions[0].id,
            startedAt: assignment.workSessions[0].startedAt.toISOString(),
            endedAt: null
          }
        : null,
      mainFiles: assignment.dailyProgramProject.project.files
        .filter((file) => file.versions.length > 0)
        .map((file) => ({
          id: file.id,
          title: file.title,
          scope: file.scope,
          versionCount: file._count.versions,
          latestVersion: {
            id: file.versions[0].id,
            versionNumber: file.versions[0].versionNumber,
            originalName: file.versions[0].originalName,
            mimeType: file.versions[0].mimeType,
            extension: file.versions[0].extension,
            size: file.versions[0].size,
            createdAt: file.versions[0].createdAt.toISOString(),
            downloadUrl: `/api/project-files/${file.versions[0].id}/download`,
            inlineUrl: `/api/project-files/${file.versions[0].id}/download?inline=1`
          }
        }))
    }));
  }
}
