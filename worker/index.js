const HTML = __HTML__;
const CSS = __CSS__;
const CLIENT = __CLIENT__;

const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const htmlHeaders = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };

function reply(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: jsonHeaders }); }
function bad(message, status = 400) { return reply({ error: message }, status); }
function assert(ok, message) { if (!ok) throw new Error(message); }
function id() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }
function text(value, name, max = 300, required = true) {
  assert(typeof value === "string", `${name}: 글자를 입력해 주세요.`);
  const clean = value.trim();
  assert(clean.length <= max && (!required || clean.length > 0), `${name}: 1~${max}자를 입력해 주세요.`);
  return clean;
}
function date(value, name) {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value, `${name}: YYYY-MM-DD 날짜를 입력해 주세요.`);
  return value;
}
function priority(value) { assert(Number.isInteger(value) && value >= 1 && value <= 3, "우선순위는 1~3입니다."); return value; }
function minutes(value, name) { assert(Number.isInteger(value) && value >= 0 && value <= 100000, `${name}: 0~100000분을 입력해 주세요.`); return value; }
function timestamp(value, name) { assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value), `${name}: 시간대가 있는 시각을 입력해 주세요.`); return new Date(value).toISOString(); }
function planInput(body) {
  const startDate = date(body.startDate, "시작일"), endDate = date(body.endDate, "종료일");
  assert(startDate <= endDate, "종료일은 시작일 뒤여야 합니다.");
  return { title: text(body.title, "계획명", 120), startDate, endDate, priority: priority(body.priority), successCriteria: text(body.successCriteria, "성공 기준", 500), estimatedMinutes: minutes(body.estimatedMinutes, "예상 시간") };
}
function taskInput(body) { return { title: text(body.title, "할 일", 180), dueDate: date(body.dueDate, "마감일"), priority: priority(body.priority), tag: text(body.tag ?? "", "태그", 40, false), estimatedMinutes: minutes(body.estimatedMinutes, "예상 시간") }; }
async function bodyJson(request) {
  assert((request.headers.get("content-type") || "").startsWith("application/json"), "JSON 요청이 필요합니다.");
  const raw = await request.text();
  assert(raw.length <= 20000, "입력 크기가 너무 큽니다.");
  try { const value = JSON.parse(raw); assert(value && typeof value === "object" && !Array.isArray(value), "JSON 객체가 필요합니다."); return value; }
  catch (error) { throw new Error(error.message === "JSON 객체가 필요합니다." ? error.message : "JSON 형식이 잘못되었습니다."); }
}
async function all(db, sql, ...args) { return (await db.prepare(sql).bind(...args).all()).results; }
async function first(db, sql, ...args) { return await db.prepare(sql).bind(...args).first(); }
async function run(db, sql, ...args) { return await db.prepare(sql).bind(...args).run(); }
function kstToday() { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const map = Object.fromEntries(parts.map(part => [part.type, part.value])); return `${map.year}-${map.month}-${map.day}`; }

async function snapshot(db) {
  const [plans, revisions, tasks, logs, completions, actions] = await Promise.all([
    all(db, "SELECT * FROM plans ORDER BY created_at, id"),
    all(db, "SELECT * FROM plan_revisions ORDER BY plan_id, version"),
    all(db, "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY created_at, id"),
    all(db, "SELECT w.* FROM work_logs w JOIN tasks t ON t.id=w.task_id WHERE t.deleted_at IS NULL ORDER BY w.start_at, w.id"),
    all(db, "SELECT c.* FROM completion_events c JOIN tasks t ON t.id=c.task_id WHERE t.deleted_at IS NULL ORDER BY c.completed_at"),
    all(db, "SELECT * FROM review_actions ORDER BY created_at, id")
  ]);
  const today = kstToday();
  const reviews = plans.map(plan => {
    const own = tasks.filter(t => t.plan_id === plan.id);
    const ids = {
      planned: own.map(t => t.id),
      completed: own.filter(t => t.status === "done").map(t => t.id),
      delayed: own.filter(t => t.status !== "done" && t.due_date < today).map(t => t.id),
      blocked: own.filter(t => logs.some(l => l.task_id === t.id && l.blocker.trim())).map(t => t.id),
      estimated: own.map(t => t.id),
      actual: own.filter(t => logs.some(l => l.task_id === t.id)).map(t => t.id)
    };
    const estimatedMinutes = own.reduce((sum, t) => sum + t.estimated_minutes, 0);
    const actualMinutes = logs.filter(l => own.some(t => t.id === l.task_id)).reduce((sum, l) => sum + l.actual_minutes, 0);
    return { planId: plan.id, todayKst: today, planned: ids.planned.length, completed: ids.completed.length, delayed: ids.delayed.length, blocked: ids.blocked.length, estimatedMinutes, actualMinutes, differenceMinutes: actualMinutes - estimatedMinutes, evidence: ids };
  });
  return { timezone: "Asia/Seoul", plans, revisions, tasks, logs, completions, actions, reviews };
}

