import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma.service";
import { AuditsController } from "./audits.controller";
import { AuditQueueService } from "./audit-queue.service";
import { ReportsController } from "./reports.controller";
import { MonitoringController } from "./monitoring.controller";
import { MonitoringService } from "./monitoring.service";

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [HealthController, ProjectsController, AuditsController, ReportsController, MonitoringController],
  providers: [ProjectsService, PrismaService, AuditQueueService, MonitoringService],
})
export class AppModule {}
