CREATE TYPE "EnvironmentType" AS ENUM ('PRODUCTION', 'STAGING', 'DEVELOPMENT');
CREATE TYPE "AuditStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'WARNING', 'FAILED', 'CANCELLED');
CREATE TYPE "CheckStatus" AS ENUM ('PASSED', 'WARNING', 'FAILED', 'SKIPPED');
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE');

CREATE TABLE "Project" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Environment" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "type" "EnvironmentType" NOT NULL DEFAULT 'PRODUCTION',
  "projectId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditJob" (
  "id" TEXT NOT NULL,
  "status" "AuditStatus" NOT NULL DEFAULT 'QUEUED',
  "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
  "commitSha" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "projectId" TEXT NOT NULL,
  "environmentId" TEXT NOT NULL,
  CONSTRAINT "AuditJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditCheck" (
  "id" TEXT NOT NULL,
  "checkKey" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CheckStatus" NOT NULL,
  "severity" "Severity" NOT NULL DEFAULT 'NONE',
  "message" TEXT NOT NULL,
  "details" JSONB,
  "durationMs" INTEGER,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "auditJobId" TEXT NOT NULL,
  CONSTRAINT "AuditCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Environment_projectId_idx" ON "Environment"("projectId");
CREATE INDEX "AuditJob_projectId_createdAt_idx" ON "AuditJob"("projectId", "createdAt");
CREATE INDEX "AuditJob_status_idx" ON "AuditJob"("status");
CREATE INDEX "AuditCheck_auditJobId_idx" ON "AuditCheck"("auditJobId");

ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditJob" ADD CONSTRAINT "AuditJob_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditJob" ADD CONSTRAINT "AuditJob_environmentId_fkey"
  FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditCheck" ADD CONSTRAINT "AuditCheck_auditJobId_fkey"
  FOREIGN KEY ("auditJobId") REFERENCES "AuditJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
