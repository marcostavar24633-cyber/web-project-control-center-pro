# Roadmap версии 2.0

## Этап 0 — Foundation
- [x] Создать отдельный репозиторий.
- [x] Зафиксировать ветку разработки.
- [x] Подготовить архитектурные и security-принципы.
- [x] Инвентаризировать MVP 1.0.0 и выполнить статический аудит.
- [ ] Перенести все исходники MVP 1.0.0 (пока импортирован только исправленный audits.controller.ts).
- [ ] Запустить локальную сборку и зафиксировать baseline (пока не проверено).
- [ ] Добавить CI для lint, typecheck, tests и build.

Критерий выхода: проект воспроизводимо устанавливается, собирается и проходит базовые проверки.

## Этап 1 — Core Platform
- Workspace, users, roles, authentication.
- Multi-site project registry.
- Project environments и настройки.
- AuditRun/AuditFinding model.
- API validation, pagination, rate limits.
- Worker queue и retry policies.
- Object storage abstraction.

Критерий выхода: пользователь может безопасно добавить несколько сайтов и запускать фоновые задания с историей.

## Этап 2 — Integrations
- GitHub OAuth/App connection.
- Repository and branch discovery.
- Cloudflare Pages project/deployment discovery.
- Deployment status and commit mapping.
- Secret references and revoke flow.

Критерий выхода: проекты можно связать с репозиториями и видеть фактическое состояние публикации.

## Этап 3 — Audit Engine
- HTTP availability and redirect checks.
- Technical SEO and metadata.
- Sitemap, robots.txt, canonical, structured data.
- Mobile viewport and responsive checks.
- Lighthouse/Core Web Vitals integration.
- Link and asset checks.
- Security headers and dependency scanning.
- Playwright screenshots and interaction checks.

Критерий выхода: результаты воспроизводимы, имеют severity, evidence и timestamps.

## Этап 4 — Optimization Intelligence
- SEO recommendations.
- Performance recommendations.
- UX and conversion findings.
- Content quality and factual review.
- Prioritization by impact, effort and confidence.

Критерий выхода: рекомендации привязаны к доказательствам и не маскируются под выполненные исправления.

## Этап 5 — AI Auto Fix
- FixProposal and patch storage.
- Isolated branch creation.
- Diff viewer.
- Tests and preview checks.
- PR-based workflow.
- Rollback and audit trail.

Критерий выхода: ни одно изменение не попадает в production в обход заданной политики.

## Этап 6 — Automation and Analytics
- Scheduled audits.
- Event-driven workflows.
- Retry, timeout and dead-letter handling.
- Search Console / Яндекс integrations.
- Conversion events and project-level reports.

Критерий выхода: автоматизация управляется политиками и имеет наблюдаемую историю выполнения.

## Этап 7 — Production readiness
- SSRF and egress security review.
- Secrets management.
- Backup/restore drills.
- Observability, alerting and SLOs.
- Load and failure testing.
- Access review and incident procedures.
- Deployment and rollback runbooks.

Критерий выхода: production готовность подтверждена тестами и эксплуатационными процедурами.

## Правило статусов

Модуль получает статус Done только после реализации, проверки кода, тестов и документирования ограничений. Макет интерфейса, промт или план не являются реализацией.
