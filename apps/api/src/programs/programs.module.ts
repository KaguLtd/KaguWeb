import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProjectsModule } from "../projects/projects.module";
import { ProgramsController } from "./programs.controller";
import { ProgramsService } from "./programs.service";

@Module({
  imports: [ProjectsModule, NotificationsModule],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService]
})
export class ProgramsModule {}
