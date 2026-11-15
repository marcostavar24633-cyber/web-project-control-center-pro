import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "./prisma.service";
import { AuditQueueService } from "./audit-queue.service";

const ALLOWED_INTERVALS = [5, 15, 30, 60, 180, 360, 720, 1440];

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private schedulerBusy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: AuditQueueService,
  ) {}

  async list() {
    const [projects, events] = await Promise.all([
      this.prisma.project.findMany({
        include: {
          environments: { where: { type: "PRODUCTION" }, take: 1 },
          audits: { orderBy: { createdAt: "desc" }, take: 1, include: { checks: true } },
        },
        orderBy: { name: "asc" },
      }),
      this.prisma.monitorEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { project: { select: { name: true } } },
      }),
    ]);

    return {
      projects: projects.map(project => ({
        id: project.id,
        name: project.name,
        url: project.environments[0]?.url ?? "",
        enabled: project.monitoringEnabled,
        intervalMinutes: project.monitoringIntervalMinutes,
        nextAuditAt: project.nextAuditAt,
        lastMonitorAt: project.lastMonitorAt,
        latestAudit: project.audits[0] ? {
          id: project.audits[0].id,
          status: project.audits[0].status,
          createdAt: project.audits[0].createdAt,
          completedAt: project.audits[0].completedAt,
          failures: project.audits[0].checks.filter(c => c.status === "FAILED").length,
          warnings: project.audits[0].checks.filter(c => c.status === "WARNING").length,
        } : null,
      })),
      events,
      intervals: ALLOWED_INTERVALS,
    };
  }

  async update(projectId: string, enabled: boolean, intervalMinutes: number) {
    if (!ALLOWED_INTERVALS.includes(intervalMinutes)) {
      throw new Error(`Интервал должен быть одним из значений: ${ALLOWED_INTERVALS.join(", ")}`);
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: { where: { type: "PRODUCTION" }, take: 1 } },
    });
    if (!project) throw new Error("Проект не найден");
    if (enabled && !project.environments[0]) throw new Error("У проекта нет production-окружения");
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        monitoringEnabled: enabled,
        monitoringIntervalMinutes: intervalMinutes,
        nextAuditAt: enabled ? new Date() : null,
      },
    });
    await this.prisma.monitorEvent.create({
      data: {
        type: enabled ? "MONITORING_ENABLED" : "MONITORING_DISABLED",
        severity: "INFO",
        title: enabled ? "Мониторинг включён" : "Мониторинг выключен",
        message: enabled
          ? `Автоматические проверки проекта «${project.name}» запланированы каждые ${intervalMinutes} мин.`
          : `Автоматические проверки проекта «${project.name}» остановлены.`,
        projectId,
      },
    });
    return updated;
  }

  async markRead(eventId: string) {
    return this.prisma.monitorEvent.update({
      where: { id: eventId },
      data: { readAt: new Date() },
    });
  }

  @Interval(60000)
  async scheduleDueAudits() {
    if (this.schedulerBusy) return;
    this.schedulerBusy = true;
    try {
      const due = await this.prisma.project.findMany({
        where: {
          monitoringEnabled: true,
          nextAuditAt: { lte: new Date() },
          environments: { some: { type: "PRODUCTION" } },
        },
        include: { environments: { where: { type: "PRODUCTION" }, take: 1 } },
        take: 25,
        orderBy: { nextAuditAt: "asc" },
      });

      for (const project of due) {
        const active = await this.prisma.auditJob.findFirst({
          where: { projectId: project.id, status: { in: ["QUEUED", "RUNNING"] } },
          select: { id: true },
        });
        const nextAuditAt = new Date(Date.now() + project.monitoringIntervalMinutes * 60000);
        if (active) {
          await this.prisma.project.update({ where: { id: project.id }, data: { nextAuditAt } });
          continue;
        }
        const environment = project.environments[0];
        if (!environment) continue;
        try {
          const audit = await this.prisma.auditJob.create({
            data: {
              projectId: project.id,
              environmentId: environment.id,
              status: "QUEUED",
              trigger: "SCHEDULED",
            },
          });
          await this.queue.enqueue({ auditId: audit.id, url: environment.url });
          await this.prisma.project.update({
            where: { id: project.id },
            data: { nextAuditAt, lastMonitorAt: new Date() },
          });
          this.logger.log(`Scheduled audit ${audit.id} for project ${project.id}`);
        } catch (error) {
          await this.prisma.project.update({
            where: { id: project.id },
            data: { nextAuditAt: new Date(Date.now() + 5 * 60000) },
          });
          this.logger.error(`Could not schedule project ${project.id}`, error);
        }
      }
    } catch (error) {
      this.logger.error("Monitoring scheduler failed", error);
    } finally {
      this.schedulerBusy = false;
    }
  }
}
