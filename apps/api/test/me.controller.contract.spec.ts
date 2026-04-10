import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { MeController } from "../src/me/me.controller";
import { MeService } from "../src/me/me.service";

describe("MeController contract", () => {
  const meService = {
    getAssignedProgramProjects: jest.fn()
  };

  const jwtAuthGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest();
      request.user = {
        sub: "field-1",
        username: "saha",
        displayName: "Saha Personeli",
        role: "FIELD"
      };
      return true;
    }
  };

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        {
          provide: MeService,
          useValue: meService
        }
      ]
    })
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

  it("GET /api/me/program-projects forwards the current user id", async () => {
    meService.getAssignedProgramProjects.mockResolvedValue([
      {
        assignmentId: "assignment-1",
        dailyProgramProjectId: "program-project-1",
        dailyProgramId: "program-1",
        dailyProgramDate: "2026-04-10T00:00:00.000Z",
        projectId: "project-1",
        projectName: "Merkez Santiye",
        projectCode: "PRJ-001",
        description: "Ana saha",
        customerName: "Merkez Holding",
        locationLabel: "Ankara",
        latitude: 39.92,
        longitude: 32.85,
        activeSession: null,
        mainFiles: []
      }
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/me/program-projects")
      .expect(200);

    expect(response.body).toEqual([
      {
        assignmentId: "assignment-1",
        dailyProgramProjectId: "program-project-1",
        dailyProgramId: "program-1",
        dailyProgramDate: "2026-04-10T00:00:00.000Z",
        projectId: "project-1",
        projectName: "Merkez Santiye",
        projectCode: "PRJ-001",
        description: "Ana saha",
        customerName: "Merkez Holding",
        locationLabel: "Ankara",
        latitude: 39.92,
        longitude: 32.85,
        activeSession: null,
        mainFiles: []
      }
    ]);
    expect(meService.getAssignedProgramProjects).toHaveBeenCalledWith("field-1");
  });
});
