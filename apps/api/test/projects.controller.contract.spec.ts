import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { RateLimitGuard } from "../src/common/security/rate-limit.guard";
import { ProjectsController } from "../src/projects/projects.controller";
import { ProjectsService } from "../src/projects/projects.service";

describe("ProjectsController contract", () => {
  const projectsService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getTimeline: jest.fn()
  };

  const jwtAuthGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest();
      const roleHeader = readHeader(request.headers["x-test-role"]);
      const role = roleHeader === "FIELD" ? "FIELD" : "MANAGER";

      request.user = {
        sub: role === "FIELD" ? "field-1" : "manager-1",
        username: role === "FIELD" ? "saha" : "yonetici",
        displayName: role === "FIELD" ? "Saha Personeli" : "Ana Yonetici",
        role
      };

      return true;
    }
  };

  const rolesGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const handlerRoles = Reflect.getMetadata(ROLES_KEY, context.getHandler()) as
        | string[]
        | undefined;
      const classRoles = Reflect.getMetadata(ROLES_KEY, context.getClass()) as string[] | undefined;
      const roles = handlerRoles ?? classRoles;

      if (!roles?.length) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
      return roles.includes(request.user.role);
    }
  };

  const rateLimitGuard: CanActivate = {
    canActivate() {
      return true;
    }
  };

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: ProjectsService,
          useValue: projectsService
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(rolesGuard)
      .overrideGuard(RateLimitGuard)
      .useValue(rateLimitGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
      })
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("GET /api/projects forwards filters for both manager and field actors", async () => {
    projectsService.findAll.mockResolvedValue([
      {
        id: "project-1",
        code: "PRJ-001",
        name: "Merkez Santiye",
        description: "Ana saha",
        locationLabel: "Ankara",
        latitude: 39.92,
        longitude: 32.85,
        isArchived: false,
        storageRoot: "projects/merkez-santiye",
        createdAt: "2026-04-09T08:00:00.000Z",
        updatedAt: "2026-04-09T08:30:00.000Z",
        customer: null,
        mainFileCount: 0,
        programUsageCount: 0,
        timelineEntryCount: 0
      }
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/projects?status=archived&query=%20depo%20")
      .set("x-test-role", "FIELD")
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(projectsService.findAll).toHaveBeenCalledWith(
      {
        sub: "field-1",
        username: "saha",
        displayName: "Saha Personeli",
        role: "FIELD"
      },
      {
        status: "archived",
        query: "depo"
      }
    );
  });

  it("POST /api/projects returns the created project summary", async () => {
    projectsService.create.mockResolvedValue({
      id: "project-2",
      code: "PRJ-200",
      name: "Yeni Proje",
      description: "Kurulum",
      locationLabel: "Istanbul",
      latitude: 41.01,
      longitude: 28.97,
      isArchived: false,
      storageRoot: "projects/yeni-proje",
      createdAt: "2026-04-09T09:00:00.000Z",
      updatedAt: "2026-04-09T09:00:00.000Z",
      customer: null,
      mainFileCount: 0,
      programUsageCount: 0,
      timelineEntryCount: 0
    });

    const response = await request(app.getHttpServer())
      .post("/api/projects")
      .send({
        name: "Yeni Proje",
        description: "Kurulum",
        locationLabel: "Istanbul",
        latitude: 41.01,
        longitude: 28.97
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "project-2",
      code: "PRJ-200",
      name: "Yeni Proje",
      description: "Kurulum",
      locationLabel: "Istanbul",
      latitude: 41.01,
      longitude: 28.97,
      isArchived: false,
      storageRoot: "projects/yeni-proje",
      createdAt: "2026-04-09T09:00:00.000Z",
      updatedAt: "2026-04-09T09:00:00.000Z",
      customer: null,
      mainFileCount: 0,
      programUsageCount: 0,
      timelineEntryCount: 0
    });
    expect(projectsService.create).toHaveBeenCalledWith(
      {
        name: "Yeni Proje",
        description: "Kurulum",
        locationLabel: "Istanbul",
        latitude: 41.01,
        longitude: 28.97
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("POST /api/projects enforces DTO validation before reaching the service", async () => {
    await request(app.getHttpServer())
      .post("/api/projects")
      .send({
        code: "PRJ-200",
        latitude: "invalid"
      })
      .expect(400);

    expect(projectsService.create).not.toHaveBeenCalled();
  });

  it("PATCH /api/projects/:id forwards archive-capable updates", async () => {
    projectsService.update.mockResolvedValue({
      id: "project-2",
      code: "PRJ-200",
      name: "Yeni Proje",
      description: "Kurulum",
      locationLabel: "Istanbul",
      latitude: 41.01,
      longitude: 28.97,
      isArchived: true,
      storageRoot: "projects/yeni-proje",
      createdAt: "2026-04-09T09:00:00.000Z",
      updatedAt: "2026-04-10T09:00:00.000Z",
      customer: null,
      mainFileCount: 0,
      programUsageCount: 0,
      timelineEntryCount: 0
    });

    const response = await request(app.getHttpServer())
      .patch("/api/projects/project-2")
      .send({
        locationLabel: "Izmir",
        isArchived: true
      })
      .expect(200);

    expect(response.body.isArchived).toBe(true);
    expect(projectsService.update).toHaveBeenCalledWith(
      "project-2",
      {
        locationLabel: "Izmir",
        isArchived: true
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("DELETE /api/projects/:id forwards the delete request with the actor", async () => {
    projectsService.remove.mockResolvedValue({
      success: true
    });

    const response = await request(app.getHttpServer())
      .delete("/api/projects/project-2")
      .expect(200);

    expect(response.body).toEqual({
      success: true
    });
    expect(projectsService.remove).toHaveBeenCalledWith("project-2", {
      sub: "manager-1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: "MANAGER"
    });
  });

  it("GET /api/projects/:id/timeline returns merged timeline items", async () => {
    projectsService.getTimeline.mockResolvedValue([
      {
        id: "response-1",
        projectId: "project-1",
        entryType: "FIELD_FORM_RESPONSE",
        note: null,
        entryDate: "2026-04-10T10:00:00.000Z",
        createdAt: "2026-04-10T10:00:00.000Z",
        actor: {
          id: "field-1",
          username: "saha",
          displayName: "Saha Personeli",
          role: "FIELD"
        },
        files: [],
        formResponse: {
          id: "response-1",
          templateId: "template-1",
          templateName: "Gunluk Kontrol",
          templateVersionId: "version-2",
          templateVersionNumber: 2,
          templateVersionTitle: "v2",
          dailyProgramProjectId: "program-project-1",
          projectEntryId: "entry-1",
          payload: {
            answers: [{ key: "weather", value: "clear" }]
          }
        }
      }
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/projects/project-1/timeline")
      .set("x-test-role", "FIELD")
      .expect(200);

    expect(response.body).toEqual([
      {
        id: "response-1",
        projectId: "project-1",
        entryType: "FIELD_FORM_RESPONSE",
        note: null,
        entryDate: "2026-04-10T10:00:00.000Z",
        createdAt: "2026-04-10T10:00:00.000Z",
        actor: {
          id: "field-1",
          username: "saha",
          displayName: "Saha Personeli",
          role: "FIELD"
        },
        files: [],
        formResponse: {
          id: "response-1",
          templateId: "template-1",
          templateName: "Gunluk Kontrol",
          templateVersionId: "version-2",
          templateVersionNumber: 2,
          templateVersionTitle: "v2",
          dailyProgramProjectId: "program-project-1",
          projectEntryId: "entry-1",
          payload: {
            answers: [{ key: "weather", value: "clear" }]
          }
        }
      }
    ]);
    expect(projectsService.getTimeline).toHaveBeenCalledWith("project-1", {
      sub: "field-1",
      username: "saha",
      displayName: "Saha Personeli",
      role: "FIELD"
    });
  });

  it("blocks field users from project lifecycle mutations", async () => {
    await request(app.getHttpServer())
      .post("/api/projects")
      .set("x-test-role", "FIELD")
      .send({
        name: "Yetkisiz Proje"
      })
      .expect(403);

    expect(projectsService.create).not.toHaveBeenCalled();
  });
});

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
