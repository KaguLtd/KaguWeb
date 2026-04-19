import { BadRequestException } from "@nestjs/common";
import { ProjectEntryType, Role } from "@prisma/client";
import { ProgramsService } from "../src/programs/programs.service";

describe("ProgramsService workflows", () => {
  const managerActor = {
    sub: "manager-1",
    username: "yonetici",
    displayName: "Ana Yonetici",
    role: Role.MANAGER
  };

  const fieldActor = {
    sub: "field-1",
    username: "saha-1",
    displayName: "Saha Personeli",
    role: Role.FIELD
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createProjectsServiceMock() {
    return {
      stageTimelineFiles: jest.fn(),
      createTimelineFiles: jest.fn(),
      cleanupStagedTimelineFiles: jest.fn()
    };
  }

  function createNotificationsServiceMock() {
    return {
      sendAssignmentNotice: jest.fn().mockResolvedValue(undefined)
    };
  }

  function createStorageServiceMock() {
    return {
      appendProjectEvent: jest.fn().mockResolvedValue(undefined),
      appendProjectNote: jest.fn().mockResolvedValue(undefined),
      appendProgramEvent: jest.fn().mockResolvedValue(undefined)
    };
  }

  function createIdempotencyServiceMock() {
    return {
      execute: jest.fn(async ({ action }) => action())
    };
  }

  function createLoggerMock() {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  }

  function createProgramTemplatesServiceMock() {
    return {
      seedDailyProgramForDate: jest.fn().mockResolvedValue(undefined),
      seedDailyProgramsForMonth: jest.fn().mockResolvedValue(undefined)
    };
  }

  it("rejects assignment lists that contain invalid field users", async () => {
    const prisma = {
      dailyProgramProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: "program-project-1",
          projectId: "project-1",
          project: {
            id: "project-1",
            name: "Merkez Santiye",
            storageRoot: "projects/merkez-santiye"
          },
          dailyProgram: {
            date: new Date("2026-04-10T00:00:00.000Z")
          }
        })
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "field-1",
            role: Role.FIELD
          }
        ])
      }
    };

    const service = new ProgramsService(
      prisma as never,
      createProjectsServiceMock() as never,
      createNotificationsServiceMock() as never,
      createStorageServiceMock() as never,
      createIdempotencyServiceMock() as never,
      createLoggerMock() as never,
      createProgramTemplatesServiceMock() as never
    );

    await expect(
      service.assignUsers(
        "program-project-1",
        {
          userIds: ["field-1", "missing-user"]
        },
        managerActor as never
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("normalizes assignment updates, sends notices, and audits the new assignment set", async () => {
    const txProjectAssignment = {
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined)
    };
    const prisma = {
      dailyProgramProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: "program-project-1",
          projectId: "project-1",
          project: {
            id: "project-1",
            name: "Merkez Santiye",
            storageRoot: "projects/merkez-santiye"
          },
          dailyProgram: {
            date: new Date("2026-04-10T00:00:00.000Z")
          }
        })
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: "field-1", role: Role.FIELD },
          { id: "field-2", role: Role.FIELD }
        ])
      },
      projectAssignment: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: "assignment-1", userId: "field-1", isActive: false },
            { id: "assignment-3", userId: "field-3", isActive: true }
          ])
          .mockResolvedValueOnce([
            {
              id: "assignment-1",
              user: {
                id: "field-1",
                username: "saha-1",
                displayName: "Saha Personeli",
                role: Role.FIELD,
                isActive: true,
                createdAt: new Date("2026-01-01T00:00:00.000Z")
              },
              workSessions: [],
              locationPings: []
            },
            {
              id: "assignment-2",
              user: {
                id: "field-2",
                username: "saha-2",
                displayName: "Ikinci Saha",
                role: Role.FIELD,
                isActive: true,
                createdAt: new Date("2026-01-02T00:00:00.000Z")
              },
              workSessions: [],
              locationPings: []
            }
          ])
      },
      $transaction: jest.fn(async (callback) =>
        callback({
          projectAssignment: txProjectAssignment
        })
      )
    };
    const notificationsService = createNotificationsServiceMock();
    const storageService = createStorageServiceMock();

    const service = new ProgramsService(
      prisma as never,
      createProjectsServiceMock() as never,
      notificationsService as never,
      storageService as never,
      createIdempotencyServiceMock() as never,
      createLoggerMock() as never,
      createProgramTemplatesServiceMock() as never
    );

    const result = await service.assignUsers(
      "program-project-1",
      {
        userIds: ["field-1", "field-2", "field-1"]
      },
      managerActor as never
    );

    expect(txProjectAssignment.update).toHaveBeenNthCalledWith(1, {
      where: { id: "assignment-1" },
      data: { isActive: true }
    });
    expect(txProjectAssignment.update).toHaveBeenNthCalledWith(2, {
      where: { id: "assignment-3" },
      data: { isActive: false }
    });
    expect(txProjectAssignment.create).toHaveBeenCalledWith({
      data: {
        dailyProgramProjectId: "program-project-1",
        userId: "field-2",
        assignedById: "manager-1",
        isActive: true
      }
    });
    expect(notificationsService.sendAssignmentNotice).toHaveBeenCalledWith(managerActor, {
      userIds: ["field-1", "field-2"],
      projectId: "project-1",
      projectStorageRoot: "projects/merkez-santiye",
      projectName: "Merkez Santiye",
      targetDate: new Date("2026-04-10T00:00:00.000Z")
    });
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/merkez-santiye"
      },
      actor: managerActor,
      eventType: "PROJECT_ASSIGNMENTS_UPDATED",
      payload: {
        programProjectId: "program-project-1",
        programDate: "2026-04-10",
        userIds: ["field-1", "field-2"]
      }
    });
    expect(result).toHaveLength(2);
  });

  it("rejects work start when another active session is already open", async () => {
    const prisma = {
      projectAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "assignment-1",
          userId: "field-1",
          isActive: true,
          dailyProgramProjectId: "program-project-1",
          dailyProgramProject: {
            projectId: "project-1",
            dailyProgram: {
              date: new Date("2026-04-10T00:00:00.000Z")
            },
            project: {
              id: "project-1",
              name: "Merkez Santiye",
              storageRoot: "projects/merkez-santiye"
            }
          }
        })
      },
      workSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: "session-open",
          assignment: {
            dailyProgramProject: {
              project: {
                name: "Baska Proje"
              }
            }
          }
        })
      },
      $transaction: jest.fn()
    };

    const logger = createLoggerMock();
    const service = new ProgramsService(
      prisma as never,
      createProjectsServiceMock() as never,
      createNotificationsServiceMock() as never,
      createStorageServiceMock() as never,
      createIdempotencyServiceMock() as never,
      logger as never,
      createProgramTemplatesServiceMock() as never
    );

    await expect(
      service.workStart(
        "assignment-1",
        {
          note: "Sahaya vardim"
        },
        fieldActor as never
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("programs.work-start.conflict", {
      assignmentId: "assignment-1",
      actorId: "field-1",
      existingProjectName: "Baska Proje"
    });
  });

  it("creates work start sessions, timeline entries, initial location pings, and audits notes", async () => {
    const tx = {
      workSession: {
        create: jest.fn().mockResolvedValue({
          id: "session-1",
          assignmentId: "assignment-1",
          userId: "field-1",
          startedAt: new Date("2026-04-10T08:00:00.000Z")
        })
      },
      projectEntry: {
        create: jest.fn().mockResolvedValue(undefined)
      },
      locationPing: {
        create: jest.fn().mockResolvedValue(undefined)
      }
    };
    const prisma = {
      projectAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "assignment-1",
          userId: "field-1",
          isActive: true,
          dailyProgramProjectId: "program-project-1",
          dailyProgramProject: {
            projectId: "project-1",
            dailyProgram: {
              date: new Date("2026-04-10T00:00:00.000Z")
            },
            project: {
              id: "project-1",
              storageRoot: "projects/merkez-santiye"
            }
          }
        })
      },
      workSession: {
        findFirst: jest.fn().mockResolvedValue(null)
      },
      $transaction: jest.fn(async (callback) => callback(tx))
    };
    const storageService = createStorageServiceMock();

    const service = new ProgramsService(
      prisma as never,
      createProjectsServiceMock() as never,
      createNotificationsServiceMock() as never,
      storageService as never,
      createIdempotencyServiceMock() as never,
      createLoggerMock() as never,
      createProgramTemplatesServiceMock() as never
    );

    const result = await service.workStart(
      "assignment-1",
      {
        note: "  Sahaya vardim ",
        latitude: 39.92,
        longitude: 32.85
      },
      fieldActor as never
    );

    expect(tx.workSession.create).toHaveBeenCalledWith({
      data: {
        assignmentId: "assignment-1",
        userId: "field-1",
        startedAt: expect.any(Date),
        startedNote: "Sahaya vardim",
        startedLat: 39.92,
        startedLng: 32.85
      }
    });
    expect(tx.projectEntry.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        dailyProgramProjectId: "program-project-1",
        actorId: "field-1",
        workSessionId: "session-1",
        entryType: ProjectEntryType.WORK_START,
        note: "Sahaya vardim",
        entryDate: new Date("2026-04-10T00:00:00.000Z")
      }
    });
    expect(tx.locationPing.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        assignmentId: "assignment-1",
        workSessionId: "session-1",
        actorId: "field-1",
        latitude: 39.92,
        longitude: 32.85,
        source: "work-start"
      }
    });
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/merkez-santiye"
      },
      actor: fieldActor,
      eventType: "WORK_STARTED",
      payload: {
        assignmentId: "assignment-1",
        sessionId: "session-1",
        note: "Sahaya vardim"
      }
    });
    expect(storageService.appendProjectNote).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/merkez-santiye"
      },
      actor: fieldActor,
      note: "Sahaya vardim",
      context: {
        assignmentId: "assignment-1",
        sessionId: "session-1",
        entryType: ProjectEntryType.WORK_START
      }
    });
    expect(result).toEqual({
      id: "session-1",
      assignmentId: "assignment-1",
      userId: "field-1",
      startedAt: new Date("2026-04-10T08:00:00.000Z")
    });
  });

  it("rejects work end when there is no open session for the assignment", async () => {
    const prisma = {
      projectAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "assignment-1",
          userId: "field-1",
          isActive: true,
          dailyProgramProjectId: "program-project-1",
          dailyProgramProject: {
            projectId: "project-1",
            dailyProgram: {
              date: new Date("2026-04-10T00:00:00.000Z")
            },
            project: {
              id: "project-1",
              storageRoot: "projects/merkez-santiye"
            }
          }
        })
      },
      workSession: {
        findFirst: jest.fn().mockResolvedValue(null)
      }
    };

    const logger = createLoggerMock();
    const service = new ProgramsService(
      prisma as never,
      createProjectsServiceMock() as never,
      createNotificationsServiceMock() as never,
      createStorageServiceMock() as never,
      createIdempotencyServiceMock() as never,
      logger as never,
      createProgramTemplatesServiceMock() as never
    );

    await expect(
      service.workEnd(
        "assignment-1",
        {
          note: "Mesai bitti"
        },
        fieldActor as never
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(logger.warn).toHaveBeenCalledWith("programs.work-end.conflict", {
      assignmentId: "assignment-1",
      actorId: "field-1",
      reason: "missing-active-session"
    });
  });

  it("closes work sessions, writes end entries, and audits end notes", async () => {
    const tx = {
      workSession: {
        update: jest.fn().mockResolvedValue({
          id: "session-1",
          assignmentId: "assignment-1",
          userId: "field-1",
          endedAt: new Date("2026-04-10T17:30:00.000Z")
        })
      },
      projectEntry: {
        create: jest.fn().mockResolvedValue(undefined)
      },
      locationPing: {
        create: jest.fn().mockResolvedValue(undefined)
      }
    };
    const prisma = {
      projectAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "assignment-1",
          userId: "field-1",
          isActive: false,
          dailyProgramProjectId: "program-project-1",
          dailyProgramProject: {
            projectId: "project-1",
            dailyProgram: {
              date: new Date("2026-04-10T00:00:00.000Z")
            },
            project: {
              id: "project-1",
              storageRoot: "projects/merkez-santiye"
            }
          }
        })
      },
      workSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: "session-1"
        })
      },
      $transaction: jest.fn(async (callback) => callback(tx))
    };
    const storageService = createStorageServiceMock();

    const service = new ProgramsService(
      prisma as never,
      createProjectsServiceMock() as never,
      createNotificationsServiceMock() as never,
      storageService as never,
      createIdempotencyServiceMock() as never,
      createLoggerMock() as never,
      createProgramTemplatesServiceMock() as never
    );

    const result = await service.workEnd(
      "assignment-1",
      {
        note: "  Mesai bitti ",
        latitude: 39.93,
        longitude: 32.86
      },
      fieldActor as never
    );

    expect(tx.workSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        endedAt: expect.any(Date),
        endedNote: "Mesai bitti",
        endedLat: 39.93,
        endedLng: 32.86
      }
    });
    expect(tx.projectEntry.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        dailyProgramProjectId: "program-project-1",
        actorId: "field-1",
        workSessionId: "session-1",
        entryType: ProjectEntryType.WORK_END,
        note: "Mesai bitti",
        entryDate: new Date("2026-04-10T00:00:00.000Z")
      }
    });
    expect(tx.locationPing.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        assignmentId: "assignment-1",
        workSessionId: "session-1",
        actorId: "field-1",
        latitude: 39.93,
        longitude: 32.86,
        source: "work-end"
      }
    });
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/merkez-santiye"
      },
      actor: fieldActor,
      eventType: "WORK_ENDED",
      payload: {
        assignmentId: "assignment-1",
        sessionId: "session-1",
        note: "Mesai bitti"
      }
    });
    expect(storageService.appendProjectNote).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/merkez-santiye"
      },
      actor: fieldActor,
      note: "Mesai bitti",
      context: {
        assignmentId: "assignment-1",
        sessionId: "session-1",
        entryType: ProjectEntryType.WORK_END
      }
    });
    expect(result).toEqual({
      id: "session-1",
      assignmentId: "assignment-1",
      userId: "field-1",
      endedAt: new Date("2026-04-10T17:30:00.000Z")
    });
  });
});
