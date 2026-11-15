import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import * as dns from "node:dns/promises";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import ipaddr from "ipaddr.js";
import * as cheerio from "cheerio";
import { chromium, Browser } from "playwright";

const prisma = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

type Check = {
  checkKey: string;
  category: string;
  name: string;
  status: "PASSED" | "WARNING" | "FAILED" | "SKIPPED";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE";
  message: string;
  details?: Record<string, unknown>;
  durationMs: number;
};

function assertPublicAddress(address: string) {
  const parsed = ipaddr.parse(address);
  if (parsed.range() !== "unicast") {
    throw new Error("Проверка заблокирована: адрес не является публичным unicast IP");
  }
}

async function validatePublicTarget(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Разрешены только HTTP и HTTPS");
  if (url.username || url.password) throw new Error("URL с логином или паролем запрещён");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Разрешены только стандартные HTTP/HTTPS порты");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Локальные адреса запрещены");
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length) throw new Error("Не удалось разрешить DNS");
  for (const record of records) assertPublicAddress(record.address);
  return url;
}

async function fetchPublicPage(raw: string) {
  let current = raw;
  for (let redirects = 0; redirects <= 5; redirects++) {
    const url = await validatePublicTarget(current);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "WebProjectControlCenter-Audit/0.1" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) return response;
      current = new URL(location, url).toString();
      continue;
    }
    return response;
  }
  throw new Error("Слишком много перенаправлений");
}

function check(
  checkKey: string, category: string, name: string,
  status: Check["status"], severity: Check["severity"],
  message: string, durationMs: number, details?: Record<string, unknown>,
): Check {
  return { checkKey, category, name, status, severity, message, durationMs, details };
}

