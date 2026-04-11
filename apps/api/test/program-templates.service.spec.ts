import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { RecurrenceFrequency, Role } from "@prisma/client";
import { ProgramTemplatesService } from "../src/program-templates/program-templates.service";

describe("ProgramTemplatesService", () => {
  const managerActor = {
    sub: "manager-1",
    username: "yonetici",
    displayName: "Ana Yonetici",
    role: Role.MANAGER
  };

  function createPrismaMock() {
    const prisma: Record<string, any> = {
      project: {
        findMany: jest.fn()
      },
      user: {
        findMany: jest.fn()
      },
      programTemplate: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn()
      },
      programTemplateRecurrenceRule: {
        deleteMany: jest.fn(),
        create: jest.fn()
      },
      programTemplateProject: {
        deleteMany: jest.fn(),
        create: jest.fn()
      },
      dailyProgram: {
        findUnique: jest.fn(),
        upsert: jest.fn()
      },
      dailyProgramProject: {
        findUnique: jest.fn(),
        upsert: jest.fn()
      },
      projectAssignment: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      $transaction: jest.fn(async (callback: (tx: Record<string, any>) => Promise<unknown>) =>
        callback(prisma)
      )
    };

    return prisma;
  }

  function createStorageServiceMock() {
    return {
      appendSystemEvent: jest.fn().mockResolvedValue(undefined),
      appendProjectEvent: jest.fn().mockResolvedValue(undefined),
      appendProgramEvent: jest.fn().mockResolvedValue(undefined)
    };
  }

  function createLoggerMock() {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  }

  function createJobsServiceMock() {
    return {
      run: jest.fn(async ({ action }) => action())
    };
  }

  it("creates weekly program templates with ordered projects and assignments", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const jobsService = createJobsServiceMock();

    prisma.project.findMany.mockResolvedValue([{ id: "project-1" }, { id: "project-2" }]);
    prisma.user.findMany.mockResolvedValue([{ id: "field-1" }, { id: "field-2" }]);
    prisma.programTemplate.create.mockResolvedValue({
      id: "template-1",
      name: "Haftalik servis",
      managerNote: "Sabah cikisi",
      isActive: true,
      createdAt: new Date("2026-04-10T08:00:00.000Z"),
      updatedAt: new Date("2026-04-10T08:00:00.000Z"),
      recurrenceRules: [
        {
          frequency: RecurrenceFrequency.WEEKLY,
          weekdays: [1, 3, 5],
          startDate: new Date("2026-04-13T00:00:00.000Z"),
          endDate: null
        }
      ],
      templateProjects: [
        {
          assignments: [{}, {}]
        },
        {
          assignments: []
        }
      ]
    });

    const service = new ProgramTemplatesService(
      prisma as never,
      storageService as never,
      jobsService as never,
      createLoggerMock() as never
    );

    const result = await service.create(
      {
        name: " Haftalik servis ",
        managerNote: " Sabah cikisi ",
        rule: {
          startDate: "2026-04-13",
          weekdays: [5, 1, 3, 3]
        },
        projects: [
          {
            projectId: "project-1",
            note: " On kontrol ",
            userIds: ["field-1", "field-2", "field-1"]
          },
          {
            projectId: "project-2",
            userIds: []
          }
        ]
      },
      managerActor as never
    );

    expect(prisma.programTemplate.create).toHaveBeenCalledWith({
      data: {
        name: "Haftalik servis",
        managerNote: "Sabah cikisi",
        isActive: true,
        createdById: "manager-1",
        recurrenceRules: {
          create: {
            frequency: RecurrenceFrequency.WEEKLY,
            interval: 1,
            weekdays: [1, 3, 5],
            startDate: new Date("2026-04-13T00:00:00.000Z"),
            endDate: null
          }
        },
        templateProjects: {
          create: [
            {
              projectId: "project-1",
              sortOrder: 0,
              note: "On kontrol",
              assignments: {
                create: [{ userId: "field-1" }, { userId: "field-2" }]
              }
            },
            {
              projectId: "project-2",
              sortOrder: 1,
              note: null,
              assignments: {
                create: []
              }
            }
          ]
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
    expect(storageService.appendSystemEvent).toHaveBeenCalledWith({
      actor: managerActor,
      eventType: "PROGRAM_TEMPLATE_CREATED",
      payload: {
        templateId: "template-1",
        name: "Haftalik servis",
        projectCount: 2
      }
    });
    expect(result).toEqual({
      id: "template-1",
      name: "Haftalik servis",
      managerNote: "Sabah cikisi",
      isActive: true,
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      rule: {
        frequency: RecurrenceFrequency.WEEKLY,
        weekdays: [1, 3, 5],
        startDate: "2026-04-13",
        endDate: null
      },
      projectCount: 2,
      assignmentCount: 2
    });
  });

  it("materializes matching templates without removing manual assignments", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const jobsService = createJobsServiceMock();

    prisma.programTemplate.findUnique.mockResolvedValue({
      id: "template-1",
      name: "Pazartesi rota",
      managerNote: "Sabah plan",
      isActive: true,
      recurrenceRules: [
        {
          frequency: RecurrenceFrequency.WEEKLY,
          weekdays: [1],
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          endDate: null
        }
      ],
      templateProjects: [
        {
          projectId: "project-1",
          sortOrder: 0,
          project: {
            id: "project-1",
            storageRoot: "projects/project-1",
            name: "Merkez"
          },
          assignments: [
            {
              userId: "field-1",
              user: {
                id: "field-1",
                role: Role.FIELD,
                isActive: true
              }
            }
          ]
        }
      ]
    });
    prisma.dailyProgram.upsert.mockResolvedValue({
      id: "program-1"
    });
    prisma.dailyProgramProject.findUnique.mockResolvedValue(null);
    prisma.dailyProgramProject.upsert.mockResolvedValue({
      id: "program-project-1"
    });
    prisma.projectAssignment.findMany.mockResolvedValue([
      { id: "assignment-1", userId: "field-1", isActive: false },
      { id: "assignment-manual", userId: "field-9", isActive: true }
    ]);

    const service = new ProgramTemplatesService(
      prisma as never,
      storageService as never,
      jobsService as never,
      createLoggerMock() as never
    );

    const result = await service.materialize(
      "template-1",
      { date: "2026-04-13" },
      managerActor as never
    );

    expect(prisma.dailyProgram.upsert).toHaveBeenCalledWith({
      where: { date: new Date("2026-04-13T00:00:00.000Z") },
      update: {},
      create: {
        date: new Date("2026-04-13T00:00:00.000Z"),
        createdById: "manager-1",
        managerNote: "Sabah plan"
      }
    });
    expect(jobsService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: "program-templates.materialize",
        triggerSource: "api",
        scope: "program-template:template-1",
        targetDate: new Date("2026-04-13T00:00:00.000Z")
      })
    );
    expect(prisma.projectAssignment.update).toHaveBeenCalledWith({
      where: { id: "assignment-1" },
      data: { isActive: true }
    });
    expect(prisma.projectAssignment.create).not.toHaveBeenCalled();
    expect(storageService.appendProgramEvent).toHaveBeenCalledWith({
      programDate: new Date("2026-04-13T00:00:00.000Z"),
      actor: managerActor,
      eventType: "PROGRAM_TEMPLATE_MATERIALIZED",
      payload: {
        templateId: "template-1",
        templateName: "Pazartesi rota",
        targetDate: "2026-04-13",
        dailyProgramId: "program-1",
        projectCount: 1,
        createdProjectCount: 1,
        createdAssignmentCount: 0
      }
    });
    expect(result).toEqual({
      templateId: "template-1",
      dailyProgramId: "program-1",
      date: "2026-04-13",
      projectCount: 1,
      createdProjectCount: 1,
      createdAssignmentCount: 0
    });
  });

  it("returns template detail with ordered projects and assignment users", async () => {
    const prisma = createPrismaMock();

    prisma.programTemplate.findUnique.mockResolvedValue({
      id: "template-1",
      name: "Haftalik servis",
      managerNote: "Sabah cikisi",
      isActive: true,
      createdAt: new Date("2026-04-10T08:00:00.000Z"),
      updatedAt: new Date("2026-04-10T09:00:00.000Z"),
      recurrenceRules: [
        {
          frequency: RecurrenceFrequency.WEEKLY,
          weekdays: [1, 3, 5],
          startDate: new Date("2026-04-13T00:00:00.000Z"),
          endDate: null
        }
      ],
      templateProjects: [
        {
          id: "template-project-1",
          projectId: "project-1",
          sortOrder: 0,
          note: "On kontrol",
          project: {
            id: "project-1",
            code: "PRJ-1",
            name: "Merkez",
            isArchived: false
          },
          assignments: [
            {
              userId: "field-1",
              user: {
                id: "field-1",
                username: "saha-1",
                displayName: "Saha Bir",
                role: Role.FIELD,
                isActive: true
              }
            }
          ]
        }
      ]
    });

    const service = new ProgramTemplatesService(
      prisma as never,
      createStorageServiceMock() as never,
      createJobsServiceMock() as never,
      createLoggerMock() as never
    );

    const result = await service.getOne("template-1", managerActor as never);

    expect(result).toEqual({
      id: "template-1",
      name: "Haftalik servis",
      managerNote: "Sabah cikisi",
      isActive: true,
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T09:00:00.000Z",
      rule: {
        frequency: RecurrenceFrequency.WEEKLY,
        weekdays: [1, 3, 5],
        startDate: "2026-04-13",
        endDate: null
      },
      projects: [
        {
          id: "template-project-1",
          sortOrder: 0,
          note: "On kontrol",
          project: {
            id: "project-1",
            code: "PRJ-1",
            name: "Merkez",
            isArchived: false
          },
          assignments: [
            {
              user: {
                id: "field-1",
                username: "saha-1",
                displayName: "Saha Bir",
                role: Role.FIELD,
                isActive: true
              }
            }
          ]
        }
      ]
    });
  });

  it("previews materialization actions without mutating the target day", async () => {
    const prisma = createPrismaMock();

    prisma.programTemplate.findUnique.mockResolvedValue({
      id: "template-1",
      recurrenceRules: [
        {
          frequency: RecurrenceFrequency.WEEKLY,
          weekdays: [1],
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          endDate: null
        }
      ],
      templateProjects: [
        {
          id: "template-project-1",
          projectId: "project-1",
          sortOrder: 0,
          project: {
            id: "project-1",
            code: "PRJ-1",
            name: "Merkez",
            storageRoot: "projects/project-1"
          },
          assignments: [
            {
              userId: "field-1",
              user: {
                id: "field-1",
                username: "saha-1",
                displayName: "Saha Bir",
                role: Role.FIELD,
                isActive: true
              }
            },
            {
              userId: "field-2",
              user: {
                id: "field-2",
                username: "saha-2",
                displayName: "Saha Iki",
                role: Role.FIELD,
                isActive: true
              }
            }
          ]
        }
      ]
    });
    prisma.dailyProgram.findUnique.mockResolvedValue({
      id: "program-1",
      programProjects: [
        {
          projectId: "project-1",
          assignments: [
            { id: "assignment-1", userId: "field-1", isActive: false },
            { id: "assignment-9", userId: "field-9", isActive: true }
          ]
        }
      ]
    });

    const service = new ProgramTemplatesService(
      prisma as never,
      createStorageServiceMock() as never,
      createJobsServiceMock() as never,
      createLoggerMock() as never
    );

    const result = await service.previewMaterialization(
      "template-1",
      { date: "2026-04-13" },
      managerActor as never
    );

    expect(result).toEqual({
      templateId: "template-1",
      targetDate: "2026-04-13",
      matchesRule: true,
      existingDailyProgramId: "program-1",
      wouldCreateDailyProgram: false,
      projectPlans: [
        {
          templateProjectId: "template-project-1",
          project: {
            id: "project-1",
            code: "PRJ-1",
            name: "Merkez",
            storageRoot: "projects/project-1"
          },
          action: "merge",
          assignmentPlans: [
            {
              user: {
                id: "field-1",
                username: "saha-1",
                displayName: "Saha Bir",
                role: Role.FIELD,
                isActive: true
              },
              action: "activate"
            },
            {
              user: {
                id: "field-2",
                username: "saha-2",
                displayName: "Saha Iki",
                role: Role.FIELD,
                isActive: true
              },
              action: "create"
            }
          ]
        }
      ],
      summary: {
        createProjectCount: 0,
        mergeProjectCount: 1,
        createAssignmentCount: 1,
        activateAssignmentCount: 1
      }
    });
    expect(prisma.dailyProgram.upsert).not.toHaveBeenCalled();
    expect(prisma.dailyProgramProject.upsert).not.toHaveBeenCalled();
    expect(prisma.projectAssignment.create).not.toHaveBeenCalled();
  });

  it("updates template metadata, recurrence, and project assignments", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const jobsService = createJobsServiceMock();

    prisma.programTemplate.findUnique
      .mockResolvedValueOnce({ id: "template-1" })
      .mockResolvedValueOnce({
        id: "template-1",
        name: "Guncel rota",
        managerNote: "Yeni not",
        isActive: false,
        createdAt: new Date("2026-04-10T08:00:00.000Z"),
        updatedAt: new Date("2026-04-10T10:00:00.000Z"),
        recurrenceRules: [
          {
            frequency: RecurrenceFrequency.WEEKLY,
            weekdays: [2, 4],
            startDate: new Date("2026-04-15T00:00:00.000Z"),
            endDate: new Date("2026-05-15T00:00:00.000Z")
          }
        ],
        templateProjects: [
          {
            id: "template-project-2",
            projectId: "project-2",
            sortOrder: 0,
            note: "Guncel not",
            project: {
              id: "project-2",
              code: "PRJ-2",
              name: "Kuzey Depo",
              isArchived: false
            },
            assignments: [
              {
                userId: "field-2",
                user: {
                  id: "field-2",
                  username: "saha-2",
                  displayName: "Saha Iki",
                  role: Role.FIELD,
                  isActive: true
                }
              }
            ]
          }
        ]
      });
    prisma.project.findMany.mockResolvedValue([{ id: "project-2" }]);
    prisma.user.findMany.mockResolvedValue([{ id: "field-2" }]);

    const service = new ProgramTemplatesService(
      prisma as never,
      storageService as never,
      jobsService as never,
      createLoggerMock() as never
    );

    const result = await service.update(
      "template-1",
      {
        name: " Guncel rota ",
        managerNote: " Yeni not ",
        isActive: false,
        rule: {
          startDate: "2026-04-15",
          endDate: "2026-05-15",
          weekdays: [4, 2, 2]
        },
        projects: [
          {
            projectId: "project-2",
            note: " Guncel not ",
            userIds: ["field-2", "field-2"]
          }
        ]
      },
      managerActor as never
    );

    expect(prisma.programTemplate.update).toHaveBeenCalledWith({
      where: { id: "template-1" },
      data: {
        name: "Guncel rota",
        managerNote: "Yeni not",
        isActive: false
      }
    });
    expect(prisma.programTemplateRecurrenceRule.deleteMany).toHaveBeenCalledWith({
      where: {
        programTemplateId: "template-1"
      }
    });
    expect(prisma.programTemplateRecurrenceRule.create).toHaveBeenCalledWith({
      data: {
        programTemplateId: "template-1",
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 1,
        weekdays: [2, 4],
        startDate: new Date("2026-04-15T00:00:00.000Z"),
        endDate: new Date("2026-05-15T00:00:00.000Z")
      }
    });
    expect(prisma.programTemplateProject.deleteMany).toHaveBeenCalledWith({
      where: {
        programTemplateId: "template-1"
      }
    });
    expect(prisma.programTemplateProject.create).toHaveBeenCalledWith({
      data: {
        programTemplateId: "template-1",
        projectId: "project-2",
        sortOrder: 0,
        note: "Guncel not",
        assignments: {
          create: [{ userId: "field-2" }]
        }
      }
    });
    expect(storageService.appendSystemEvent).toHaveBeenCalledWith({
      actor: managerActor,
      eventType: "PROGRAM_TEMPLATE_UPDATED",
      payload: {
        templateId: "template-1",
        name: "Guncel rota",
        projectCount: 1,
        isActive: false
      }
    });
    expect(result).toEqual({
      id: "template-1",
      name: "Guncel rota",
      managerNote: "Yeni not",
      isActive: false,
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T10:00:00.000Z",
      rule: {
        frequency: RecurrenceFrequency.WEEKLY,
        weekdays: [2, 4],
        startDate: "2026-04-15",
        endDate: "2026-05-15"
      },
      projects: [
        {
          id: "template-project-2",
          sortOrder: 0,
          note: "Guncel not",
          project: {
            id: "project-2",
            code: "PRJ-2",
            name: "Kuzey Depo",
            isArchived: false
          },
          assignments: [
            {
              user: {
                id: "field-2",
                username: "saha-2",
                displayName: "Saha Iki",
                role: Role.FIELD,
                isActive: true
              }
            }
          ]
        }
      ]
    });
  });

  it("toggles template active state through a dedicated endpoint flow", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const jobsService = createJobsServiceMock();

    prisma.programTemplate.findUnique
      .mockResolvedValueOnce({
        id: "template-1",
        name: "Haftalik servis",
        isActive: true
      })
      .mockResolvedValueOnce({
        id: "template-1",
        name: "Haftalik servis",
        managerNote: "Sabah cikisi",
        isActive: false,
        createdAt: new Date("2026-04-10T08:00:00.000Z"),
        updatedAt: new Date("2026-04-10T10:30:00.000Z"),
        recurrenceRules: [
          {
            frequency: RecurrenceFrequency.WEEKLY,
            weekdays: [1, 3, 5],
            startDate: new Date("2026-04-13T00:00:00.000Z"),
            endDate: null
          }
        ],
        templateProjects: []
      });

    const service = new ProgramTemplatesService(
      prisma as never,
      storageService as never,
      jobsService as never,
      createLoggerMock() as never
    );

    const result = await service.setActive("template-1", false, managerActor as never);

    expect(prisma.programTemplate.update).toHaveBeenCalledWith({
      where: { id: "template-1" },
      data: { isActive: false }
    });
    expect(storageService.appendSystemEvent).toHaveBeenCalledWith({
      actor: managerActor,
      eventType: "PROGRAM_TEMPLATE_DEACTIVATED",
      payload: {
        templateId: "template-1",
        name: "Haftalik servis",
        isActive: false
      }
    });
    expect(result).toEqual({
      id: "template-1",
      name: "Haftalik servis",
      managerNote: "Sabah cikisi",
      isActive: false,
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T10:30:00.000Z",
      rule: {
        frequency: RecurrenceFrequency.WEEKLY,
        weekdays: [1, 3, 5],
        startDate: "2026-04-13",
        endDate: null
      },
      projects: []
    });
  });

  it("rejects materialization when the selected date does not match the recurrence rule", async () => {
    const prisma = createPrismaMock();
    const logger = createLoggerMock();

    prisma.programTemplate.findUnique.mockResolvedValue({
      id: "template-1",
      isActive: true,
      recurrenceRules: [
        {
          frequency: RecurrenceFrequency.WEEKLY,
          weekdays: [1],
          startDate: new Date("2026-04-01T00:00:00.000Z"),
          endDate: null
        }
      ],
      templateProjects: []
    });

    const service = new ProgramTemplatesService(
      prisma as never,
      createStorageServiceMock() as never,
      createJobsServiceMock() as never,
      logger as never
    );

    await expect(
      service.materialize("template-1", { date: "2026-04-14" }, managerActor as never)
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(logger.warn).toHaveBeenCalledWith("program-template.materialize.rejected", {
      templateId: "template-1",
      targetDate: "2026-04-14",
      reason: "rule-mismatch"
    });
  });

  it("blocks field users from template access", async () => {
    const service = new ProgramTemplatesService(
      createPrismaMock() as never,
      createStorageServiceMock() as never,
      createJobsServiceMock() as never,
      createLoggerMock() as never
    );

    await expect(
      service.list({
        sub: "field-1",
        username: "saha",
        displayName: "Saha",
        role: Role.FIELD
      } as never)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
