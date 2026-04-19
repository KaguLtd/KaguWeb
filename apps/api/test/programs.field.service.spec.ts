import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ProjectEntryType, Role } from "@prisma/client";
import { ProgramsService } from "../src/programs/programs.service";

describe("ProgramsService field flows", () => {
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
      sendAssignmentNotice: jest.fn()
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

  it("rejects field entry creation when the actor is not assigned to the program project", async () => {
    const prisma = {
      dailyProgramProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: "program-project-1",
          projectId: "project-1",
          dailyProgram: {
            date: new Date("2026-04-10T00:00:00.000Z")
          },
          project: {
            id: "project-1",
            storageRoot: "projects/merkez-santiye"
          },
          assignments: [
            {
              userId: "field-2",
              isActive: true
            }
          ]
        })
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
      service.createEntry(
        "program-project-1",
        {
          note: "Yetkisiz not"
        },
        undefined,
        fieldActor as never
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates note-only field entries and audits the note payload", async () => {
    const tx = {
      projectEntry: {
        create: jest.fn().mockResolvedValue({
          id: "entry-1",
          entryType: ProjectEntryType.FIELD_NOTE
        })
      }
    };
    const prisma = {
      dailyProgramProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: "program-project-1",
          projectId: "project-1",
          dailyProgram: {
            date: new Date("2026-04-10T00:00:00.000Z")
          },
          project: {
            id: "project-1",
            storageRoot: "projects/merkez-santiye"
          },
          assignments: [
            {
              userId: "field-1",
              isActive: true
            }
          ]
        })
      },
      $transaction: jest.fn(async (callback) => callback(tx))
    };
    const projectsService = createProjectsServiceMock();
    const storageService = createStorageServiceMock();

    const service = new ProgramsService(
      prisma as never,
      projectsService as never,
      createNotificationsServiceMock() as never,
      storageService as never,
      createIdempotencyServiceMock() as never,
      createLoggerMock() as never,
      createProgramTemplatesServiceMock() as never
    );

    const result = await service.createEntry(
      "program-project-1",
      {
        note: "  Saha notu girildi "
      },
      undefined,
      fieldActor as never
    );

    expect(tx.projectEntry.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        dailyProgramProjectId: "program-project-1",
        actorId: "field-1",
        entryType: ProjectEntryType.FIELD_NOTE,
        note: "Saha notu girildi",
        entryDate: new Date("2026-04-10T00:00:00.000Z")
      }
    });
    expect(projectsService.stageTimelineFiles).not.toHaveBeenCalled();
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/merkez-santiye"
      },
      actor: fieldActor,
      eventType: "PROJECT_ENTRY_CREATED",
      payload: {
        entryId: "entry-1",
        entryType: ProjectEntryType.FIELD_NOTE,
        fileCount: 0,
        note: "Saha notu girildi"
      }
    });
    expect(storageService.appendProjectNote).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/merkez-santiye"
      },
      actor: fieldActor,
      note: "Saha notu girildi",
      context: {
        entryId: "entry-1",
        entryType: ProjectEntryType.FIELD_NOTE,
        fileCount: 0
      }
    });
    expect(result).toEqual({
      id: "entry-1",
      entryType: ProjectEntryType.FIELD_NOTE
    });
  });

  it("requires an open session before accepting watch pings", async () => {
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
      service.createLocationPing(
        "assignment-1",
        {
          latitude: 39.92,
          longitude: 32.85
        },
        fieldActor as never
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(logger.warn).toHaveBeenCalledWith("programs.location-ping.rejected", {
      assignmentId: "assignment-1",
      actorId: "field-1",
      source: "watch",
      reason: "missing-active-session"
    });
  });

  it("stores watch pings without creating an extra location event entry", async () => {
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
        findFirst: jest.fn().mockResolvedValue({
          id: "session-1"
        })
      },
      locationPing: {
        create: jest.fn().mockResolvedValue({
          id: "ping-1",
          source: "watch"
        })
      },
      projectEntry: {
        create: jest.fn()
      }
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

    const result = await service.createLocationPing(
      "assignment-1",
      {
        latitude: 39.92,
        longitude: 32.85
      },
      fieldActor as never
    );

    expect(prisma.locationPing.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        assignmentId: "assignment-1",
        workSessionId: "session-1",
        actorId: "field-1",
        latitude: 39.92,
        longitude: 32.85,
        accuracy: undefined,
        source: "watch"
      }
    });
    expect(prisma.projectEntry.create).not.toHaveBeenCalled();
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/merkez-santiye"
      },
      actor: fieldActor,
      eventType: "LOCATION_RECORDED",
      payload: {
        assignmentId: "assignment-1",
        latitude: 39.92,
        longitude: 32.85,
        accuracy: null,
        source: "watch"
      }
    });
    expect(result).toEqual({
      id: "ping-1",
      source: "watch"
    });
  });

  it("records manual location pings as timeline location events", async () => {
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
        findFirst: jest.fn().mockResolvedValue({
          id: "session-1"
        })
      },
      locationPing: {
        create: jest.fn().mockResolvedValue({
          id: "ping-2",
          source: "manual"
        })
      },
      projectEntry: {
        create: jest.fn().mockResolvedValue(undefined)
      }
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

    const result = await service.createLocationPing(
      "assignment-1",
      {
        latitude: 39.93,
        longitude: 32.86,
        accuracy: 11,
        source: "manual"
      },
      fieldActor as never
    );

    expect(prisma.projectEntry.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        dailyProgramProjectId: "program-project-1",
        actorId: "field-1",
        workSessionId: "session-1",
        entryType: ProjectEntryType.LOCATION_EVENT,
        note: "39.93, 32.86",
        entryDate: new Date("2026-04-10T00:00:00.000Z")
      }
    });
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/merkez-santiye"
      },
      actor: fieldActor,
      eventType: "LOCATION_RECORDED",
      payload: {
        assignmentId: "assignment-1",
        latitude: 39.93,
        longitude: 32.86,
        accuracy: 11,
        source: "manual"
      }
    });
    expect(result).toEqual({
      id: "ping-2",
      source: "manual"
    });
  });
});
