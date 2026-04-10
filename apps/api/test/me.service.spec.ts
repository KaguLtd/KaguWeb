import { FileScope } from "@prisma/client";
import { MeService } from "../src/me/me.service";

describe("MeService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-10T09:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("returns today's active field assignments with latest main file metadata", async () => {
    const prisma = {
      projectAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "assignment-1",
            dailyProgramProjectId: "program-project-1",
            dailyProgramProject: {
              dailyProgramId: "program-1",
              dailyProgram: {
                date: new Date("2026-04-10T00:00:00.000Z")
              },
              projectId: "project-1",
              project: {
                name: "Merkez Santiye",
                code: "PRJ-001",
                description: "Ana saha",
                customer: {
                  name: "Merkez Holding"
                },
                locationLabel: "Ankara",
                latitude: 39.92,
                longitude: 32.85,
                files: [
                  {
                    id: "file-1",
                    title: "Teklif",
                    scope: FileScope.MAIN,
                    _count: {
                      versions: 2
                    },
                    versions: [
                      {
                        id: "version-1",
                        versionNumber: 2,
                        originalName: "teklif.pdf",
                        mimeType: "application/pdf",
                        extension: ".pdf",
                        size: 1024,
                        createdAt: new Date("2026-04-09T12:00:00.000Z")
                      }
                    ]
                  },
                  {
                    id: "file-empty",
                    title: "Bos",
                    scope: FileScope.MAIN,
                    _count: {
                      versions: 0
                    },
                    versions: []
                  }
                ]
              }
            },
            workSessions: [
              {
                id: "session-1",
                startedAt: new Date("2026-04-10T08:00:00.000Z")
              }
            ]
          }
        ])
      }
    };

    const service = new MeService(prisma as never);

    const result = await service.getAssignedProgramProjects("field-1");

    expect(prisma.projectAssignment.findMany).toHaveBeenCalledWith({
      where: {
        userId: "field-1",
        isActive: true,
        dailyProgramProject: {
          dailyProgram: {
            date: new Date("2026-04-10T00:00:00.000Z")
          }
        }
      },
      include: expect.any(Object),
      orderBy: {
        dailyProgramProject: {
          dailyProgram: {
            date: "desc"
          }
        }
      }
    });
    expect(result).toEqual([
      {
        assignmentId: "assignment-1",
        dailyProgramProjectId: "program-project-1",
        dailyProgramId: "program-1",
        dailyProgramDate: "2026-04-10T00:00:00.000Z",
        projectId: "project-1",
        projectName: "Merkez Santiye",
        projectCode: "PRJ-001",
        description: "Ana saha",
        customerName: "Merkez Holding",
        locationLabel: "Ankara",
        latitude: 39.92,
        longitude: 32.85,
        activeSession: {
          id: "session-1",
          startedAt: "2026-04-10T08:00:00.000Z",
          endedAt: null
        },
        mainFiles: [
          {
            id: "file-1",
            title: "Teklif",
            scope: FileScope.MAIN,
            versionCount: 2,
            latestVersion: {
              id: "version-1",
              versionNumber: 2,
              originalName: "teklif.pdf",
              mimeType: "application/pdf",
              extension: ".pdf",
              size: 1024,
              createdAt: "2026-04-09T12:00:00.000Z",
              downloadUrl: "/api/project-files/version-1/download",
              inlineUrl: "/api/project-files/version-1/download?inline=1"
            }
          }
        ]
      }
    ]);
  });
});
