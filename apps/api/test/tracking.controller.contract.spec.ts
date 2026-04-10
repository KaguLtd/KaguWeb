import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { TrackingController } from "../src/tracking/tracking.controller";
import { TrackingService } from "../src/tracking/tracking.service";

describe("TrackingController contract", () => {
  const trackingService = {
    getOverview: jest.fn(),
    getHistory: jest.fn(),
    getProjectLocations: jest.fn()
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
      controllers: [TrackingController],
      providers: [
        {
          provide: TrackingService,
          useValue: trackingService
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

  it("GET /api/tracking/overview forwards filters and returns the overview payload", async () => {
    trackingService.getOverview.mockResolvedValue({
      selectedDate: "2026-04-09",
      activeSessions: [],
      recentLocations: [],
      projectLocations: []
    });

    const response = await request(app.getHttpServer())
      .get("/api/tracking/overview?date=2026-04-09&projectId=project-1&userId=field-1")
      .expect(200);

    expect(response.body).toEqual({
      selectedDate: "2026-04-09",
      activeSessions: [],
      recentLocations: [],
      projectLocations: []
    });
    expect(trackingService.getOverview).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      {
        date: "2026-04-09",
        projectId: "project-1",
        userId: "field-1"
      }
    );
  });

  it("GET /api/tracking/history forwards filters and returns location rows", async () => {
    trackingService.getHistory.mockResolvedValue([
      {
        id: "ping-1",
        latitude: 39.9,
        longitude: 32.8,
        accuracy: 10,
        capturedAt: "2026-04-09T09:10:00.000Z",
        actor: {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Personeli",
          role: "FIELD"
        },
        projectId: "project-1",
        source: "GPS"
      }
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/tracking/history?projectId=project-1")
      .expect(200);

    expect(response.body).toEqual([
      {
        id: "ping-1",
        latitude: 39.9,
        longitude: 32.8,
        accuracy: 10,
        capturedAt: "2026-04-09T09:10:00.000Z",
        actor: {
          id: "field-1",
          username: "saha-1",
          displayName: "Saha Personeli",
          role: "FIELD"
        },
        projectId: "project-1",
        source: "GPS"
      }
    ]);
    expect(trackingService.getHistory).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      {
        date: undefined,
        projectId: "project-1",
        userId: undefined
      }
    );
  });

  it("GET /api/tracking/project-locations forwards the optional date filter", async () => {
    trackingService.getProjectLocations.mockResolvedValue([
      {
        projectId: "project-1",
        projectName: "Merkez Santiye",
        locationLabel: "Ankara",
        latitude: 39.92,
        longitude: 32.85
      }
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/tracking/project-locations?date=2026-04-09")
      .expect(200);

    expect(response.body).toEqual([
      {
        projectId: "project-1",
        projectName: "Merkez Santiye",
        locationLabel: "Ankara",
        latitude: 39.92,
        longitude: 32.85
      }
    ]);
    expect(trackingService.getProjectLocations).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      "2026-04-09"
    );
  });

  it("blocks field users from all tracking endpoints before reaching the service", async () => {
    await request(app.getHttpServer())
      .get("/api/tracking/overview")
      .set("x-test-role", "FIELD")
      .set("x-test-user-id", "field-1")
      .expect(403);

    expect(trackingService.getOverview).not.toHaveBeenCalled();
  });
});

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
