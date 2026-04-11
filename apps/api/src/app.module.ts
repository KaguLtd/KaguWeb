import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module";
import { validateAppEnv } from "./common/config/app-env";
import { IdempotencyModule } from "./common/idempotency/idempotency.module";
import { JobsModule } from "./common/jobs/jobs.module";
import { ObservabilityModule } from "./common/observability/observability.module";
import { RequestContextMiddleware } from "./common/observability/request-context.middleware";
import { RequestLoggingInterceptor } from "./common/observability/request-logging.interceptor";
import { DashboardModule } from "./dashboard/dashboard.module";
import { FieldFormsModule } from "./field-forms/field-forms.module";
import { HealthModule } from "./health/health.module";
import { MeModule } from "./me/me.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProgramTemplatesModule } from "./program-templates/program-templates.module";
import { ProgramsModule } from "./programs/programs.module";
import { ProjectsModule } from "./projects/projects.module";
import { RoutingModule } from "./routing/routing.module";
import { SecurityModule } from "./common/security/security.module";
import { StorageModule } from "./storage/storage.module";
import { TrackingModule } from "./tracking/tracking.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")],
      validate: validateAppEnv
    }),
    ObservabilityModule,
    IdempotencyModule,
    JobsModule,
    SecurityModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    DashboardModule,
    UsersModule,
    FieldFormsModule,
    StorageModule,
    ProjectsModule,
    RoutingModule,
    ProgramTemplatesModule,
    ProgramsModule,
    MeModule,
    TrackingModule,
    NotificationsModule
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor
    }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes({
      path: "*",
      method: RequestMethod.ALL
    });
  }
}
