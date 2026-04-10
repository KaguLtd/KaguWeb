import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { UsersController } from "../src/users/users.controller";
import { UsersService } from "../src/users/users.service";

describe("UsersController contract", () => {
  const usersService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn()
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

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersService
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
    if (app) {
      await app.close();
    }
  });

  it("GET /api/users forwards filter query params", async () => {
    usersService.findAll.mockResolvedValue([
      {
        id: "user-1",
        username: "saha-1",
        displayName: "Saha Personeli",
        role: "FIELD",
        isActive: true,
        createdAt: "2026-04-09T08:00:00.000Z",
        assignmentCount: 0,
        openSessionCount: 0,
        subscriptionCount: 0
      }
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/users?role=FIELD&status=inactive&query=saha")
      .expect(200);

    expect(response.body).toEqual([
      {
        id: "user-1",
        username: "saha-1",
        displayName: "Saha Personeli",
        role: "FIELD",
        isActive: true,
        createdAt: "2026-04-09T08:00:00.000Z",
        assignmentCount: 0,
        openSessionCount: 0,
        subscriptionCount: 0
      }
    ]);
    expect(usersService.findAll).toHaveBeenCalledWith({
      role: "FIELD",
      status: "inactive",
      query: "saha"
    });
  });

  it("POST /api/users returns the created user summary", async () => {
    usersService.create.mockResolvedValue({
      id: "user-2",
      username: "yeni-saha",
      displayName: "Yeni Saha",
      role: "FIELD",
      isActive: true,
      createdAt: "2026-04-09T08:30:00.000Z",
      assignmentCount: 0,
      openSessionCount: 0,
      subscriptionCount: 0
    });

    const response = await request(app.getHttpServer())
      .post("/api/users")
      .send({
        username: "yeni-saha",
        displayName: "Yeni Saha",
        password: "Secret123",
        role: "FIELD"
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "user-2",
      username: "yeni-saha",
      displayName: "Yeni Saha",
      role: "FIELD",
      isActive: true,
      createdAt: "2026-04-09T08:30:00.000Z",
      assignmentCount: 0,
      openSessionCount: 0,
      subscriptionCount: 0
    });
    expect(usersService.create).toHaveBeenCalledWith({
      username: "yeni-saha",
      displayName: "Yeni Saha",
      password: "Secret123",
      role: "FIELD"
    });
  });

  it("POST /api/users enforces DTO validation before reaching the service", async () => {
    await request(app.getHttpServer())
      .post("/api/users")
      .send({
        username: "kisa",
        displayName: "Eksik Kullanici",
        password: "123",
        role: "FIELD"
      })
      .expect(400);

    expect(usersService.create).not.toHaveBeenCalled();
  });

  it("PATCH /api/users/:id forwards body updates", async () => {
    usersService.update.mockResolvedValue({
      id: "user-2",
      username: "yeni-saha",
      displayName: "Yeni Saha",
      role: "FIELD",
      isActive: false,
      createdAt: "2026-04-09T08:30:00.000Z",
      assignmentCount: 0,
      openSessionCount: 0,
      subscriptionCount: 0
    });

    const response = await request(app.getHttpServer())
      .patch("/api/users/user-2")
      .send({
        displayName: "Yeni Saha",
        isActive: false
      })
      .expect(200);

    expect(response.body.isActive).toBe(false);
    expect(usersService.update).toHaveBeenCalledWith("user-2", {
      displayName: "Yeni Saha",
      isActive: false
    });
  });

  it("DELETE /api/users/:id forwards the delete request", async () => {
    usersService.remove.mockResolvedValue({
      mode: "deleted"
    });

    const response = await request(app.getHttpServer())
      .delete("/api/users/user-2")
      .expect(200);

    expect(response.body).toEqual({
      mode: "deleted"
    });
    expect(usersService.remove).toHaveBeenCalledWith("user-2");
  });

  it("blocks field users from manager-only user endpoints", async () => {
    await request(app.getHttpServer())
      .get("/api/users")
      .set("x-test-role", "FIELD")
      .expect(403);

    expect(usersService.findAll).not.toHaveBeenCalled();
  });
});

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
