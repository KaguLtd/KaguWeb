import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { NotificationsController } from "../src/notifications/notifications.controller";
import { NotificationsService } from "../src/notifications/notifications.service";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";

describe("NotificationsController contract", () => {
  const notificationsService = {
    getPublicConfig: jest.fn(),
    listCampaigns: jest.fn(),
    listHistory: jest.fn(),
    registerSubscription: jest.fn(),
    unregisterSubscription: jest.fn(),
    sendManual: jest.fn(),
    sendDailyReminder: jest.fn()
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
      const roles = Reflect.getMetadata(ROLES_KEY, context.getHandler()) as string[] | undefined;
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
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: notificationsService
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

  it("GET /api/notifications/public-key returns the push config", async () => {
    notificationsService.getPublicConfig.mockReturnValue({
      enabled: true,
      publicKey: "public-key-1"
    });

    const response = await request(app.getHttpServer())
      .get("/api/notifications/public-key")
      .expect(200);

    expect(response.body).toEqual({
      enabled: true,
      publicKey: "public-key-1"
    });
    expect(notificationsService.getPublicConfig).toHaveBeenCalledTimes(1);
  });

  it("GET /api/notifications/history transforms pagination query parameters", async () => {
    notificationsService.listHistory.mockResolvedValue({
      items: [],
      page: 2,
      pageSize: 5,
      totalCount: 0,
      totalPages: 1
    });

    const response = await request(app.getHttpServer())
      .get("/api/notifications/history?page=2&pageSize=5")
      .set("x-test-role", "FIELD")
      .set("x-test-user-id", "field-1")
      .expect(200);

    expect(response.body).toEqual({
      items: [],
      page: 2,
      pageSize: 5,
      totalCount: 0,
      totalPages: 1
    });
    expect(notificationsService.listHistory).toHaveBeenCalledWith(
      {
        sub: "field-1",
        username: "saha",
        displayName: "Saha Personeli",
        role: "FIELD"
      },
      {
        page: 2,
        pageSize: 5
      }
    );
  });

  it("POST /api/notifications/subscriptions validates nested subscription payloads", async () => {
    await request(app.getHttpServer())
      .post("/api/notifications/subscriptions")
      .set("x-test-role", "FIELD")
      .set("x-test-user-id", "field-1")
      .send({
        endpoint: "https://push.example.com/subscriptions/1",
        keys: {
          p256dh: "key-only"
        }
      })
      .expect(400);

    expect(notificationsService.registerSubscription).not.toHaveBeenCalled();
  });

  it("DELETE /api/notifications/subscriptions/:id forwards the actor and subscription id", async () => {
    notificationsService.unregisterSubscription.mockResolvedValue({
      id: "subscription-1",
      endpoint: "https://push.example.com/subscriptions/1",
      userAgent: "Chrome",
      isActive: false,
      createdAt: "2026-04-09T07:00:00.000Z",
      lastSeenAt: "2026-04-09T07:00:00.000Z"
    });

    const response = await request(app.getHttpServer())
      .delete("/api/notifications/subscriptions/subscription-1")
      .set("x-test-role", "FIELD")
      .set("x-test-user-id", "field-1")
      .expect(200);

    expect(response.body).toEqual({
      id: "subscription-1",
      endpoint: "https://push.example.com/subscriptions/1",
      userAgent: "Chrome",
      isActive: false,
      createdAt: "2026-04-09T07:00:00.000Z",
      lastSeenAt: "2026-04-09T07:00:00.000Z"
    });
    expect(notificationsService.unregisterSubscription).toHaveBeenCalledWith("subscription-1", {
      sub: "field-1",
      username: "saha",
      displayName: "Saha Personeli",
      role: "FIELD"
    });
  });

  it("POST /api/notifications/manual accepts manager payloads and returns the campaign", async () => {
    notificationsService.sendManual.mockResolvedValue({
      id: "campaign-1",
      type: "MANUAL",
      title: "Acil duyuru",
      message: "Merkeze donun",
      targetDate: null,
      createdAt: "2026-04-09T08:30:00.000Z",
      sender: {
        id: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      deliveries: []
    });

    const response = await request(app.getHttpServer())
      .post("/api/notifications/manual")
      .set("x-idempotency-key", "manual-campaign-123")
      .send({
        title: "Acil duyuru",
        message: "Merkeze donun",
        userIds: ["field-1", "field-2"]
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "campaign-1",
      type: "MANUAL",
      title: "Acil duyuru",
      message: "Merkeze donun",
      targetDate: null,
      createdAt: "2026-04-09T08:30:00.000Z",
      sender: {
        id: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      deliveries: []
    });
    expect(notificationsService.sendManual).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      {
        title: "Acil duyuru",
        message: "Merkeze donun",
        userIds: ["field-1", "field-2"]
      },
      "manual-campaign-123"
    );
  });

  it("POST /api/notifications/manual rejects field users before reaching the service", async () => {
    await request(app.getHttpServer())
      .post("/api/notifications/manual")
      .set("x-test-role", "FIELD")
      .set("x-test-user-id", "field-1")
      .send({
        title: "Acil duyuru",
        message: "Merkeze donun",
        userIds: ["field-2"]
      })
      .expect(403);

    expect(notificationsService.sendManual).not.toHaveBeenCalled();
  });

  it("POST /api/notifications/daily-reminder validates the date format before reaching the service", async () => {
    await request(app.getHttpServer())
      .post("/api/notifications/daily-reminder")
      .send({
        date: "10-04-2026"
      })
      .expect(400);

    expect(notificationsService.sendDailyReminder).not.toHaveBeenCalled();
  });
});

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