async function handleApi(request, db, path) {
  if (request.method === "GET" && path === "/api/snapshot") return reply(await snapshot(db));
  if (request.method === "GET" && path === "/api/export") {
    const data = await snapshot(db);
    const [allTasks, allLogs] = await Promise.all([all(db, "SELECT * FROM tasks ORDER BY created_at,id"), all(db, "SELECT * FROM work_logs ORDER BY start_at,id")]);
    return new Response(JSON.stringify({ exportedAt: now(), schemaVersion: "pds-v2", ...data, allTasks, allLogs }, null, 2), { headers: { ...jsonHeaders, "content-disposition": 'attachment; filename="plan-do-see-diary.json"' } });
  }
  if (request.method !== "POST" && request.method !== "PATCH" && request.method !== "DELETE") return bad("지원하지 않는 요청입니다.", 405);
  const body = request.method === "DELETE" || /^\/api\/tasks\/[0-9a-f-]{36}\/(?:complete|reopen)$/.test(path) ? {} : await bodyJson(request);
  if (path === "/api/plans" && request.method === "POST") {
    const p = planInput(body), key = id(), time = now();
    await run(db, "INSERT INTO plans (id,title,start_date,end_date,priority,success_criteria,estimated_minutes,carry_forward,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", key,p.title,p.startDate,p.endDate,p.priority,p.successCriteria,p.estimatedMinutes,"",time,time);
    return reply({ id: key }, 201);
  }
  const planMatch = path.match(/^\/api\/plans\/([0-9a-f-]{36})$/);
  if (planMatch && request.method === "PATCH") {
    const current = await first(db, "SELECT * FROM plans WHERE id=?", planMatch[1]); if (!current) return bad("계획을 찾을 수 없습니다.", 404);
    const p = planInput(body), versionRow = await first(db, "SELECT COALESCE(MAX(version),0) AS v FROM plan_revisions WHERE plan_id=?", current.id);
    const time = now();
    await db.batch([
      db.prepare("INSERT INTO plan_revisions (id,plan_id,version,snapshot_json,changed_at) VALUES (?,?,?,?,?)").bind(id(), current.id, versionRow.v + 1, JSON.stringify(current), time),
      db.prepare("UPDATE plans SET title=?,start_date=?,end_date=?,priority=?,success_criteria=?,estimated_minutes=?,updated_at=? WHERE id=?").bind(p.title,p.startDate,p.endDate,p.priority,p.successCriteria,p.estimatedMinutes,time,current.id)
    ]);
    return reply({ id: current.id, previousVersion: versionRow.v + 1 });
  }
  const nextMatch = path.match(/^\/api\/plans\/([0-9a-f-]{36})\/next$/);
  if (nextMatch && request.method === "POST") {
    const parent = await first(db, "SELECT * FROM plans WHERE id=?", nextMatch[1]); if (!parent) return bad("이전 계획을 찾을 수 없습니다.", 404);
    const p = planInput(body), improvement = text(body.improvement, "다음에 고칠 점", 500), key = id(), time = now();
    await db.batch([
      db.prepare("INSERT INTO plans (id,title,start_date,end_date,priority,success_criteria,estimated_minutes,carry_forward,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(key,p.title,p.startDate,p.endDate,p.priority,p.successCriteria,p.estimatedMinutes,improvement,time,time),
      db.prepare("INSERT INTO review_actions (id,from_plan_id,to_plan_id,improvement,created_at) VALUES (?,?,?,?,?)").bind(id(),parent.id,key,improvement,time)
    ]);
    return reply({ id: key }, 201);
  }
  if (path === "/api/tasks" && request.method === "POST") {
    const plan = await first(db, "SELECT id FROM plans WHERE id=?", body.planId); if (!plan) return bad("계획을 찾을 수 없습니다.", 404);
    const t = taskInput(body), key = id(), time = now();
    await run(db, "INSERT INTO tasks (id,plan_id,title,due_date,priority,tag,estimated_minutes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", key,plan.id,t.title,t.dueDate,t.priority,t.tag,t.estimatedMinutes,"doing",time,time);
    return reply({ id: key }, 201);
  }
  const taskMatch = path.match(/^\/api\/tasks\/([0-9a-f-]{36})(?:\/(complete|reopen))?$/);
  if (taskMatch) {
    const task = await first(db, "SELECT * FROM tasks WHERE id=? AND deleted_at IS NULL", taskMatch[1]); if (!task) return bad("할 일을 찾을 수 없습니다.", 404);
    if (taskMatch[2] === "complete" && request.method === "POST") {
      const time = now();
      await db.batch([
        db.prepare("UPDATE tasks SET status='done',completed_at=?,updated_at=? WHERE id=? AND status!='done'").bind(time,time,task.id),
        db.prepare("INSERT OR IGNORE INTO completion_events (task_id,completed_at) VALUES (?,?)").bind(task.id,time)
      ]);
      return reply({ id: task.id });
    }
    if (taskMatch[2] === "reopen" && request.method === "POST") {
      await db.batch([
        db.prepare("UPDATE tasks SET status='doing',completed_at=NULL,updated_at=? WHERE id=?").bind(now(),task.id),
        db.prepare("DELETE FROM completion_events WHERE task_id=?").bind(task.id)
      ]);
      return reply({ id: task.id });
    }
    if (!taskMatch[2] && request.method === "PATCH") {
      const t = taskInput(body);
      await run(db, "UPDATE tasks SET title=?,due_date=?,priority=?,tag=?,estimated_minutes=?,updated_at=? WHERE id=?", t.title,t.dueDate,t.priority,t.tag,t.estimatedMinutes,now(),task.id);
      return reply({ id: task.id });
    }
    if (!taskMatch[2] && request.method === "DELETE") {
      await run(db, "UPDATE tasks SET deleted_at=?,updated_at=? WHERE id=?", now(),now(),task.id);
      return reply({ id: task.id });
    }
  }
  if (path === "/api/logs" && request.method === "POST") {
    const task = await first(db, "SELECT * FROM tasks WHERE id=? AND deleted_at IS NULL", body.taskId); if (!task) return bad("할 일을 찾을 수 없습니다.", 404);
    const startAt = timestamp(body.startAt, "시작 시각"), endAt = timestamp(body.endAt, "끝 시각");
    const diff = Date.parse(endAt) - Date.parse(startAt); assert(diff >= 0 && diff <= 7 * 86400000, "끝 시각은 시작 뒤 7일 안이어야 합니다.");
    const actualMinutes = Math.round(diff / 60000), key = id();
    await run(db, "INSERT INTO work_logs (id,task_id,start_at,end_at,actual_minutes,blocker,note,created_at) VALUES (?,?,?,?,?,?,?,?)", key,task.id,startAt,endAt,actualMinutes,text(body.blocker ?? "", "막힌 이유", 500, false),text(body.note ?? "", "한 일", 500, false),now());
    return reply({ id: key, actualMinutes }, 201);
  }
  return bad("요청한 경로를 찾을 수 없습니다.", 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), path = url.pathname;
    if (request.method === "GET" && path === "/") return new Response(HTML, { headers: htmlHeaders });
    if (request.method === "GET" && path === "/app.css") return new Response(CSS, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
    if (request.method === "GET" && path === "/app.js") return new Response(CLIENT, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=3600", "x-content-type-options": "nosniff" } });
    if (!path.startsWith("/api/")) return new Response("Not found", { status: 404 });
    if (!env.DB) return bad("서버 데이터베이스 연결을 확인해 주세요.", 503);
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return bad("다른 사이트에서 보낸 변경 요청은 거부됩니다.", 403);
    }
    try { return await handleApi(request, env.DB, path); }
    catch (error) { if (error instanceof Error && /^(?:D1_|SQLITE_|no such table)/i.test(error.message)) return bad("서버 데이터베이스를 확인해 주세요.", 503); return bad(error instanceof Error ? error.message : "요청을 처리하지 못했습니다."); }
  }
};
