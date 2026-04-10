import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RateLimitGuard } from "../src/common/security/rate-limit.guard";

describe("AuthController contract", () => {
  const sessionUser = {
    id: "user-1",
    username: "yonetici",
    displayName: "Ana Yonetici",
    role: "MANAGER" as const
  };

  const authPayload = {
    accessToken: "access-token",
    user: sessionUser
  };

  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn()
  };

  const rateLimitGuard = {
    canActivate: jest.fn(() => true)
  };

  const jwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const request = context.switchToHttp().getRequest();
      request.user = sessionUser;
      return true;
    })
  };

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService
        }
      ]
    })
      .overrideGuard(RateLimitGuard)
      .useValue(rateLimitGuard)
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtAuthGuard)
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

  it("POST /api/auth/login returns the auth payload and a refresh cookie", async () => {
    authService.login.mockResolvedValue({
      auth: authPayload,
      refreshToken: "refresh-token-1",
      rememberMe: true
    });

    const response = await request(app.getHttpServer())
      .post("/api/auth/login")
      .set("User-Agent", "contract-agent")
      .send({
        username: "yonetici",
        password: "Secret123!",
        rememberMe: true
      })
      .expect(201);

    expect(response.body).toEqual(authPayload);
    expect(response.headers["set-cookie"][0]).toContain("kagu_rt=refresh-token-1");
    expect(response.headers["set-cookie"][0]).toContain("Path=/api/auth");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(authService.login).toHaveBeenCalledWith(
      {
        username: "yonetici",
        password: "Secret123!",
        rememberMe: true
      },
      "contract-agent"
    );
  });

  it("POST /api/auth/login enforces validation before reaching the service", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        username: "yonetici"
      })
      .expect(400);

    expect(authService.login).not.toHaveBeenCalled();
  });

  it("POST /api/auth/refresh extracts the refresh cookie and returns a rotated session", async () => {
    authService.refresh.mockResolvedValue({
      auth: authPayload,
      refreshToken: "refresh-token-2",
      rememberMe: false
    });

    const response = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("Cookie", "kagu_rt=current-refresh-token")
      .set("User-Agent", "contract-agent")
      .expect(201);

    expect(response.body).toEqual(authPayload);
    expect(response.headers["set-cookie"][0]).toContain("kagu_rt=refresh-token-2");
    expect(response.headers["set-cookie"][0]).not.toContain("Max-Age=");
    expect(authService.refresh).toHaveBeenCalledWith("current-refresh-token", "contract-agent");
  });

  it("POST /api/auth/logout clears the refresh cookie", async () => {
    authService.logout.mockResolvedValue(undefined);

    const response = await request(app.getHttpServer())
      .post("/api/auth/logout")
      .set("Cookie", "kagu_rt=current-refresh-token")
      .expect(204);

    expect(response.headers["set-cookie"][0]).toContain("kagu_rt=");
    expect(response.headers["set-cookie"][0]).toContain("Max-Age=0");
    expect(authService.logout).toHaveBeenCalledWith("current-refresh-token");
  });

  it("PATCH /api/auth/password returns the auth payload and writes a secure cookie on forwarded https", async () => {
    authService.changePassword.mockResolvedValue({
      auth: authPayload,
      refreshToken: "refresh-token-3",
      rememberMe: true
    });

    const response = await request(app.getHttpServer())
      .patch("/api/auth/password")
      .set("Cookie", "kagu_rt=current-refresh-token")
      .set("User-Agent", "contract-agent")
      .set("x-forwarded-proto", "https")
      .send({
        currentPassword: "OldPass123!",
        newPassword: "NewPass123!"
      })
      .expect(200);

    expect(response.body).toEqual(authPayload);
    expect(response.headers["set-cookie"][0]).toContain("kagu_rt=refresh-token-3");
    expect(response.headers["set-cookie"][0]).toContain("Secure");
    expect(authService.changePassword).toHaveBeenCalledWith(
      sessionUser,
      {
        currentPassword: "OldPass123!",
        newPassword: "NewPass123!"
      },
      "current-refresh-token",
      "contract-agent"
    );
  });
});
