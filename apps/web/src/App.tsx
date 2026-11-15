import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, CheckCircle2, CircleHelp,
  Clock3, Gauge, Globe2, LayoutDashboard, Plus, RefreshCw, Search,
  ShieldCheck, Smartphone, FileText, Settings, Zap
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  environments: { id: string; name: string; url: string }[];
  createdAt: string;
};

const nav = [
  ["Обзор", LayoutDashboard], ["Проекты", Globe2], ["Аудиты", Activity],
  ["Ошибки", AlertTriangle], ["История", Clock3], ["Отчёты", FileText],
  ["Мониторинг", Activity], ["Настройки", Settings],
] as const;

function App() {
  const [page, setPage] = useState("Обзор");
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [runningAudit, setRunningAudit] = useState<string | null>(null);
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [auditDetail, setAuditDetail] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [monitoringData, setMonitoringData] = useState<any>(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);

  async function loadProjects() {
    setLoading(true);
    setApiError("");
    try {
      const response = await fetch("/api/projects");
      if (!response.ok) throw new Error(`API вернул HTTP ${response.status}`);
      setProjects(await response.json());
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось загрузить проекты");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProjects(); }, []);
  useEffect(() => {
    if (page === "История" && projects.length) void loadHistory();
    if (page === "Отчёты" || page === "Ошибки") void loadReports();
    if (page === "Мониторинг") void loadMonitoring();
  }, [page, projects]);

  async function addProject(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setApiError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message?.[0] ?? body.message ?? `Ошибка HTTP ${response.status}`);
      }
      setName("");
      setUrl("");
      setShowAdd(false);
      await loadProjects();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось создать проект");
    } finally {
      setSaving(false);
    }
  }

  async function runAudit(project: Project) {
    const environment = project.environments[0];
    if (!environment) return;
    setRunningAudit(project.id);
    setApiError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/audits`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? `Ошибка HTTP ${response.status}`);
      setActiveAuditId(body.auditId);
      setPage("Аудиты");
      await loadAudit(body.auditId);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось запустить аудит");
    } finally {
      setRunningAudit(null);
    }
  }



  async function loadMonitoring() {
    setMonitoringLoading(true);
    try {
      const response = await fetch("/api/monitoring");
      if (!response.ok) throw new Error(`Не удалось загрузить мониторинг: HTTP ${response.status}`);
      setMonitoringData(await response.json());
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Ошибка загрузки мониторинга");
    } finally {
      setMonitoringLoading(false);
    }
  }

  async function loadReports() {
    setReportLoading(true);
    try {
      const response = await fetch("/api/reports/summary");
      if (!response.ok) throw new Error(`Не удалось загрузить отчёт: HTTP ${response.status}`);
      setReportData(await response.json());
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Ошибка загрузки отчётов");
    } finally {
      setReportLoading(false);
    }
  }

  async function loadHistory() {
    if (!projects.length) {
      setHistoryRows([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const responses = await Promise.all(projects.map(async project => {
        const response = await fetch(`/api/projects/${project.id}/audits`);
        if (!response.ok) return [];
        const rows = await response.json();
        return rows.map((row: any) => ({ ...row, projectName: project.name }));
      }));
      setHistoryRows(responses.flat().sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Не удалось загрузить историю");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadAudit(auditId: string) {
    setAuditLoading(true);
    try {
      const response = await fetch(`/api/audits/${auditId}`);
      if (!response.ok) throw new Error(`Не удалось получить аудит: HTTP ${response.status}`);
      const data = await response.json();
      setAuditDetail(data);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Ошибка загрузки аудита");
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    if (!activeAuditId) return;
    const timer = window.setInterval(() => { void loadAudit(activeAuditId); }, 2500);
    return () => window.clearInterval(timer);
  }, [activeAuditId]);

  const filtered = useMemo(
    () => projects.filter(p => `${p.name} ${p.environments[0]?.url ?? ""}`.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-icon"><Activity size={21}/></div><div><b>CONTROL CENTER</b><small>Website Quality Platform</small></div></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>{nav.map(([label, Icon]) => <button key={label} className={`nav-item ${page === label ? "active" : ""}`} onClick={() => setPage(label)}><Icon size={17}/><span>{label}</span>{label === "Ошибки" && <i className="nav-dot"/>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="online"><span/> API connection depends on local server</div><small>CONTROL CENTER · MVP 0.1.0</small></div>
      </aside>

      <main className="main">
        <header className="topbar"><div className="crumb">Workspace <span>/</span> {page}</div><div className="top-actions"><span className="demo-pill">MVP · LIVE DATA</span><button className="icon-btn" onClick={() => void loadProjects()} title="Обновить"><RefreshCw size={17}/></button><div className="avatar">CC</div></div></header>

        <section className="content">
          <div className="page-heading"><div><div className="eyebrow">WEBSITE OPERATIONS</div><h1>{page === "Обзор" ? "Обзор проектов" : page}</h1><p>Контроль технического состояния и качества веб-сайтов.</p></div><button className="primary-btn" onClick={() => setShowAdd(true)}><Plus size={17}/> Добавить проект</button></div>

          {apiError && <div className="error-banner"><AlertTriangle size={17}/><span>{apiError}. Убедитесь, что API и база данных запущены.</span></div>}

          <div className="notice"><CircleHelp size={17}/><span>Реальные данные проектов загружаются из API. Результаты аудита зависят от доступности API и Worker. Отсутствие результатов не означает успешную проверку.</span></div>

          {page === "Аудиты" && activeAuditId && <AuditPanel audit={auditDetail} loading={auditLoading} onRefresh={() => void loadAudit(activeAuditId)} />}
          {page === "История" && <HistoryPanel rows={historyRows} loading={historyLoading} onRefresh={() => void loadHistory()} onOpen={(id) => { setActiveAuditId(id); setPage("Аудиты"); void loadAudit(id); }} />}
          {(page === "Отчёты" || page === "Ошибки") && <ReportsPanel data={reportData} loading={reportLoading} issuesOnly={page === "Ошибки"} onRefresh={() => void loadReports()} />}
          {page === "Мониторинг" && <MonitoringPanel data={monitoringData} loading={monitoringLoading} onRefresh={() => void loadMonitoring()} onError={setApiError} />}
          <div className="stats-grid">
            <Stat icon={<Globe2/>} label="Всего проектов" value={String(projects.length)} note="Зарегистрировано в системе"/>
            <Stat icon={<CheckCircle2/>} label="Проверено успешно" value="—" note="Ожидается Audit Engine"/>
            <Stat icon={<AlertTriangle/>} label="Требуют внимания" value="—" note="Нет результатов аудита"/>
            <Stat icon={<Gauge/>} label="Средний индекс" value="—" note="Рассчитывается после проверок"/>
          </div>

          <div className="section-head"><div><h2>Ваши проекты</h2><p>Сайты и окружения, зарегистрированные в системе</p></div><div className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск проекта..."/></div></div>

          <div className="project-list">
            {loading ? <div className="empty"><RefreshCw className="spin"/> Загрузка проектов...</div> :
              filtered.length === 0 ? <div className="empty"><Globe2 size={26}/><b>{projects.length ? "Ничего не найдено" : "Пока нет проектов"}</b><span>Добавьте сайт, чтобы начать формировать реестр.</span><button className="secondary-btn" onClick={() => setShowAdd(true)}><Plus size={16}/> Добавить первый проект</button></div> :
              filtered.map(project => <article className="project-card" key={project.id}>
                <div className="project-main"><div className="project-symbol"><Globe2 size={20}/></div><div><b>{project.name}</b><a href={project.environments[0]?.url} target="_blank" rel="noreferrer">{project.environments[0]?.url ?? "URL не указан"} <ArrowUpRight size={12}/></a></div></div>
                <div className="project-status"><span className="status-neutral"><Clock3 size={14}/> Аудит не запускался</span><small>Добавлен {new Date(project.createdAt).toLocaleDateString("ru-RU")}</small></div>
                <button className="more-btn" disabled={runningAudit === project.id} onClick={() => void runAudit(project)}>{runningAudit === project.id ? "Запуск..." : "Запустить аудит"} <ArrowUpRight size={15}/></button>
              </article>)
            }
          </div>

          <div className="lower-grid">
            <div className="panel"><div className="panel-title"><div><h2>Категории контроля</h2><p>Модули, предусмотренные архитектурой</p></div><ShieldCheck size={19}/></div><div className="checks">
              <CheckRow icon={<Zap/>} label="Сборка и публикация" state="В разработке"/>
              <CheckRow icon={<Search/>} label="SEO-аудит" state="В разработке"/>
              <CheckRow icon={<Smartphone/>} label="Адаптивность и интерфейс" state="В разработке"/>
              <CheckRow icon={<FileText/>} label="Формы и заявки" state="В разработке"/>
              <CheckRow icon={<ShieldCheck/>} label="Безопасность" state="В разработке"/>
            </div></div>
            <div className="panel activity-panel"><div className="panel-title"><div><h2>Последняя активность</h2><p>События системы</p></div><Activity size={19}/></div><div className="activity-empty"><Clock3 size={23}/><span>История появится после первых действий и запусков аудита.</span></div></div>
          </div>
        </section>
      </main>

      {showAdd && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowAdd(false); }}><form className="modal" onSubmit={addProject}><div className="modal-head"><div><h2>Новый проект</h2><p>Добавьте сайт в реестр мониторинга.</p></div><button type="button" className="icon-btn" onClick={() => setShowAdd(false)}>×</button></div><label>Название проекта<input required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Например, Корпоративный сайт"/></label><label>URL сайта<input required type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com"/></label><div className="form-note">На этом этапе сайт только регистрируется. Добавление не запускает сканирование.</div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setShowAdd(false)}>Отмена</button><button className="primary-btn" disabled={saving}>{saving ? "Сохранение..." : "Создать проект"}</button></div></form></div>}
    </div>
  );
}

function MonitoringPanel({data, loading, onRefresh, onError}: {data: any; loading: boolean; onRefresh: () => void; onError: (message: string) => void}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [intervals, setIntervals] = useState<Record<string, number>>({});
  useEffect(() => {
    if (data?.projects) {
      setIntervals(Object.fromEntries(data.projects.map((project: any) => [project.id, project.intervalMinutes])));
    }
  }, [data]);
  async function save(project: any, enabled: boolean) {
    setBusy(project.id);
    try {
      const response = await fetch(`/api/monitoring/projects/${project.id}`, {
        method: "PATCH",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({enabled, intervalMinutes: intervals[project.id] ?? project.intervalMinutes}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? `HTTP ${response.status}`);
      onRefresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось изменить настройки мониторинга");
    } finally {
      setBusy(null);
    }
  }
  async function markRead(eventId: string) {
    try {
      await fetch(`/api/monitoring/events/${eventId}/read`, {method:"PATCH"});
      onRefresh();
    } catch {}
  }
  if (loading && !data) return <div className="audit-panel"><div className="empty"><RefreshCw className="spin"/> Загрузка мониторинга...</div></div>;
  if (!data) return <div className="audit-panel"><div className="empty">Нет данных мониторинга.</div></div>;
  const enabledCount = data.projects.filter((p: any) => p.enabled).length;
  const unread = data.events.filter((e: any) => !e.readAt).length;
  return <div className="audit-panel monitoring-panel">
    <div className="audit-head"><div><div className="eyebrow">AUTOMATED OPERATIONS</div><h2>Автоматический мониторинг</h2><p>Плановые аудиты, контроль состояния и журнал событий.</p></div><button className="secondary-btn" onClick={onRefresh}><RefreshCw size={14}/> Обновить</button></div>
    <div className="report-kpis">
      <div className="quality-card"><span>Проектов под наблюдением</span><strong>{enabledCount}</strong><small>Из {data.projects.length} проектов</small></div>
      <div className="quality-card"><span>Отключено</span><strong>{data.projects.length-enabledCount}</strong><small>Без расписания</small></div>
      <div className="quality-card"><span>Непрочитанные события</span><strong>{unread}</strong><small>В журнале мониторинга</small></div>
      <div className="quality-card"><span>Проверка планировщика</span><strong className="good-text">60 сек.</strong><small>Интервал обхода расписания</small></div>
    </div>
    <div className="report-section"><div className="report-section-title"><h3>Расписание проектов</h3><span>После включения первая проверка ставится в очередь сразу</span></div>
      <div className="monitor-project-list">{data.projects.map((project: any) => <div className="monitor-project" key={project.id}>
        <div className="monitor-project-main"><div className={`monitor-indicator ${project.enabled ? "enabled" : ""}`}/><div><b>{project.name}</b><small>{project.url || "Нет production URL"}</small></div></div>
        <div className="monitor-project-meta"><span>{project.latestAudit ? `Последний статус: ${project.latestAudit.status}` : "Ещё не проверялся"}</span><small>{project.nextAuditAt ? `Следующая проверка: ${new Date(project.nextAuditAt).toLocaleString("ru-RU")}` : "Расписание не задано"}</small></div>
        <div className="monitor-controls"><select value={intervals[project.id] ?? project.intervalMinutes} onChange={e => setIntervals(v => ({...v,[project.id]:Number(e.target.value)}))}>{data.intervals.map((minutes: number) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} мин.` : minutes < 1440 ? `${minutes/60} ч.` : "24 ч."}</option>)}</select><button className={project.enabled ? "monitor-toggle active" : "monitor-toggle"} disabled={busy===project.id} onClick={() => void save(project,!project.enabled)}>{busy===project.id ? "..." : project.enabled ? "Выключить" : "Включить"}</button></div>
      </div>)}</div>
      {data.projects.length===0 && <div className="empty compact">Сначала добавьте проекты в реестр.</div>}
    </div>
    <div className="report-section"><div className="report-section-title"><h3>Журнал событий</h3><span>{data.events.length} последних событий</span></div>
      {data.events.length===0 ? <div className="empty compact">Событий пока нет. Включите мониторинг проекта.</div> : <div className="monitor-events">{data.events.map((event: any) => <div className={`monitor-event ${event.readAt ? "read" : ""}`} key={event.id}>
        <div className={`monitor-event-icon ${String(event.severity).toLowerCase()}`}><Activity size={14}/></div><div className="monitor-event-copy"><b>{event.title}</b><span>{event.project?.name ? `${event.project.name} · ` : ""}{event.message}</span><small>{new Date(event.createdAt).toLocaleString("ru-RU")}</small></div>{!event.readAt && <button className="event-read" onClick={() => void markRead(event.id)}>Прочитано</button>}
      </div>)}</div>}
    </div>
    <div className="audit-foot">Автоматические проверки выполняются фоновым Worker. Для работы расписания API должен быть запущен постоянно, а Redis и Worker должны быть доступны.</div>
  </div>;
}