async function runBrowserChecks(rawUrl: string, auditId: string): Promise<Check[]> {
  const results: Check[] = [];
  let browser: Browser | undefined;
  const started = Date.now();
  try {
    await validatePublicTarget(rawUrl);
    browser = await chromium.launch({ headless: true });
    const artifactRoot = process.env.AUDIT_ARTIFACTS_DIR || path.resolve(process.cwd(), "artifacts");
    const artifactDir = path.resolve(artifactRoot, auditId);
    await fs.mkdir(artifactDir, { recursive: true });
    const viewports = [
      { width: 360, height: 800, label: "Mobile 360px" },
      { width: 390, height: 844, label: "Mobile 390px" },
      { width: 768, height: 1024, label: "Tablet 768px" },
      { width: 1024, height: 768, label: "Laptop 1024px" },
      { width: 1440, height: 900, label: "Desktop 1440px" },
    ];

    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const pageErrors: string[] = [];
      page.on("pageerror", error => pageErrors.push(error.message));

      // Defense in depth only. A container/network egress firewall is still
      // required to protect against DNS rebinding and browser networking edge cases.
      await page.route("**/*", async route => {
        const requestUrl = route.request().url();
        if (/^(data|blob|about):/i.test(requestUrl)) return route.continue();
        try {
          await validatePublicTarget(requestUrl);
          await route.continue();
        } catch {
          await route.abort("blockedbyclient");
        }
      });

      const viewportStarted = Date.now();
      try {
        await page.goto(rawUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(500);

        const metrics = await page.evaluate(() => {
          const visible = (el: Element) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" &&
              Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1;
          };
          const rectOf = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
          };
          const interactive = Array.from(document.querySelectorAll(
            'a[href],button,input,select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])'
          )).filter(visible).slice(0, 160);
          const overlaps: Array<{ first: string; second: string; overlapArea: number }> = [];
          for (let i = 0; i < interactive.length; i++) {
            for (let j = i + 1; j < interactive.length; j++) {
              const a = interactive[i], b = interactive[j];
              if (a.contains(b) || b.contains(a)) continue;
              const ar = rectOf(a), br = rectOf(b);
              const width = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left));
              const height = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
              const area = width * height;
              const smaller = Math.min(ar.width * ar.height, br.width * br.height);
              // Ignore tiny edge intersections and likely intentional icon/text adjacency.
              if (area > 100 && smaller > 0 && area / smaller > 0.25) {
                overlaps.push({
                  first: (a.getAttribute("aria-label") || a.textContent || a.tagName).trim().slice(0, 70),
                  second: (b.getAttribute("aria-label") || b.textContent || b.tagName).trim().slice(0, 70),
                  overlapArea: Math.round(area),
                });
              }
            }
          }
          const forms = Array.from(document.forms).map((form, index) => ({
            index,
            method: (form.method || "get").toUpperCase(),
            action: form.action,
            controls: Array.from(form.elements).filter(el => el instanceof HTMLInputElement ||
              el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement).map((el: any) => ({
                type: el.type || el.tagName.toLowerCase(),
                name: el.name || "",
                required: Boolean(el.required),
                hasLabel: Boolean(el.labels?.length || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")),
                autocomplete: el.autocomplete || "",
              })),
          }));
          const navToggles = Array.from(document.querySelectorAll(
            'button[aria-expanded], [role="button"][aria-expanded], button[aria-controls]'
          )).map(el => ({
            name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 80),
            expanded: el.getAttribute("aria-expanded"),
            controls: el.getAttribute("aria-controls"),
          }));
          return {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            bodyScrollWidth: document.body.scrollWidth,
            brokenImages: Array.from(document.images)
              .filter(img => img.complete && img.naturalWidth === 0)
              .map(img => img.currentSrc || img.src).slice(0, 10),
            buttonsWithoutName: Array.from(document.querySelectorAll("button,[role='button']"))
              .filter(el => visible(el) && !(el.textContent || "").trim() &&
                !el.getAttribute("aria-label") && !el.getAttribute("title")).length,
            linksWithoutHref: Array.from(document.querySelectorAll("a"))
              .filter(el => visible(el) && !el.getAttribute("href")).length,
            invalidLinks: Array.from(document.querySelectorAll("a[href]"))
              .filter(el => {
                const href = el.getAttribute("href") || "";
                return href.trim() === "#" || /^javascript:/i.test(href.trim());
              }).length,
            documentTitle: document.title,
            interactiveCount: interactive.length,
            overlaps: overlaps.slice(0, 12),
            forms,
            navToggles,
          };
        });

        const horizontal = metrics.scrollWidth > metrics.clientWidth + 1 ||
          metrics.bodyScrollWidth > metrics.clientWidth + 1;
        results.push(check(
          `responsive-overflow-${viewport.width}`, "responsive", `Горизонтальная прокрутка · ${viewport.label}`,
          horizontal ? "WARNING" : "PASSED", horizontal ? "MEDIUM" : "NONE",
          horizontal ? `Ширина контента превышает viewport (${metrics.scrollWidth}px / ${metrics.clientWidth}px)` : "Горизонтальная прокрутка не обнаружена",
          Date.now() - viewportStarted,
          { scrollWidth: metrics.scrollWidth, clientWidth: metrics.clientWidth },
        ));

        if (viewport.width === 390 || viewport.width === 1440) {
          const screenshotName = `viewport-${viewport.width}.png`;
          const screenshotPath = path.join(artifactDir, screenshotName);
          await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled", timeout: 12000 });
          results.push(check(
            `screenshot-${viewport.width}`, "visual", `Скриншот · ${viewport.label}`,
            "PASSED", "NONE", "Снимок страницы сохранён в артефактах аудита",
            0, { artifact: path.relative(process.cwd(), screenshotPath), viewport },
          ));
          if (viewport.width === 390) {
            const currentAudit = await prisma.auditJob.findUnique({
              where: { id: auditId }, select: { projectId: true },
            });
            const previous = currentAudit?.projectId
              ? await prisma.auditJob.findFirst({
                  where: {
                    projectId: currentAudit.projectId,
                    id: { not: auditId },
                    status: { in: ["PASSED", "WARNING", "FAILED"] },
                  },
                  orderBy: { createdAt: "desc" },
                })
              : null;
            if (previous) {
              const baselinePath = path.join(artifactRoot, previous.id, "viewport-390.png");
              try {
                const [baselineBuffer, currentBuffer] = await Promise.all([
                  fs.readFile(baselinePath), fs.readFile(screenshotPath),
                ]);
                const baseline = PNG.sync.read(baselineBuffer);
                const current = PNG.sync.read(currentBuffer);
                if (baseline.width === current.width && baseline.height === current.height) {
                  const diff = new PNG({ width: current.width, height: current.height });
                  const changedPixels = pixelmatch(
                    baseline.data, current.data, diff.data,
                    current.width, current.height, { threshold: 0.12, includeAA: false },
                  );
                  const totalPixels = current.width * current.height;
                  const changedPercent = Number((changedPixels / totalPixels * 100).toFixed(3));
                  const diffPath = path.join(artifactDir, "diff-390.png");
                  await fs.writeFile(diffPath, PNG.sync.write(diff));
                  results.push(check(
                    "visual-diff-390", "visual", "Изменения визуального состояния · 390 px",
                    changedPercent > 2 ? "WARNING" : "PASSED",
                    changedPercent > 10 ? "HIGH" : changedPercent > 2 ? "MEDIUM" : "NONE",
                    `Отличается ${changedPercent}% пикселей относительно аудита ${previous.id}`,
                    0, {
                      baselineAuditId: previous.id,
                      changedPixels,
                      totalPixels,
                      changedPercent,
                      artifact: path.relative(artifactRoot, diffPath),
                      baseline: previous.id + "/viewport-390.png",
                      current: auditId + "/viewport-390.png",
                    },
                  ));
                } else {
                  results.push(check(
                    "visual-diff-390", "visual", "Сравнение скриншотов · 390 px",
                    "SKIPPED", "NONE", "Размеры скриншотов отличаются; сравнение пропущено",
                    0, { baselineSize: [baseline.width, baseline.height], currentSize: [current.width, current.height] },
                  ));
                }
              } catch {
                results.push(check(
                  "visual-diff-390", "visual", "Сравнение скриншотов · 390 px",
                  "SKIPPED", "NONE", "Нет доступного эталонного скриншота предыдущего аудита",
                  0, { baselineAuditId: previous.id },
                ));
              }
            } else {
              results.push(check(
                "visual-diff-390", "visual", "Сравнение скриншотов · 390 px",
                "SKIPPED", "NONE", "Это первый аудит проекта: эталон ещё не создан", 0,
              ));
            }
          }
        }

        if (viewport.width === 390) {
          if (metrics.overlaps.length) {
            results.push(check(
              "interactive-overlaps", "interface", "Возможное наложение интерактивных элементов",
              "WARNING", "MEDIUM", `Найдены потенциальные пересечения: ${metrics.overlaps.length}`,
              0, { overlaps: metrics.overlaps },
            ));
          } else {
            results.push(check(
              "interactive-overlaps", "interface", "Наложение интерактивных элементов",
              "PASSED", "NONE", "Значимых пересечений видимых интерактивных элементов не обнаружено", 0,
            ));
          }

          if (metrics.invalidLinks || metrics.linksWithoutHref) {
            results.push(check(
              "link-markup", "interface", "Разметка ссылок",
              "WARNING", "LOW", `Подозрительных ссылок: ${metrics.invalidLinks}; без href: ${metrics.linksWithoutHref}`,
              0, { invalidLinks: metrics.invalidLinks, linksWithoutHref: metrics.linksWithoutHref },
            ));
          } else {
            results.push(check("link-markup", "interface", "Разметка ссылок", "PASSED", "NONE", "Явных ошибок href не обнаружено", 0));
          }

          const allControls = metrics.forms.flatMap(form => form.controls);
          const unlabeled = allControls.filter(control => !control.hasLabel);
          const passwordOnHttp = allControls.some(control => control.type === "password" && locationProtocol(rawUrl) !== "https:");
          results.push(check(
            "form-a11y", "forms", "Формы и подписи полей",
            unlabeled.length ? "WARNING" : "PASSED", unlabeled.length ? "MEDIUM" : "NONE",
            unlabeled.length ? `Полей без явной подписи: ${unlabeled.length}` : `Форм обнаружено: ${metrics.forms.length}; поля имеют подписи`,
            0, { forms: metrics.forms.slice(0, 8) },
          ));
          if (passwordOnHttp) {
            results.push(check("password-transport", "security", "Передача пароля", "FAILED", "HIGH", "Поле пароля обнаружено на странице без HTTPS", 0));
          }
          results.push(check(
            "navigation-discovery", "interface", "Элементы управления навигацией",
            "PASSED", "NONE", `Обнаружено элементов с aria-expanded/aria-controls: ${metrics.navToggles.length}`,
            0, { controls: metrics.navToggles.slice(0, 10) },
          ));
          if (metrics.buttonsWithoutName > 0) {
            results.push(check(
              "unnamed-buttons", "accessibility", "Доступные имена кнопок",
              "WARNING", "LOW", `Кнопок без текста, aria-label или title: ${metrics.buttonsWithoutName}`, 0,
            ));
          }
          if (metrics.brokenImages.length) {
            results.push(check(
              "broken-images", "interface", "Сломанные изображения",
              "WARNING", "LOW", `Не загрузилось изображений: ${metrics.brokenImages.length}`,
              0, { images: metrics.brokenImages },
            ));
          }
        }

        if (pageErrors.length && viewport.width === 390) {
          results.push(check(
            "browser-errors", "interface", "Ошибки JavaScript",
            "WARNING", "MEDIUM", `Ошибок JavaScript: ${pageErrors.length}`,
            0, { errors: pageErrors.slice(0, 8) },
          ));
        }
      } catch (error) {
        results.push(check(
          `browser-viewport-${viewport.width}`, "responsive", `Проверка страницы · ${viewport.label}`,
          "FAILED", "MEDIUM", error instanceof Error ? error.message : "Ошибка браузерного теста",
          Date.now() - viewportStarted,
        ));
      } finally {
        await page.close();
      }
    }
  } catch (error) {
    results.push(check(
      "browser-launch", "responsive", "Запуск браузерного аудита",
      "FAILED", "HIGH", error instanceof Error ? error.message : "Не удалось запустить браузер",
      Date.now() - started,
    ));
  } finally {
    await browser?.close();
  }
  return results;
}

