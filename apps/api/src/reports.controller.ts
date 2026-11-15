import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

const penalty: Record<string, number> = { CRITICAL: 30, HIGH: 15, MEDIUM: 7, LOW: 3, NONE: 0 };

@Controller("reports")
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("summary")
  async summary() {
    const [projects, audits] = await Promise.all([
      this.prisma.project.findMany({
        include: { environments: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.auditJob.findMany({
        where: { status: { in: ["PASSED", "WARNING", "FAILED"] } },
        include: { project: true, environment: true, checks: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
    ]);

    const latestByProject = new Map<string, (typeof audits)[number]>();
    for (const audit of audits) {
      if (!latestByProject.has(audit.projectId)) latestByProject.set(audit.projectId, audit);
    }

    const scoreOf = (checks: (typeof audits)[number]["checks"]) => {
      if (!checks.length) return null;
      const deductions = checks.reduce((sum, check) => {
        if (check.status === "FAILED") return sum + (penalty[check.severity] ?? 5);
        if (check.status === "WARNING") return sum + Math.max(1, Math.round((penalty[check.severity] ?? 3) * 0.35));
        return sum;
      }, 0);
      return Math.max(0, Math.min(100, 100 - deductions));
    };

    const projectRows = projects.map(project => {
      const audit = latestByProject.get(project.id);
      const checks = audit?.checks ?? [];
      return {
        projectId: project.id,
        projectName: project.name,
        url: project.environments[0]?.url ?? "",
        auditId: audit?.id ?? null,
        auditStatus: audit?.status ?? "NOT_CHECKED",
        auditedAt: audit?.completedAt ?? audit?.createdAt ?? null,
        score: audit ? scoreOf(checks) : null,
        failed: checks.filter(c => c.status === "FAILED").length,
        warnings: checks.filter(c => c.status === "WARNING").length,
        critical: checks.filter(c => c.status === "FAILED" && c.severity === "CRITICAL").length,
        high: checks.filter(c => c.status === "FAILED" && c.severity === "HIGH").length,
      };
    });

    const latestChecks = Array.from(latestByProject.values()).flatMap(audit =>
      audit.checks.map(check => ({
        ...check,
        projectId: audit.projectId,
        projectName: audit.project.name,
        url: audit.environment.url,
        auditId: audit.id,
        auditCreatedAt: audit.createdAt,
      })),
    );
    const openIssues = latestChecks.filter(check => check.status === "FAILED" || check.status === "WARNING")
      .sort((a, b) => {
        const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
        return (order[a.severity] ?? 5) - (order[b.severity] ?? 5);
      });

    const categoryMap = new Map<string, { category: string; total: number; failed: number; warnings: number; passed: number }>();
    for (const item of latestChecks) {
      const entry = categoryMap.get(item.category) ?? { category: item.category, total: 0, failed: 0, warnings: 0, passed: 0 };
      entry.total++;
      if (item.status === "FAILED") entry.failed++;
      if (item.status === "WARNING") entry.warnings++;
      if (item.status === "PASSED") entry.passed++;
      categoryMap.set(item.category, entry);
    }

    const trend = audits.slice(0, 20).reverse().map(audit => ({
      auditId: audit.id,
      projectName: audit.project.name,
      projectId: audit.projectId,
      createdAt: audit.completedAt ?? audit.createdAt,
      score: scoreOf(audit.checks),
      status: audit.status,
    }));

    const scores = projectRows.map(row => row.score).filter((score): score is number => score !== null);
    return {
      generatedAt: new Date().toISOString(),
      totals: {
        projects: projects.length,
        auditedProjects: projectRows.filter(row => row.auditId).length,
        averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        failed: openIssues.filter(issue => issue.status === "FAILED").length,
        warnings: openIssues.filter(issue => issue.status === "WARNING").length,
        critical: openIssues.filter(issue => issue.severity === "CRITICAL").length,
      },
      projects: projectRows,
      categories: Array.from(categoryMap.values()).sort((a, b) => b.failed + b.warnings - a.failed - a.warnings),
      issues: openIssues.slice(0, 250),
      trend,
    };
  }
}
