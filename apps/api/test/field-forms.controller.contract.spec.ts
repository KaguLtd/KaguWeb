import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { FieldFormsController } from "../src/field-forms/field-forms.controller";
import { FieldFormsService } from "../src/field-forms/field-forms.service";

describe("FieldFormsController contract", () => {
  const fieldFormsService = {
    listTemplates: jest.fn(),
    getTemplate: jest.fn(),
    createTemplate: jest.fn(),
    updateTemplate: jest.fn(),
    createVersion: jest.fn(),
    submitResponse: jest.fn(),
    listResponses: jest.fn(),
    getResponse: jest.fn()
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
      controllers: [FieldFormsController],
      providers: [
        {
          provide: FieldFormsService,
          useValue: fieldFormsService
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

  it("GET /api/field-form-templates is manager-only", async () => {
    await request(app.getHttpServer())
      .get("/api/field-form-templates")
      .set("x-test-role", "FIELD")
      .expect(403);

    expect(fieldFormsService.listTemplates).not.toHaveBeenCalled();
  });

  it("POST /api/field-form-templates validates nested schema fields", async () => {
    await request(app.getHttpServer())
      .post("/api/field-form-templates")
      .send({
        name: "Servis Formu",
        versionTitle: "v1",
        schema: {
          fields: [
            {
              key: "summary"
            }
          ]
        }
      })
      .expect(400);

    expect(fieldFormsService.createTemplate).not.toHaveBeenCalled();
  });

  it("POST /api/field-form-templates creates manager templates", async () => {
    fieldFormsService.createTemplate.mockResolvedValue({
      id: "template-1",
      name: "Servis Formu"
    });

    const response = await request(app.getHttpServer())
      .post("/api/field-form-templates")
      .send({
        name: "Servis Formu",
        versionTitle: "v1",
        schema: {
          fields: [
            {
              key: "summary",
              label: "Ozet",
              type: "TEXTAREA"
            }
          ]
        }
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "template-1",
      name: "Servis Formu"
    });
    expect(fieldFormsService.createTemplate).toHaveBeenCalledWith(
      {
        name: "Servis Formu",
        versionTitle: "v1",
        schema: {
          fields: [
            {
              key: "summary",
              label: "Ozet",
              type: "TEXTAREA"
            }
          ]
        }
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("GET /api/field-form-templates/:id returns template detail for managers", async () => {
    fieldFormsService.getTemplate.mockResolvedValue({
      id: "template-1",
      name: "Servis Formu",
      versions: []
    });

    const response = await request(app.getHttpServer())
      .get("/api/field-form-templates/template-1")
      .expect(200);

    expect(response.body).toEqual({
      id: "template-1",
      name: "Servis Formu",
      versions: []
    });
    expect(fieldFormsService.getTemplate).toHaveBeenCalledWith("template-1", {
      sub: "manager-1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: "MANAGER"
    });
  });

  it("PATCH /api/field-form-templates/:id updates manager templates", async () => {
    fieldFormsService.updateTemplate.mockResolvedValue({
      id: "template-1",
      name: "Guncel Form",
      isActive: false
    });

    const response = await request(app.getHttpServer())
      .patch("/api/field-form-templates/template-1")
      .send({
        name: "Guncel Form",
        description: "Yeni aciklama",
        isActive: false
      })
      .expect(200);

    expect(response.body).toEqual({
      id: "template-1",
      name: "Guncel Form",
      isActive: false
    });
    expect(fieldFormsService.updateTemplate).toHaveBeenCalledWith(
      "template-1",
      {
        name: "Guncel Form",
        description: "Yeni aciklama",
        isActive: false
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("POST /api/field-form-responses allows field submissions", async () => {
    fieldFormsService.submitResponse.mockResolvedValue({
      id: "response-1"
    });

    const response = await request(app.getHttpServer())
      .post("/api/field-form-responses")
      .set("x-test-role", "FIELD")
      .send({
        templateVersionId: "version-1",
        projectId: "project-1",
        payload: {
          summary: "Tamam"
        }
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "response-1"
    });
    expect(fieldFormsService.submitResponse).toHaveBeenCalledWith(
      {
        templateVersionId: "version-1",
        projectId: "project-1",
        payload: {
          summary: "Tamam"
        }
      },
      {
        sub: "field-1",
        username: "saha",
        displayName: "Saha Personeli",
        role: "FIELD"
      }
    );
  });

  it("GET /api/field-form-responses is manager-only and forwards filters", async () => {
    fieldFormsService.listResponses.mockResolvedValue([
      {
        id: "response-1",
        templateId: "template-1",
        projectId: "project-1"
      }
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/field-form-responses?templateId=template-1&projectId=project-1&actorId=field-1")
      .expect(200);

    expect(response.body).toEqual([
      {
        id: "response-1",
        templateId: "template-1",
        projectId: "project-1"
      }
    ]);
    expect(fieldFormsService.listResponses).toHaveBeenCalledWith(
      {
        templateId: "template-1",
        projectId: "project-1",
        actorId: "field-1"
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("GET /api/field-form-responses/:id returns manager response detail", async () => {
    fieldFormsService.getResponse.mockResolvedValue({
      id: "response-1",
      templateId: "template-1"
    });

    const response = await request(app.getHttpServer())
      .get("/api/field-form-responses/response-1")
      .expect(200);

    expect(response.body).toEqual({
      id: "response-1",
      templateId: "template-1"
    });
    expect(fieldFormsService.getResponse).toHaveBeenCalledWith("response-1", {
      sub: "manager-1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: "MANAGER"
    });
  });
});

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
