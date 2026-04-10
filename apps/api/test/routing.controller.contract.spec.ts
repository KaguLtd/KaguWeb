import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { RoutingController } from "../src/routing/routing.controller";
import { RoutingService } from "../src/routing/routing.service";

describe("RoutingController contract", () => {
  const routingService = {
    getRecommendations: jest.fn()
  };

  const jwtAuthGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest();
      const roleHeader = readHeader(request.headers["x-test-role"]);
      const userId = readHeader(request.headers["x-test-user-id"]) ?? "manager-1";
      const role = roleHeader === "FIELD" ? "FIELD" : "MANAGER";

      request.user = {
        sub: userId,
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
      controllers: [RoutingController],
      providers: [
        {
          provide: RoutingService,
          useValue: routingService
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

  it("GET /api/routing/recommendations forwards query filters and returns recommendation payload", async () => {
    routingService.getRecommendations.mockResolvedValue({
      selectedDate: "2026-04-10",
      anchor: null,
      routeMode: "program-order-fallback",
      stops: [],
      skippedProjects: []
    });

    const response = await request(app.getHttpServer())
      .get("/api/routing/recommendations?date=2026-04-10&userId=field-1&anchorProjectId=project-1")
      .expect(200);

    expect(response.body).toEqual({
      selectedDate: "2026-04-10",
      anchor: null,
      routeMode: "program-order-fallback",
      stops: [],
      skippedProjects: []
    });
    expect(routingService.getRecommendations).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      {
        date: "2026-04-10",
        userId: "field-1",
        anchorProjectId: "project-1"
      }
    );
  });

  it("blocks field users from routing recommendations before reaching the service", async () => {
    await request(app.getHttpServer())
      .get("/api/routing/recommendations")
      .set("x-test-role", "FIELD")
      .set("x-test-user-id", "field-1")
      .expect(403);

    expect(routingService.getRecommendations).not.toHaveBeenCalled();
  });
});

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
