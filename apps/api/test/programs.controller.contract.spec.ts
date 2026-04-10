import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { RateLimitGuard } from "../src/common/security/rate-limit.guard";
import { ProgramsController } from "../src/programs/programs.controller";
import { ProgramsService } from "../src/programs/programs.service";

describe("ProgramsController contract", () => {
  const programsService = {
    createDailyProgram: jest.fn(),
    getProgramMonthSummary: jest.fn(),
    getProgramByDate: jest.fn(),
    updateProgramNote: jest.fn(),
    addProjectToProgram: jest.fn(),
    removeProjectFromProgram: jest.fn(),
    reorderProgramProjects: jest.fn(),
    assignUsers: jest.fn(),
    workStart: jest.fn(),
    workEnd: jest.fn(),
    createEntry: jest.fn(),
    createLocationPing: jest.fn()
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
      controllers: [ProgramsController],
      providers: [
        {
          provide: ProgramsService,
          useValue: programsService
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

  it("POST /api/daily-programs creates a manager daily program", async () => {
    programsService.createDailyProgram.mockResolvedValue({
      id: "program-1",
      date: "2026-04-10T00:00:00.000Z"
    });

    const response = await request(app.getHttpServer())
      .post("/api/daily-programs")
      .send({
        date: "2026-04-10"
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "program-1",
      date: "2026-04-10T00:00:00.000Z"
    });
    expect(programsService.createDailyProgram).toHaveBeenCalledWith(
      {
        date: "2026-04-10"
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("GET /api/daily-programs validates month format before reaching the service", async () => {
    await request(app.getHttpServer())
      .get("/api/daily-programs?month=2026/04")
      .expect(400);

    expect(programsService.getProgramMonthSummary).not.toHaveBeenCalled();
  });

  it("GET /api/daily-programs/:date forwards the selected date", async () => {
    programsService.getProgramByDate.mockResolvedValue({
      id: "program-1",
      date: "2026-04-10",
      managerNote: null,
      programProjects: []
    });

    const response = await request(app.getHttpServer())
      .get("/api/daily-programs/2026-04-10")
      .expect(200);

    expect(response.body).toEqual({
      id: "program-1",
      date: "2026-04-10",
      managerNote: null,
      programProjects: []
    });
    expect(programsService.getProgramByDate).toHaveBeenCalledWith("2026-04-10", {
      sub: "manager-1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: "MANAGER"
    });
  });

  it("POST /api/program-projects/:id/assignments forwards manager assignment updates", async () => {
    programsService.assignUsers.mockResolvedValue([]);

    await request(app.getHttpServer())
      .post("/api/program-projects/program-project-1/assignments")
      .send({
        userIds: ["field-1", "field-2"]
      })
      .expect(201);

    expect(programsService.assignUsers).toHaveBeenCalledWith(
      "program-project-1",
      {
        userIds: ["field-1", "field-2"]
      },
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      }
    );
  });

  it("DELETE /api/program-projects/:id forwards program project removal", async () => {
    programsService.removeProjectFromProgram.mockResolvedValue({
      success: true
    });

    const response = await request(app.getHttpServer())
      .delete("/api/program-projects/program-project-1")
      .expect(200);

    expect(response.body).toEqual({
      success: true
    });
    expect(programsService.removeProjectFromProgram).toHaveBeenCalledWith("program-project-1", {
      sub: "manager-1",
      username: "yonetici",
      displayName: "Ana Yonetici",
      role: "MANAGER"
    });
  });

  it("POST /api/assignments/:id/work-start allows field users and transforms numeric values", async () => {
    programsService.workStart.mockResolvedValue({
      id: "session-1"
    });

    const response = await request(app.getHttpServer())
      .post("/api/assignments/assignment-1/work-start")
      .set("x-test-role", "FIELD")
      .set("x-idempotency-key", "work-start-123")
      .send({
        note: "Sahaya vardim",
        latitude: "39.92",
        longitude: "32.85"
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "session-1"
    });
    expect(programsService.workStart).toHaveBeenCalledWith(
      "assignment-1",
      {
        note: "Sahaya vardim",
        latitude: 39.92,
        longitude: 32.85
      },
      {
        sub: "field-1",
        username: "saha",
        displayName: "Saha Personeli",
        role: "FIELD"
      },
      "work-start-123"
    );
  });

  it("POST /api/assignments/:id/work-end blocks managers before reaching the service", async () => {
    await request(app.getHttpServer())
      .post("/api/assignments/assignment-1/work-end")
      .send({
        note: "Mesai bitti"
      })
      .expect(403);

    expect(programsService.workEnd).not.toHaveBeenCalled();
  });

  it("POST /api/assignments/:id/location-pings forwards numeric payloads for field users", async () => {
    programsService.createLocationPing.mockResolvedValue({
      id: "ping-1"
    });

    const response = await request(app.getHttpServer())
      .post("/api/assignments/assignment-1/location-pings")
      .set("x-test-role", "FIELD")
      .set("x-idempotency-key", "location-ping-123")
      .send({
        latitude: "39.92",
        longitude: "32.85",
        accuracy: "11",
        source: "manual"
      })
      .expect(201);

    expect(response.body).toEqual({
      id: "ping-1"
    });
    expect(programsService.createLocationPing).toHaveBeenCalledWith(
      "assignment-1",
      {
        latitude: 39.92,
        longitude: 32.85,
        accuracy: 11,
        source: "manual"
      },
      {
        sub: "field-1",
        username: "saha",
        displayName: "Saha Personeli",
        role: "FIELD"
      },
      "location-ping-123"
    );
  });

  it("POST /api/assignments/:id/location-pings validates numeric payloads for field users", async () => {
    await request(app.getHttpServer())
      .post("/api/assignments/assignment-1/location-pings")
      .set("x-test-role", "FIELD")
      .send({
        latitude: "invalid",
        longitude: 32.85
      })
      .expect(400);

    expect(programsService.createLocationPing).not.toHaveBeenCalled();
  });
});

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
