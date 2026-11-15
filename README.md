# WEB PROJECT CONTROL CENTER PRO

Централизованная платформа для управления несколькими сайтами: аудит, SEO, производительность, UX, безопасность, контент, аналитика, QA и выпуск обновлений.

> Текущий этап: **Foundation / подготовка версии 2.0**. Репозиторий и базовая документация созданы. До завершения интеграций продукт нельзя считать production-ready.

## Цели

- Управлять несколькими независимыми сайтами из одной панели.
- Подключать проекты через GitHub и поддерживаемые платформы публикации.
- Запускать проверки по расписанию и вручную.
- Хранить историю аудитов, отчёты и артефакты.
- Предлагать автоматические исправления с просмотром diff, проверками и возможностью отката.
- Не хранить секреты в браузере и не выполнять проверки сайтов непосредственно из frontend.

## Архитектурное направление

- **Web:** React + TypeScript + Vite.
- **API:** NestJS + TypeScript.
- **Worker:** отдельный процесс для аудитов и фоновых задач.
- **Database:** PostgreSQL + Prisma.
- **Queue/cache:** Redis.
- **Browser QA:** Playwright.
- **Artifacts:** S3-совместимое объектное хранилище в production.
- **Integrations:** GitHub, Cloudflare Pages, Google Search Console, Яндекс Вебмастер/Метрика и другие — поэтапно.

## Модули платформы

1. Multi-Site Control Center
2. SEO Dominator
3. Performance Dominator
4. UX & Conversion
5. Security Guard
6. Content Intelligence
7. Analytics & Growth
8. QA & Release Control
9. AI Auto Fix
10. Automation Orchestrator

## Текущий статус

- [x] Создан отдельный GitHub-репозиторий.
- [x] Создана ветка `v2-foundation`.
- [x] Зафиксировано архитектурное направление.
- [x] Исходный код MVP перенесён в ветку `v2-foundation`.
- [x] CI: установка зависимостей, генерация Prisma Client, TypeScript typecheck и production build прошли успешно (коммит `2cbde8f`).
- [ ] Подготовлена единая схема данных версии 2.0.
- [ ] Реализованы безопасное подключение проектов и управление доступом.
- [ ] Подключены GitHub и Cloudflare.
- [x] Реализованы базовая очередь аудитов, Worker и локальная выдача артефактов; production object storage ещё не подключено.
- [x] Настроен CI для проверки структуры, зависимостей, typecheck и build.
- [ ] Добавлены полноценные unit/integration/e2e тесты для всех сценариев. Один end-to-end smoke test реального аудита успешно проходит в CI.
- [x] Runtime smoke test: API, PostgreSQL, Redis и Worker запущены совместно; health и projects endpoints ответили успешно (CI run `43721048059`).
- [x] End-to-end audit smoke test: создан проект, задание обработано Worker, сохранено 23 проверки и получены `viewport-390.png` / `viewport-1440.png` (CI run `43721200337`); итог тестового аудита — `WARNING`.
- [ ] Подготовлено production-развёртывание.

## Принципы безопасности

- Не хранить токены и пароли в исходниках, Git или frontend.
- Использовать минимальные права интеграций.
- Для сканирования URL реализовать SSRF-защиту, блокировку private/link-local адресов, контроль DNS и egress.
- Все изменения исходников проводить через diff, проверки и отдельный release workflow.
- Не публиковать изменения автоматически без заданной политики разрешений.

## Документация

- [Архитектура](docs/ARCHITECTURE.md)
- [План разработки](docs/ROADMAP.md)
- [Модель безопасности](docs/SECURITY.md)

## Важно

Наличие репозитория и документации не означает, что все перечисленные модули уже реализованы. Фактический статус каждого модуля должен подтверждаться кодом, тестами и результатами интеграционных проверок.


## Текущая фактическая поставка в GitHub

Ветка `v2-foundation` содержит исходники web-интерфейса, API, worker, Prisma-схему, Docker Compose, конфигурацию workspace и документацию.

Подтверждённые проверки:
- CI run `43720816396`: зависимости, Prisma Client, миграции на чистой PostgreSQL, TypeScript typecheck и production build — успешно.
- CI run `43721048059`: API, PostgreSQL, Redis и Worker запущены вместе; health и projects endpoints ответили успешно.
- CI run `43721200337`: создан тестовый проект, Worker обработал аудит, PostgreSQL сохранил 23 проверки; API вернул артефакты `viewport-390.png` и `viewport-1440.png`. Итог аудита тестового сайта — `WARNING`, а не PASSED.

Ограничения:
- Это один успешный end-to-end smoke test, а не полное покрытие тестами.
- Для production всё ещё нужны аутентификация/авторизация, rate limiting, egress firewall и защита от DNS rebinding/SSRF в браузерном worker.
- Не подключено production object storage; не выполнено production-развёртывание.
- Перечень модулей выше описывает целевую платформу, а не подтверждение полной реализации каждого модуля.
