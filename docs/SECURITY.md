# Security baseline

## Обязательные требования

### Credentials
- Не коммитить .env, access tokens, API keys, cookies, private keys или реальные пользовательские данные.
- Использовать secret manager или зашифрованные secret references.
- Не возвращать секреты в frontend/API responses после сохранения.
- Поддерживать ротацию и отзыв токенов.

### SSRF and URL scanning
- Разрешать только http/https.
- Блокировать localhost, private, link-local, multicast, reserved и cloud metadata ranges.
- Проверять все A/AAAA DNS ответы и повторно проверять адрес после redirect.
- Защищаться от DNS rebinding.
- Ограничивать redirects, response size, content types, timeouts и concurrency.
- Использовать egress firewall; одной проверки URL на уровне приложения недостаточно.
- Не передавать сканируемому сайту credentials пользователя.

### Browser worker
- Запускать браузер в изолированном контейнере.
- Не монтировать host secrets в browser worker.
- Ограничивать CPU, RAM, процессы, время и сеть.
- Запрещать доступ к внутренним сервисам и metadata endpoints.
- Очищать временные профили и файлы после задачи.

### Authorization
- Проверять workspace/project membership на каждом запросе.
- Использовать минимальные scopes GitHub/Cloudflare.
- Разделять read-only audit и write/deploy permissions.
- Для публикации и изменения исходников применять явные policies и подтверждение.

### AI-generated changes
- Считать внешние страницы и репозитории недоверенными данными.
- Не выполнять команды, найденные в содержимом сайта или README, автоматически.
- Проверять patch в sandbox.
- Запускать тесты, security scans и preview до release.
- Сохранять diff, actor, timestamp, approvals и результаты проверок.

### Operations
- TLS для внешних соединений.
- Безопасные HTTP headers.
- Rate limiting и abuse protection.
- Structured logs без секретов.
- Backup, restore tests и incident response.
- Dependency and container image scanning.

## Release gate

Production release запрещён, если:
- секреты обнаружены в репозитории;
- SSRF/egress controls не настроены;
- отсутствует проверка доступа между проектами;
- миграции БД не проверены;
- критические тесты или security checks не пройдены;
- rollback plan отсутствует.
