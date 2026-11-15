ALTER TABLE "Project"
  ADD COLUMN "monitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "monitoringIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "nextAuditAt" TIMESTAMP(3),
  ADD COLUMN "lastMonitorAt" TIMESTAMP(3);

CREATE TABLE "MonitorEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "projectId" TEXT,
  CONSTRAINT "MonitorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MonitorEvent_createdAt_idx" ON "MonitorEvent"("createdAt");
CREATE INDEX "MonitorEvent_projectId_createdAt_idx" ON "MonitorEvent"("projectId", "createdAt");
ALTER TABLE "MonitorEvent" ADD CONSTRAINT "MonitorEvent_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
