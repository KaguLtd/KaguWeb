import { Module } from "@nestjs/common";
import { IdempotencyModule } from "../common/idempotency/idempotency.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProjectsModule } from "../projects/projects.module";
import { ProgramsController } from "./programs.controller";
import { ProgramsService } from "./programs.service";

@Module({
  imports: [IdempotencyModule, ProjectsModule, NotificationsModule],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService]
})
export class ProgramsModule {}
