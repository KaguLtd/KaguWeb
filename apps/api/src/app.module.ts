import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { MeModule } from "./me/me.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProgramsModule } from "./programs/programs.module";
import { ProjectsModule } from "./projects/projects.module";
import { StorageModule } from "./storage/storage.module";
import { TrackingModule } from "./tracking/tracking.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]
    }),
    PrismaModule,
    AuthModule,
    DashboardModule,
    UsersModule,
    StorageModule,
    ProjectsModule,
    ProgramsModule,
    MeModule,
    TrackingModule,
    NotificationsModule
  ]
})
export class AppModule {}
