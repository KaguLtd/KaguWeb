import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RoutingModule } from "../routing/routing.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [PrismaModule, RoutingModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService]
})
export class DashboardModule {}