function locationProtocol(rawUrl: string): string {
  try { return new URL(rawUrl).protocol; } catch { return ""; }
}

const worker = new Worker(
  "site-audits",
  async (job) => {
    const { auditId, url } = job.data as { auditId: string; url: string };
    await prisma.auditJob.update({
      where: { id: auditId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const results: Check[] = [];
    const started = Date.now();
    try {
      const response = await fetchPublicPage(url);
      const elapsed = Date.now() - started;
      const html = await response.text();
      const $ = cheerio.load(html);
      const title = $("title").first().text().trim();
      const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
      const h1Count = $("h1").length;
      const viewport = $('meta[name="viewport"]').attr("content");
      const contentType = response.headers.get("content-type") ?? "";

      results.push(check(
        "http-status", "availability", "HTTP-доступность",
        response.status >= 200 && response.status < 400 ? "PASSED" : "FAILED",
        response.status >= 500 ? "CRITICAL" : response.status >= 400 ? "HIGH" : "NONE",
        `Сайт ответил с HTTP ${response.status}`, elapsed,
        { statusCode: response.status, finalUrl: response.url || url },
      ));

      results.push(check(
        "html-content-type", "availability", "Тип содержимого",
        contentType.includes("text/html") ? "PASSED" : "WARNING",
        contentType.includes("text/html") ? "NONE" : "MEDIUM",
        `Content-Type: ${contentType || "не указан"}`, 0,
      ));

      results.push(check(
        "seo-title", "seo", "SEO Title",
        title ? "PASSED" : "FAILED", title ? "NONE" : "HIGH",
        title ? `Title найден: ${title.slice(0, 140)}` : "На странице отсутствует Title", 0,
      ));

      results.push(check(
        "seo-description", "seo", "Meta Description",
        description ? "PASSED" : "WARNING", description ? "NONE" : "MEDIUM",
        description ? "Meta Description найден" : "Meta Description отсутствует", 0,
        { length: description.length },
      ));

      results.push(check(
        "seo-h1", "seo", "Заголовок H1",
        h1Count === 1 ? "PASSED" : "WARNING",
        h1Count === 1 ? "NONE" : "MEDIUM",
        `Количество H1: ${h1Count}; рекомендуется один основной H1`, 0,
      ));

      results.push(check(
        "responsive-viewport", "responsive", "Viewport для мобильных устройств",
        viewport ? "PASSED" : "FAILED", viewport ? "NONE" : "HIGH",
        viewport ? "Meta viewport найден" : "Отсутствует meta viewport", 0,
        { viewport: viewport ?? null },
      ));

      const headers = response.headers;
      const securityHeaders = ["content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy"];
      for (const header of securityHeaders) {
        const present = headers.has(header);
        results.push(check(
          `security-${header}`, "security", `Security header: ${header}`,
          present ? "PASSED" : "WARNING", present ? "NONE" : "LOW",
          present ? "Заголовок присутствует" : "Заголовок не обнаружен", 0,
        ));
      }

      const finalUrl = response.url || url;
      const isHttps = new URL(finalUrl).protocol === "https:";
      results.push(check(
        "https", "security", "HTTPS",
        isHttps ? "PASSED" : "WARNING", isHttps ? "NONE" : "HIGH",
        isHttps ? "Соединение использует HTTPS" : "Сайт использует HTTP без TLS", 0,
      ));
    } catch (error) {
      results.push(check(
        "site-fetch", "availability", "Доступность сайта",
        "FAILED", "CRITICAL",
        error instanceof Error ? error.message : "Неизвестная ошибка проверки",
        Date.now() - started,
      ));
    }

    const browserResults = await runBrowserChecks(url, auditId);
    results.push(...browserResults);

    await prisma.auditCheck.createMany({
      data: results.map((result) => ({
        ...result,
        auditJobId: auditId,
        checkedAt: new Date(),
        details: result.details as object | undefined,
      })),
    });

    const hasFailure = results.some((r) => r.status === "FAILED");
    const hasWarning = results.some((r) => r.status === "WARNING");
    const finalStatus = hasFailure ? "FAILED" : hasWarning ? "WARNING" : "PASSED";
    const auditMeta = await prisma.auditJob.findUnique({
      where: { id: auditId },
      select: { trigger: true, projectId: true, project: { select: { name: true } } },
    });
    await prisma.auditJob.update({
      where: { id: auditId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    });
    if (auditMeta?.trigger === "SCHEDULED") {
      const eventType = hasFailure ? "ISSUE_DETECTED" : hasWarning ? "WARNING_DETECTED" : "CHECK_COMPLETED";
      const eventSeverity = results.some(r => r.severity === "CRITICAL" && r.status === "FAILED")
        ? "CRITICAL" : hasFailure ? "HIGH" : hasWarning ? "MEDIUM" : "INFO";
      await prisma.monitorEvent.create({
        data: {
          type: eventType,
          severity: eventSeverity,
          title: hasFailure ? "Обнаружены ошибки сайта" : hasWarning ? "Проверка выявила замечания" : "Проверка завершена успешно",
          message: `Автоматическая проверка проекта «${auditMeta.project.name}»: ${results.length} проверок, ${results.filter(r => r.status === "FAILED").length} ошибок, ${results.filter(r => r.status === "WARNING").length} предупреждений.`,
          projectId: auditMeta.projectId,
        },
      });
    }
    return { auditId, status: finalStatus };
  },
  { connection, concurrency: 2 },
);

worker.on("completed", (job) => console.log(`Audit ${job.id} completed`));
worker.on("failed", (job, error) => console.error(`Audit ${job?.id} failed`, error));

console.log("Audit worker started. Waiting for audit jobs.");