function ReportsPanel({data, loading, issuesOnly, onRefresh}: {data: any; loading: boolean; issuesOnly: boolean; onRefresh: () => void}) {
  const severityLabel: Record<string,string> = { CRITICAL: "Критическая", HIGH: "Высокая", MEDIUM: "Средняя", LOW: "Низкая", NONE: "Не задана" };
  const statusLabel: Record<string,string> = { FAILED: "Ошибка", WARNING: "Предупреждение" };
  const exportCsv = () => {
    if (!data) return;
    const rows = [
      ["Проект","URL","Категория","Проверка","Статус","Серьёзность","Сообщение","Дата аудита"],
      ...data.issues.map((issue: any) => [
        issue.projectName, issue.url, issue.category, issue.name, issue.status,
        issue.severity, issue.message, issue.auditCreatedAt,
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row: any[]) => row.map(value =>
      `"${String(value ?? "").replace(/"/g, '""')}"`
    ).join(";")).join("\\r\\n");
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8"});
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "control-center-issues.csv";
    link.click();
    URL.revokeObjectURL(href);
  };
  if (loading && !data) return <div className="audit-panel"><div className="empty"><RefreshCw className="spin"/> Формирование отчёта...</div></div>;
  if (!data) return <div className="audit-panel"><div className="empty">Нет данных отчётности. Запустите аудит хотя бы одного проекта.</div></div>;
  const totals = data.totals;
  const issues = data.issues ?? [];
  return <div className="audit-panel report-panel">
    <div className="audit-head"><div><div className="eyebrow">{issuesOnly ? "ISSUE CENTER" : "QUALITY ANALYTICS"}</div><h2>{issuesOnly ? "Центр проблем" : "Сводный отчёт по сайтам"}</h2><p>Сводка по последнему завершённому аудиту каждого проекта · {new Date(data.generatedAt).toLocaleString("ru-RU")}</p></div><div className="report-actions"><button className="secondary-btn" onClick={onRefresh}><RefreshCw size={14}/> Обновить</button><button className="secondary-btn" onClick={exportCsv}><FileText size={14}/> CSV</button><button className="secondary-btn" onClick={() => window.print()}>Печать / PDF</button></div></div>
    <div className="report-kpis">
      <div className="quality-card"><span>Всего проектов</span><strong>{totals.projects}</strong><small>В реестре</small></div>
      <div className="quality-card"><span>Проекты с аудитом</span><strong>{totals.auditedProjects}</strong><small>Есть завершённая проверка</small></div>
      <div className="quality-card"><span>Средний индекс</span><strong>{totals.averageScore === null ? "—" : `${totals.averageScore}/100`}</strong><small>По последним аудитам</small></div>
      <div className="quality-card"><span>Критические проблемы</span><strong className={totals.critical ? "danger-text" : "good-text"}>{totals.critical}</strong><small>{totals.failed} ошибок · {totals.warnings} предупреждений</small></div>
    </div>
    {!issuesOnly && <>
      <div className="report-section"><div className="report-section-title"><h3>Состояние проектов</h3><span>Последний завершённый аудит</span></div>
        <div className="report-projects">{data.projects.map((project: any) => <div className="report-project-row" key={project.projectId}>
          <div className="report-project-name"><b>{project.projectName}</b><small>{project.url || "Адрес не указан"}</small></div>
          <div className="report-project-score"><strong>{project.score === null ? "—" : project.score}</strong><small>{project.score === null ? "Не проверен" : "из 100"}</small></div>
          <div className="report-project-issues"><span className="danger-text">{project.failed} ошибок</span><span className="warning-text">{project.warnings} предупреждений</span></div>
        </div>)}</div>
      </div>
      <div className="report-section"><div className="report-section-title"><h3>Проблемы по категориям</h3><span>По последним аудитам проектов</span></div>
        <div className="category-bars">{data.categories.map((category: any) => {
          const max = Math.max(1, ...data.categories.map((item: any) => item.total));
          return <div className="category-bar-row" key={category.category}><span>{category.category}</span><div className="category-bar-track"><i style={{width: `${category.total / max * 100}%`}}/></div><b>{category.failed + category.warnings}</b><small>{category.failed} ошибок · {category.warnings} замечаний</small></div>;
        })}{data.categories.length === 0 && <div className="empty compact">Пока нет данных по категориям.</div>}</div>
      </div>
      <div className="report-section"><div className="report-section-title"><h3>Динамика аудитов</h3><span>Последние 20 завершённых проверок</span></div>
        <div className="trend-list">{data.trend.map((item: any) => <div className="trend-row" key={item.auditId}><span>{item.projectName}</span><div className="trend-track"><i style={{width: `${item.score ?? 0}%`}}/></div><b>{item.score === null ? "—" : item.score}</b><small>{new Date(item.createdAt).toLocaleDateString("ru-RU")}</small></div>)}</div>
      </div>
    </>}
    <div className="report-section"><div className="report-section-title"><h3>{issuesOnly ? "Обнаруженные проблемы" : "Приоритетные проблемы"}</h3><span>До 250 записей из последних аудитов</span></div>
      {issues.length === 0 ? <div className="empty compact"><CheckCircle2 size={20}/> Активных проблем в последних аудитах не найдено.</div> : <div className="issue-table-wrap"><table className="issue-table"><thead><tr><th>Проект / проверка</th><th>Категория</th><th>Статус</th><th>Приоритет</th><th>Описание</th></tr></thead><tbody>{issues.map((issue: any) => <tr key={issue.id}><td><b>{issue.projectName}</b><small>{issue.name}</small></td><td>{issue.category}</td><td><span className={issue.status === "FAILED" ? "danger-text" : "warning-text"}>{statusLabel[issue.status] ?? issue.status}</span></td><td><span className={`severity-chip ${issue.severity.toLowerCase()}`}>{severityLabel[issue.severity] ?? issue.severity}</span></td><td>{issue.message}</td></tr>)}</tbody></table></div>}
    </div>
    <div className="audit-foot">Отчёт основан на последних завершённых аудитах. Отсутствие проверки не трактуется как успешное состояние.</div>
  </div>;
}

function HistoryPanel({rows, loading, onRefresh, onOpen}: {rows: any[]; loading: boolean; onRefresh: () => void; onOpen: (id: string) => void}) {
  const statusLabel: Record<string,string> = { QUEUED: "В очереди", RUNNING: "Выполняется", PASSED: "Успешно", WARNING: "Замечания", FAILED: "Ошибки", CANCELLED: "Отменён" };
  const latestByProject = new Map<string, any[]>();
  rows.forEach(row => {
    const list = latestByProject.get(row.projectId) ?? [];
    list.push(row);
    latestByProject.set(row.projectId, list);
  });
  const comparisons = Array.from(latestByProject.entries()).map(([projectId, list]) => {
    const [latest, previous] = list;
    const latestChecks = new Map((latest?.checks ?? []).map((c: any) => [c.checkKey, c]));
    const previousChecks = new Map((previous?.checks ?? []).map((c: any) => [c.checkKey, c]));
    let fixed = 0, newIssues = 0, unchanged = 0;
    for (const [key, current] of latestChecks.entries()) {
      const old: any = previousChecks.get(key);
      const cur: any = current;
      if (cur.status !== "PASSED" && (!old || old.status === "PASSED")) newIssues++;
      else if (cur.status === "PASSED" && old && old.status !== "PASSED") fixed++;
      else if (old && cur.status === old.status && cur.status !== "PASSED") unchanged++;
    }
    return { projectId, name: latest.projectName, latest, previous, fixed, newIssues, unchanged };
  });
  return <div className="audit-panel history-panel">
    <div className="audit-head"><div><div className="eyebrow">AUDIT TIMELINE</div><h2>История проверок</h2><p>Последние запуски и изменения между двумя последними аудитами каждого проекта.</p></div><button className="secondary-btn" onClick={onRefresh}><RefreshCw size={14}/> Обновить</button></div>
    {loading ? <div className="empty">Загрузка истории...</div> : rows.length === 0 ? <div className="empty"><Clock3 size={24}/><b>История пока пуста</b><span>Запустите аудит проекта, чтобы здесь появились результаты.</span></div> : <>
      <div className="history-comparison">
        <h3>Сравнение последних проверок</h3>
        {comparisons.map(item => <div className="comparison-row" key={item.projectId}>
          <div className="comparison-name"><b>{item.name}</b><small>{item.previous ? "Последний аудит относительно предыдущего" : "Пока только один аудит"}</small></div>
          <div className="comparison-metrics"><span className="fixed">+{item.fixed} исправлено</span><span className="new-issues">+{item.newIssues} новых проблем</span></div>
        </div>)}
      </div>
      <h3 className="history-subtitle">Все запуски</h3>
      <div className="history-list">{rows.map(row => <button className="history-row" key={row.id} onClick={() => onOpen(row.id)}>
        <span className={`history-dot ${String(row.status).toLowerCase()}`}/>
        <span className="history-main"><b>{row.projectName}</b><small>{row.environment?.url ?? "Окружение"} · {new Date(row.createdAt).toLocaleString("ru-RU")}</small></span>
        <span className={`history-status ${String(row.status).toLowerCase()}`}>{statusLabel[row.status] ?? row.status}</span>
        <ArrowUpRight size={15}/>
      </button>)}</div>
    </>}
  </div>;
}

function AuditPanel({audit, loading, onRefresh}: {audit: any; loading: boolean; onRefresh: () => void}) {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  useEffect(() => {
    if (!audit?.id) { setArtifacts([]); return; }
    let cancelled = false;
    fetch(`/api/audits/${audit.id}/artifacts`)
      .then(response => response.ok ? response.json() : [])
      .then(data => { if (!cancelled) setArtifacts(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setArtifacts([]); });
    return () => { cancelled = true; };
  }, [audit?.id, audit?.completedAt]);
  const statusText: Record<string,string> = { QUEUED: "В очереди", RUNNING: "Выполняется", PASSED: "Успешно", WARNING: "Есть замечания", FAILED: "Обнаружены ошибки", CANCELLED: "Отменён" };
  const statusClass: Record<string,string> = { QUEUED: "queued", RUNNING: "running", PASSED: "passed", WARNING: "warning", FAILED: "failed", CANCELLED: "queued" };
  const checks = audit?.checks ?? [];
  const failed = checks.filter((c: any) => c.status === "FAILED").length;
  const warnings = checks.filter((c: any) => c.status === "WARNING").length;
  const critical = checks.filter((c: any) => c.status === "FAILED" && c.severity === "CRITICAL").length;
  const high = checks.filter((c: any) => c.status === "FAILED" && c.severity === "HIGH").length;
  const severityPenalty: Record<string, number> = { CRITICAL: 30, HIGH: 15, MEDIUM: 7, LOW: 3, NONE: 0 };
  const deductions = checks.reduce((sum: number, c: any) => {
    if (c.status === "FAILED") return sum + (severityPenalty[c.severity] ?? 5);
    if (c.status === "WARNING") return sum + Math.max(1, Math.round((severityPenalty[c.severity] ?? 3) * 0.35));
    return sum;
  }, 0);
  const score = checks.length ? Math.max(0, Math.min(100, 100 - deductions)) : null;
  const readiness = !audit || audit.status === "QUEUED" || audit.status === "RUNNING"
    ? "Проверка не завершена"
    : critical > 0 || high > 0
      ? "Не готов к публикации"
      : checks.length < 7
        ? "Недостаточно данных"
        : "Предварительно готов";
  const risk = critical > 0 ? "Критический" : high > 0 ? "Высокий" : failed > 0 || warnings > 0 ? "Умеренный" : checks.length ? "Низкий" : "Не определён";
  return <div className="audit-panel">
    <div className="audit-head"><div><div className="eyebrow">AUDIT EXECUTION</div><h2>Результат проверки</h2><p>{audit?.environment?.url ?? "Получение данных аудита..."}</p></div><button className="secondary-btn" onClick={onRefresh}><RefreshCw size={14}/> Обновить</button></div>
    {loading && !audit ? <div className="empty">Загрузка результата...</div> : audit ? <>
      <div className="audit-summary"><span className={`audit-state ${statusClass[audit.status] ?? "queued"}`}><i/>{statusText[audit.status] ?? audit.status}</span><span className="audit-id">ID: {audit.id}</span><span className="audit-counts">{checks.length} проверок · {failed} ошибок · {warnings} предупреждений</span></div>
      <div className="quality-grid">
        <div className="quality-card"><span>Индекс качества</span><strong>{score === null ? "—" : `${score}/100`}</strong><small>Предварительная оценка по выполненным тестам</small><div className="score-track"><i style={{width: `${score ?? 0}%`}}/></div></div>
        <div className="quality-card"><span>Готовность к публикации</span><strong className={readiness === "Не готов к публикации" ? "danger-text" : readiness === "Предварительно готов" ? "good-text" : "warning-text"}>{readiness}</strong><small>Решение по текущему набору проверок</small></div>
        <div className="quality-card"><span>Уровень риска</span><strong className={risk === "Критический" || risk === "Высокий" ? "danger-text" : risk === "Низкий" ? "good-text" : "warning-text"}>{risk}</strong><small>{critical} критических · {high} высоких проблем</small></div>
      </div>
      {artifacts.length > 0 && <section className="artifact-gallery">
        <div className="artifact-gallery-head"><div><h3>Визуальные материалы</h3><p>Снимки страницы и сравнение с предыдущей проверкой</p></div><span>{artifacts.length} файла</span></div>
        <div className="artifact-grid">{artifacts.map((item: any) => <a className="artifact-card" key={item.name} href={item.url} target="_blank" rel="noreferrer">
          <img src={item.url} alt={item.name} loading="lazy"/>
          <span>{item.name === "viewport-390.png" ? "Мобильная версия · 390 px" : item.name === "viewport-1440.png" ? "Десктоп · 1440 px" : "Визуальные отличия · 390 px"}</span>
          <small>{(item.size / 1024).toFixed(1)} КБ</small>
        </a>)}</div>
      </section>}
      <div className="audit-results">{checks.length === 0 ? <div className="empty compact"><Clock3 size={20}/><span>Проверки ещё выполняются или ожидают запуска.</span></div> : checks.map((c: any) => <div className="result-row" key={c.id}><div className={`result-mark ${c.status.toLowerCase()}`}>{c.status === "PASSED" ? <CheckCircle2 size={15}/> : c.status === "FAILED" ? <AlertTriangle size={15}/> : <CircleHelp size={15}/>}</div><div className="result-copy"><b>{c.name}</b><span>{c.message}</span>{c.category && <small className="result-category">{c.category}</small>}{c.details && <details className="result-details"><summary>Технические детали</summary><pre>{JSON.stringify(c.details, null, 2)}</pre></details>}</div><span className={`result-status ${c.status.toLowerCase()}`}>{({PASSED:"Успешно",WARNING:"Внимание",FAILED:"Ошибка",SKIPPED:"Пропущено"} as Record<string,string>)[c.status] ?? c.status}</span></div>)}</div>
      {(failed > 0 || warnings > 0) && <div className="recommendation-box"><b><AlertTriangle size={14}/> Что исправить в первую очередь</b><span>{critical > 0 ? "Сначала устраните критические ошибки: они блокируют безопасную публикацию." : high > 0 ? "Исправьте ошибки высокого приоритета до публикации." : "Разберите предупреждения и повторите аудит после исправлений."}</span></div>}
      <div className="audit-foot">Создан: {new Date(audit.createdAt).toLocaleString("ru-RU")} {audit.completedAt ? `· Завершён: ${new Date(audit.completedAt).toLocaleString("ru-RU")}` : "· Ожидание завершения"}</div>
    </> : <div className="empty">Нет данных аудита</div>}
  </div>;
}

function Stat({icon, label, value, note}: {icon: React.ReactNode; label: string; value: string; note: string}) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{note}</small></div>;
}
function CheckRow({icon, label, state}: {icon: React.ReactNode; label: string; state: string}) {
  return <div className="check-row"><span className="check-icon">{icon}</span><b>{label}</b><small>{state}</small></div>;
}
export default App;
