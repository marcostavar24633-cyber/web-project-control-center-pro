import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
  imports: [ScheduleModule.forRoot(), ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
  controllers: [HealthController, ProjectsController, AuditsController, ReportsController, MonitoringController],
  providers: [ProjectsService, PrismaService, AuditQueueService, MonitoringService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
