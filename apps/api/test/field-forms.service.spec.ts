import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { FieldFormFieldType, Role } from "@prisma/client";
import { FieldFormsService } from "../src/field-forms/field-forms.service";

describe("FieldFormsService", () => {
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

  function createPrismaMock() {
    return {
      fieldFormTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      fieldFormTemplateVersion: {
        create: jest.fn(),
        findUnique: jest.fn()
      },
      fieldFormResponse: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn()
      },
      project: {
        findUnique: jest.fn()
      },
      projectAssignment: {
        findFirst: jest.fn()
      },
      dailyProgramProject: {
        findUnique: jest.fn()
      },
      projectEntry: {
        findUnique: jest.fn()
      }
    };
  }

  function createStorageServiceMock() {
    return {
      appendSystemEvent: jest.fn().mockResolvedValue(undefined),
      appendProjectEvent: jest.fn().mockResolvedValue(undefined)
    };
  }

  it("creates field form templates with initial version", async () => {
    const prisma = createPrismaMock();
    const storage = createStorageServiceMock();

    prisma.fieldFormTemplate.create.mockResolvedValue({
      id: "template-1",
      name: "Servis Formu",
      description: "Bakim checklist",
      isActive: true,
      createdAt: new Date("2026-04-10T08:00:00.000Z"),
      updatedAt: new Date("2026-04-10T08:00:00.000Z"),
      versions: [
        {
          id: "version-1",
          versionNumber: 1,
          title: "v1",
          schema: {
            fields: [
              {
                key: "summary",
                label: "Ozet",
                type: FieldFormFieldType.TEXTAREA
              }
            ]
          },
          createdAt: new Date("2026-04-10T08:00:00.000Z")
        }
      ]
    });

    const service = new FieldFormsService(prisma as never, storage as never);
    const result = await service.createTemplate(
      {
        name: " Servis Formu ",
        description: " Bakim checklist ",
        versionTitle: " v1 ",
        schema: {
          fields: [
            {
              key: "summary",
              label: "Ozet",
              type: FieldFormFieldType.TEXTAREA
            }
          ]
        }
      },
      managerActor as never
    );

    expect(prisma.fieldFormTemplate.create).toHaveBeenCalledWith({
      data: {
        name: "Servis Formu",
        description: "Bakim checklist",
        isActive: true,
        createdById: "manager-1",
        versions: {
          create: {
            versionNumber: 1,
            title: "v1",
            schema: {
              fields: [
                {
                  key: "summary",
                  label: "Ozet",
                  type: FieldFormFieldType.TEXTAREA
                }
              ]
            }
          }
        }
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" }
        }
      }
    });
    expect(storage.appendSystemEvent).toHaveBeenCalledWith({
      actor: managerActor,
      eventType: "FIELD_FORM_TEMPLATE_CREATED",
      payload: {
        templateId: "template-1",
        name: "Servis Formu",
        versionId: "version-1"
      }
    });
    expect(result).toEqual({
      id: "template-1",
      name: "Servis Formu",
      description: "Bakim checklist",
      isActive: true,
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T08:00:00.000Z",
      versions: [
        {
          id: "version-1",
          versionNumber: 1,
          title: "v1",
          schema: {
            fields: [
              {
                key: "summary",
                label: "Ozet",
                type: FieldFormFieldType.TEXTAREA
              }
            ]
          },
          createdAt: "2026-04-10T08:00:00.000Z"
        }
      ]
    });
  });

  it("creates a new form version for managers", async () => {
    const prisma = createPrismaMock();
    const storage = createStorageServiceMock();

    prisma.fieldFormTemplate.findUnique.mockResolvedValue({
      id: "template-1",
      versions: [{ versionNumber: 2 }]
    });
    prisma.fieldFormTemplateVersion.create.mockResolvedValue({
      id: "version-3",
      versionNumber: 3,
      title: "v3",
      schema: { fields: [] },
      createdAt: new Date("2026-04-10T09:00:00.000Z")
    });

    const service = new FieldFormsService(prisma as never, storage as never);
    const result = await service.createVersion(
      "template-1",
      {
        title: "v3",
        schema: { fields: [{ key: "done", label: "Tamam", type: FieldFormFieldType.BOOLEAN }] }
      },
      managerActor as never
    );

    expect(prisma.fieldFormTemplateVersion.create).toHaveBeenCalledWith({
      data: {
        templateId: "template-1",
        versionNumber: 3,
        title: "v3",
        schema: {
          fields: [{ key: "done", label: "Tamam", type: FieldFormFieldType.BOOLEAN }]
        }
      }
    });
    expect(result).toEqual({
      id: "version-3",
      templateId: "template-1",
      versionNumber: 3,
      title: "v3",
      schema: { fields: [] },
      createdAt: "2026-04-10T09:00:00.000Z"
    });
  });

  it("updates field form template metadata and active state", async () => {
    const prisma = createPrismaMock();
    const storage = createStorageServiceMock();

    prisma.fieldFormTemplate.findUnique
      .mockResolvedValueOnce({
        id: "template-1"
      })
      .mockResolvedValueOnce({
        id: "template-1",
        name: "Guncel Servis Formu",
        description: "Yeni aciklama",
        isActive: false,
        createdAt: new Date("2026-04-10T08:00:00.000Z"),
        updatedAt: new Date("2026-04-10T09:30:00.000Z"),
        versions: [
          {
            id: "version-1",
            versionNumber: 1,
            title: "v1",
            schema: { fields: [] },
            createdAt: new Date("2026-04-10T08:00:00.000Z")
          }
        ]
      });
    prisma.fieldFormTemplate.update.mockResolvedValue({
      id: "template-1",
      name: "Guncel Servis Formu",
      description: "Yeni aciklama",
      isActive: false
    });

    const service = new FieldFormsService(prisma as never, storage as never);
    const result = await service.updateTemplate(
      "template-1",
      {
        name: " Guncel Servis Formu ",
        description: " Yeni aciklama ",
        isActive: false
      },
      managerActor as never
    );

    expect(prisma.fieldFormTemplate.update).toHaveBeenCalledWith({
      where: { id: "template-1" },
      data: {
        name: "Guncel Servis Formu",
        description: "Yeni aciklama",
        isActive: false
      }
    });
    expect(storage.appendSystemEvent).toHaveBeenCalledWith({
      actor: managerActor,
      eventType: "FIELD_FORM_TEMPLATE_UPDATED",
      payload: {
        templateId: "template-1",
        name: "Guncel Servis Formu",
        isActive: false
      }
    });
    expect(result).toEqual({
      id: "template-1",
      name: "Guncel Servis Formu",
      description: "Yeni aciklama",
      isActive: false,
      createdAt: "2026-04-10T08:00:00.000Z",
      updatedAt: "2026-04-10T09:30:00.000Z",
      versions: [
        {
          id: "version-1",
          versionNumber: 1,
          title: "v1",
          schema: { fields: [] },
          createdAt: "2026-04-10T08:00:00.000Z"
        }
      ]
    });
  });

  it("records field form responses for assigned field users", async () => {
    const prisma = createPrismaMock();
    const storage = createStorageServiceMock();

    prisma.fieldFormTemplateVersion.findUnique.mockResolvedValue({
      id: "version-1",
      templateId: "template-1",
      template: {
        isActive: true
      }
    });
    prisma.project.findUnique.mockResolvedValue({
      id: "project-1",
      storageRoot: "projects/project-1"
    });
    prisma.projectAssignment.findFirst.mockResolvedValue({
      id: "assignment-1"
    });
    prisma.dailyProgramProject.findUnique.mockResolvedValue({
      id: "program-project-1",
      projectId: "project-1"
    });
    prisma.projectEntry.findUnique.mockResolvedValue({
      id: "entry-1",
      projectId: "project-1"
    });
    prisma.fieldFormResponse.create.mockResolvedValue({
      id: "response-1",
      templateId: "template-1",
      templateVersionId: "version-1",
      projectId: "project-1",
      dailyProgramProjectId: "program-project-1",
      projectEntryId: "entry-1",
      actorId: "field-1",
      payload: { summary: "Tamam" },
      createdAt: new Date("2026-04-10T10:00:00.000Z")
    });

    const service = new FieldFormsService(prisma as never, storage as never);
    const result = await service.submitResponse(
      {
        templateVersionId: "version-1",
        projectId: "project-1",
        dailyProgramProjectId: "program-project-1",
        projectEntryId: "entry-1",
        payload: { summary: "Tamam" }
      },
      fieldActor as never
    );

    expect(storage.appendProjectEvent).toHaveBeenCalledWith({
      project: {
        id: "project-1",
        storageRoot: "projects/project-1"
      },
      actor: fieldActor,
      eventType: "FIELD_FORM_RESPONSE_RECORDED",
      payload: {
        responseId: "response-1",
        templateId: "template-1",
        templateVersionId: "version-1",
        projectEntryId: "entry-1"
      }
    });
    expect(result).toEqual({
      id: "response-1",
      templateId: "template-1",
      templateVersionId: "version-1",
      projectId: "project-1",
      dailyProgramProjectId: "program-project-1",
      projectEntryId: "entry-1",
      actorId: "field-1",
      payload: { summary: "Tamam" },
      createdAt: "2026-04-10T10:00:00.000Z"
    });
  });

  it("blocks field responses when the actor has no active assignment on the project", async () => {
    const prisma = createPrismaMock();

    prisma.fieldFormTemplateVersion.findUnique.mockResolvedValue({
      id: "version-1",
      templateId: "template-1",
      template: { isActive: true }
    });
    prisma.project.findUnique.mockResolvedValue({
      id: "project-1",
      storageRoot: "projects/project-1"
    });
    prisma.projectAssignment.findFirst.mockResolvedValue(null);

    const service = new FieldFormsService(prisma as never, createStorageServiceMock() as never);

    await expect(
      service.submitResponse(
        {
          templateVersionId: "version-1",
          projectId: "project-1",
          payload: { summary: "Tamam" }
        },
        fieldActor as never
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lists manager-visible form responses with filter forwarding and mapped detail", async () => {
    const prisma = createPrismaMock();
    const storage = createStorageServiceMock();

    prisma.fieldFormResponse.findMany.mockResolvedValue([
      {
        id: "response-1",
        templateId: "template-1",
        templateVersionId: "version-2",
        projectId: "project-1",
        dailyProgramProjectId: "program-project-1",
        projectEntryId: "entry-1",
        actorId: "field-1",
        payload: { summary: "Tamam" },
        createdAt: new Date("2026-04-10T10:00:00.000Z"),
        updatedAt: new Date("2026-04-10T10:05:00.000Z"),
        actor: {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Personeli",
          role: Role.FIELD
        },
        template: {
          id: "template-1",
          name: "Servis Formu"
        },
        templateVersion: {
          id: "version-2",
          versionNumber: 2,
          title: "v2"
        },
        project: {
          id: "project-1",
          name: "Merkez Santiye"
        }
      }
    ]);

    const service = new FieldFormsService(prisma as never, storage as never);
    const result = await service.listResponses(
      {
        templateId: " template-1 ",
        projectId: " project-1 ",
        actorId: " field-1 "
      },
      managerActor as never
    );

    expect(prisma.fieldFormResponse.findMany).toHaveBeenCalledWith({
      where: {
        templateId: "template-1",
        projectId: "project-1",
        actorId: "field-1"
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
    expect(result).toEqual([
      {
        id: "response-1",
        templateId: "template-1",
        templateName: "Servis Formu",
        templateVersionId: "version-2",
        templateVersionNumber: 2,
        templateVersionTitle: "v2",
        projectId: "project-1",
        projectName: "Merkez Santiye",
        dailyProgramProjectId: "program-project-1",
        projectEntryId: "entry-1",
        actorId: "field-1",
        actor: {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Personeli",
          role: Role.FIELD
        },
        payload: { summary: "Tamam" },
        createdAt: "2026-04-10T10:00:00.000Z",
        updatedAt: "2026-04-10T10:05:00.000Z"
      }
    ]);
  });

  it("returns manager-visible single response detail", async () => {
    const prisma = createPrismaMock();
    const storage = createStorageServiceMock();

    prisma.fieldFormResponse.findUnique.mockResolvedValue({
      id: "response-1",
      templateId: "template-1",
      templateVersionId: "version-2",
      projectId: "project-1",
      dailyProgramProjectId: null,
      projectEntryId: null,
      actorId: "field-1",
      payload: { summary: "Tamam" },
      createdAt: new Date("2026-04-10T10:00:00.000Z"),
      updatedAt: new Date("2026-04-10T10:05:00.000Z"),
      actor: {
        id: "field-1",
        username: "saha-1",
        displayName: "Saha Personeli",
        role: Role.FIELD
      },
      template: {
        id: "template-1",
        name: "Servis Formu"
      },
      templateVersion: {
        id: "version-2",
        versionNumber: 2,
        title: "v2"
      },
      project: {
        id: "project-1",
        name: "Merkez Santiye"
      }
    });

    const service = new FieldFormsService(prisma as never, storage as never);
    const result = await service.getResponse("response-1", managerActor as never);

    expect(prisma.fieldFormResponse.findUnique).toHaveBeenCalledWith({
      where: { id: "response-1" },
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
    expect(result).toEqual({
      id: "response-1",
      templateId: "template-1",
      templateName: "Servis Formu",
      templateVersionId: "version-2",
      templateVersionNumber: 2,
      templateVersionTitle: "v2",
      projectId: "project-1",
      projectName: "Merkez Santiye",
      dailyProgramProjectId: null,
      projectEntryId: null,
      actorId: "field-1",
      actor: {
        id: "field-1",
        username: "saha-1",
        displayName: "Saha Personeli",
        role: Role.FIELD
      },
      payload: { summary: "Tamam" },
      createdAt: "2026-04-10T10:00:00.000Z",
      updatedAt: "2026-04-10T10:05:00.000Z"
    });
  });

  it("rejects duplicate schema keys", async () => {
    const service = new FieldFormsService(createPrismaMock() as never, createStorageServiceMock() as never);

    await expect(
      service.createTemplate(
        {
          name: "Servis Formu",
          versionTitle: "v1",
          schema: {
            fields: [
              { key: "summary", label: "Ozet", type: FieldFormFieldType.TEXT },
              { key: "summary", label: "Tekrar", type: FieldFormFieldType.TEXT }
            ]
          }
        },
        managerActor as never
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
