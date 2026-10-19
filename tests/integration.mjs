import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(root, "dist/server/index.js"), "utf8");
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).default;
const sql = await readFile(resolve(root, "drizzle/0000_natural_queen_noir.sql"), "utf8");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys=ON");
for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
const DB = {
  prepare(sqlText) {
    const statement = sqlite.prepare(sqlText);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      all() { return { results: statement.all(...values) }; },
      first() { return statement.get(...values) ?? null; },
      run() { return statement.run(...values); }
    };
  },
  async batch(commands) {
    sqlite.exec("BEGIN");
    try { const results = commands.map(cmd => cmd.run()); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  }
};
async function call(path, method = "GET", data) {
  const response = await worker.fetch(new Request(`https://diary.test${path}`, { method, headers: data ? { "content-type": "application/json", origin: "https://diary.test" } : undefined, body: data ? JSON.stringify(data) : undefined }), { DB });
  const body = await response.json();
  if (response.status >= 400) throw Error(`${method} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}
const plan = { title: "공개 가능한 실제 계획", startDate: "2026-10-19", endDate: "2026-10-25", priority: 1, successCriteria: "검사 10개 통과", estimatedMinutes: 180 };
const { id: planId } = await call("/api/plans", "POST", plan);
assert.equal((await call("/api/snapshot")).plans.length, 1);
await call(`/api/plans/${planId}`, "PATCH", { ...plan, title: "수정한 계획" });
let snapshot = await call("/api/snapshot");
assert.equal(JSON.parse(snapshot.revisions[0].snapshot_json).title, plan.title);
assert.equal(snapshot.plans[0].title, "수정한 계획");

const tasks = [];
for (let i = 0; i < 5; i++) tasks.push((await call("/api/tasks", "POST", { planId, title: i === 0 ? "<script>alert(1)</script>" : `할 일 ${i + 1}`, dueDate: i === 1 ? "2020-01-01" : "2026-10-25", priority: i % 3 + 1, tag: "공개", estimatedMinutes: 30 })).id);
await call(`/api/tasks/${tasks[0]}`, "PATCH", { title: "고친 할 일", dueDate: "2026-10-25", priority: 2, tag: "수정", estimatedMinutes: 45 });
await Promise.all([call(`/api/tasks/${tasks[0]}/complete`, "POST"), call(`/api/tasks/${tasks[0]}/complete`, "POST")]);
snapshot = await call("/api/snapshot");
assert.equal(snapshot.completions.length, 1);
assert.equal(snapshot.reviews[0].completed, 1);
assert.equal(snapshot.reviews[0].planned, 5);
assert.equal(snapshot.reviews[0].delayed, 1);
assert(!snapshot.reviews[0].evidence.delayed.includes(tasks[0]));
await call(`/api/tasks/${tasks[0]}/reopen`, "POST");
assert.equal((await call("/api/snapshot")).reviews[0].completed, 0);
await call(`/api/tasks/${tasks[0]}/complete`, "POST");
for (let i = 0; i < 3; i++) await call("/api/logs", "POST", { taskId: tasks[i], startAt: `2026-10-19T0${i}:00:00+09:00`, endAt: `2026-10-19T0${i}:30:00+09:00`, blocker: i === 1 ? "재료 부족" : "", note: `실행 ${i+1}` });
for (const [startAt, endAt] of [
  [new Date(Date.now() - 600000).toISOString(), new Date(Date.now() - 600000).toISOString()],
  [new Date(Date.now() + 3600000).toISOString(), new Date(Date.now() + 5400000).toISOString()]
]) {
  const response = await worker.fetch(new Request("https://diary.test/api/logs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId: tasks[0], startAt, endAt, blocker: "", note: "검사" }) }), { DB });
  assert.equal(response.status, 400);
}
snapshot = await call("/api/snapshot");
const review = snapshot.reviews[0];
assert.equal(review.blocked, 1);
assert.deepEqual(review.evidence.blocked, [tasks[1]]);
assert.equal(review.actualMinutes, 90);
assert.equal(review.estimatedMinutes, 165);
assert.equal(review.differenceMinutes, -75);
assert.equal(snapshot.plans[0].estimated_minutes, 180);
assert.match(review.todayKst, /^\d{4}-\d{2}-\d{2}$/);
const exportData = await call("/api/export");
assert.equal(exportData.schemaVersion, "pds-v2");
assert.equal(exportData.logs.length, 3);
const { id: nextId } = await call(`/api/plans/${planId}/next`, "POST", { ...plan, title: "다음 계획", improvement: "예상 시간을 넉넉히 잡기" });
snapshot = await call("/api/snapshot");
assert.equal(snapshot.plans.find(p => p.id === nextId).carry_forward, "예상 시간을 넉넉히 잡기");
assert.equal(snapshot.actions.length, 1);
await call(`/api/tasks/${tasks[4]}`, "DELETE");
snapshot = await call("/api/snapshot");
assert.equal(snapshot.reviews[0].planned, 4);
assert.equal(snapshot.reviews[0].estimatedMinutes, 135);
assert.equal((await call("/api/snapshot")).plans[0].id, planId);

const forbidden = await worker.fetch(new Request("https://diary.test/api/plans", { method: "POST", headers: { "content-type": "application/json", origin: "https://elsewhere.test" }, body: JSON.stringify(plan) }), { DB });
assert.equal(forbidden.status, 403);
const js = await (await worker.fetch(new Request("https://diary.test/app.js"), { DB })).text();
assert(!js.includes("innerHTML"));
console.log("PASS plan revisions, 5 tasks, edit/complete/reopen/delete, 3 logs, review evidence, next plan, export, XSS-safe rendering, cross-origin rejection");
