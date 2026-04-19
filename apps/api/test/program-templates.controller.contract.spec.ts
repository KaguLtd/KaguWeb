import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { ProgramTemplatesController } from "../src/program-templates/program-templates.controller";
import { ProgramTemplatesService } from "../src/program-templates/program-templates.service";

describe("ProgramTemplatesController contract", () => {
  const programTemplatesService = {
    list: jest.fn(),
    getOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    setActive: jest.fn(),
    previewMaterialization: jest.fn(),
    materialize: jest.fn()
  };

  const jwtAuthGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest();
      const roleHeader = readHeader(request.headers["x-test-role"]);
      const role = roleHeader === "FIELD" ? Role.FIELD : Role.MANAGER;

      request.user = {
        sub: role === Role.FIELD ? "field-1" : "manager-1",
        username: role === Role.FIELD ? "saha" : "yonetici",
        displayName: role === Role.FIELD ? "Saha Personeli" : "Ana Yonetici",
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

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProgramTemplatesController],
      providers: [
        {
          provide: ProgramTemplatesService,
          useValue: programTemplatesService
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(rolesGuard)
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
    await app.close();
  });

  it("GET /api/program-templates forwards manager requests", async () => {
    programTemplatesService.list.mockResolvedValue([
      {
        id: "template-1",
        name: "Haftalik servis"
      }
    ]);

    const response = await request(app.getHttpServer()).get("/api/program-templates").expect(200);

    expect(response.body).toEqual([
      {
        id: "template-1",
        name: "Haftalik servis"
      }
    ]);
    expect(programTemplatesService.list).toHaveBeenCalledWith({
      sub: "manager-1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: "MANAGER"
    });
  });

  it("POST /api/program-templates validates nested template payloads", async () => {
    await request(app.getHttpServer())
      .post("/api/program-templates")
      .send({
        name: "Haftalik servis",
        rule: {
          startDate: "2026-04-13",
          weekdays: [0]
        },
        projects: []
      })
      .expect(400);

    expect(programTemplatesService.create).not.toHaveBeenCalled();
  });

  it("GET /api/program-templates/:id returns template detail", async () => {
    programTemplatesService.getOne.mockResolvedValue({
      id: "template-1",
      name: "Haftalik servis",
      projects: []
    });

    const response = await request(app.getHttpServer())
      .get("/api/program-templates/template-1")
      .expect(200);

    expect(response.body).toEqual({
      id: "template-1",
      name: "Haftalik servis",
      projects: []
    });
    expect(programTemplatesService.getOne).toHaveBeenCalledWith("template-1", {
      sub: "manager-1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: "MANAGER"
    });
  });

  it("POST /api/program-templates creates manager templates", async () => {
    programTemplatesService.create.mockResolvedValue({
      id: "template-1",
      name: "Haftalik servis"
    });

    const response = await request(app.getHttpServer())
      .post("/api/program-templates")
      .send({
        name: "Haftalik servis",
        managerNote: "Sabah cikisi",
        rule: {
          startDate: "2026-04-13",
          weekdays: [1, 3, 5]
        },
        projects: [
          {
            projectId: "project-1",
            note: "On kontrol",
            userIds: ["field-1"]
          }
        ]
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "template-1",
      name: "Haftalik servis"
    });
    expect(programTemplatesService.create).toHaveBeenCalledWith(
      {
        name: "Haftalik servis",
        managerNote: "Sabah cikisi",
        rule: {
          startDate: "2026-04-13",
          weekdays: [1, 3, 5]
        },
        projects: [
          {
            projectId: "project-1",
            note: "On kontrol",
            userIds: ["field-1"]
          }
        ]
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("PATCH /api/program-templates/:id updates manager templates", async () => {
    programTemplatesService.update.mockResolvedValue({
      id: "template-1",
      name: "Guncel rota",
      isActive: false
    });

    const response = await request(app.getHttpServer())
      .patch("/api/program-templates/template-1")
      .send({
        name: "Guncel rota",
        managerNote: "Yeni not",
        isActive: false,
        rule: {
          startDate: "2026-04-15",
          endDate: "2026-05-15",
          weekdays: [2, 4]
        },
        projects: [
          {
            projectId: "project-2",
            note: "Guncel not",
            userIds: ["field-2"]
          }
        ]
      })
      .expect(200);

    expect(response.body).toEqual({
      id: "template-1",
      name: "Guncel rota",
      isActive: false
    });
    expect(programTemplatesService.update).toHaveBeenCalledWith(
      "template-1",
      {
        name: "Guncel rota",
        managerNote: "Yeni not",
        isActive: false,
        rule: {
          startDate: "2026-04-15",
          endDate: "2026-05-15",
          weekdays: [2, 4]
        },
        projects: [
          {
            projectId: "project-2",
            note: "Guncel not",
            userIds: ["field-2"]
          }
        ]
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("DELETE /api/program-templates/:id removes manager templates", async () => {
    programTemplatesService.remove.mockResolvedValue({
      success: true,
      id: "template-1"
    });

    const response = await request(app.getHttpServer())
      .delete("/api/program-templates/template-1")
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      id: "template-1"
    });
    expect(programTemplatesService.remove).toHaveBeenCalledWith("template-1", {
      sub: "manager-1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: "MANAGER"
    });
  });

  it("POST /api/program-templates/:id/materialize forwards selected date", async () => {
    programTemplatesService.materialize.mockResolvedValue({
      templateId: "template-1",
      dailyProgramId: "program-1",
      date: "2026-04-13"
    });

    const response = await request(app.getHttpServer())
      .post("/api/program-templates/template-1/materialize")
      .send({
        date: "2026-04-13"
      })
      .expect(201);

    expect(response.body).toEqual({
      templateId: "template-1",
      dailyProgramId: "program-1",
      date: "2026-04-13"
    });
    expect(programTemplatesService.materialize).toHaveBeenCalledWith(
      "template-1",
      {
        date: "2026-04-13"
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("POST /api/program-templates/:id/activate forwards activation intent", async () => {
    programTemplatesService.setActive.mockResolvedValue({
      id: "template-1",
      isActive: true
    });

    const response = await request(app.getHttpServer())
      .post("/api/program-templates/template-1/activate")
      .expect(201);

    expect(response.body).toEqual({
      id: "template-1",
      isActive: true
    });
    expect(programTemplatesService.setActive).toHaveBeenCalledWith(
      "template-1",
      true,
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("POST /api/program-templates/:id/deactivate forwards deactivation intent", async () => {
    programTemplatesService.setActive.mockResolvedValue({
      id: "template-1",
      isActive: false
    });

    const response = await request(app.getHttpServer())
      .post("/api/program-templates/template-1/deactivate")
      .expect(201);

    expect(response.body).toEqual({
      id: "template-1",
      isActive: false
    });
    expect(programTemplatesService.setActive).toHaveBeenCalledWith(
      "template-1",
      false,
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("POST /api/program-templates/:id/preview forwards selected date without mutation", async () => {
    programTemplatesService.previewMaterialization.mockResolvedValue({
      templateId: "template-1",
      targetDate: "2026-04-13",
      matchesRule: true,
      projectPlans: []
    });

    const response = await request(app.getHttpServer())
      .post("/api/program-templates/template-1/preview")
      .send({
        date: "2026-04-13"
      })
      .expect(201);

    expect(response.body).toEqual({
      templateId: "template-1",
      targetDate: "2026-04-13",
      matchesRule: true,
      projectPlans: []
    });
    expect(programTemplatesService.previewMaterialization).toHaveBeenCalledWith(
      "template-1",
      {
        date: "2026-04-13"
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("manager-only class guard blocks field users", async () => {
    await request(app.getHttpServer())
      .get("/api/program-templates")
      .set("x-test-role", "FIELD")
      .expect(403);

    expect(programTemplatesService.list).not.toHaveBeenCalled();
  });
});

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
