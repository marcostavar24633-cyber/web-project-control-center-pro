import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PrismaService } from "./prisma.service";
import { AuditQueueService } from "./audit-queue.service";

@Controller()
export class AuditsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: AuditQueueService,
  ) {}

  @Post("projects/:projectId/audits")
  async start(@Param("projectId") projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { environments: { where: { type: "PRODUCTION" }, take: 1 } },
    });
    if (!project) throw new NotFoundException("Проект не найден");
    const environment = project.environments[0];
    if (!environment) {
      throw new NotFoundException("У проекта нет production-окружения");
    }

    const audit = await this.prisma.auditJob.create({
      data: {
        projectId,
        environmentId: environment.id,
        status: "QUEUED",
        trigger: "MANUAL",
      },
    });
    await this.queue.enqueue({ auditId: audit.id, url: environment.url });
    return {
      auditId: audit.id,
      status: audit.status,
      message: "Проверка поставлена в очередь",
    };
  }

  @Get("audits/:auditId")
  async getAudit(@Param("auditId") auditId: string) {
    const audit = await this.prisma.auditJob.findUnique({
      where: { id: auditId },
      include: {
        project: true,
        environment: true,
        checks: { orderBy: { checkedAt: "asc" } },
      },
    });
    if (!audit) throw new NotFoundException("Аудит не найден");
    return audit;
  }

  @Get("projects/:projectId/audits")
  async history(@Param("projectId") projectId: string) {
    return this.prisma.auditJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { checks: true },
    });
  }

  private artifactRoot() {
    return (
      process.env.AUDIT_ARTIFACTS_DIR ||
      path.resolve(process.cwd(), "../worker/artifacts")
    );
  }

  @Get("audits/:auditId/artifacts")
  async listArtifacts(@Param("auditId") auditId: string) {
    const audit = await this.prisma.auditJob.findUnique({
      where: { id: auditId },
      select: { id: true },
    });
    if (!audit) throw new NotFoundException("Аудит не найден");

    const directory = path.resolve(this.artifactRoot(), auditId);
    try {
      const files = await fs.readdir(directory, { withFileTypes: true });
      const artifacts = [];
      for (const entry of files) {
        if (
          !entry.isFile() ||
          !/^(viewport-(390|1440)|diff-390)\.png$/.test(entry.name)
        ) {
          continue;
        }
        const stat = await fs.stat(path.join(directory, entry.name));
        artifacts.push({
          name: entry.name,
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
          url: `/api/audits/${auditId}/artifacts/${entry.name}`,
        });
      }
      return artifacts;
    } catch {
      return [];
    }
  }

  @Get("audits/:auditId/artifacts/:filename")
  async getArtifact(
    @Param("auditId") auditId: string,
    @Param("filename") filename: string,
    @Res() response: Response,
  ) {
    if (!/^(viewport-(390|1440)|diff-390)\.png$/.test(filename)) {
      throw new BadRequestException("Недопустимое имя файла");
    }

    const audit = await this.prisma.auditJob.findUnique({
      where: { id: auditId },
      select: { id: true },
    });
    if (!audit) throw new NotFoundException("Аудит не найден");

    const filePath = path.resolve(this.artifactRoot(), auditId, filename);
    try {
      const bytes = await fs.readFile(filePath);
      response.setHeader("Content-Type", "image/png");
      response.setHeader("Cache-Control", "private, max-age=60");
      response.send(bytes);
    } catch {
      throw new NotFoundException("Артефакт не найден");
    }
  }
}
