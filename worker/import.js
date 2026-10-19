function fail(message) { throw new Error(message); }
function array(value, name, max) { if (!Array.isArray(value) || value.length > max) fail(`${name} 목록 형식을 확인해 주세요.`); return value; }
function string(value, name, max = 1000) { if (typeof value !== "string" || value.length > max) fail(`${name} 형식을 확인해 주세요.`); return value; }
function integer(value, name, min = 0) { if (!Number.isInteger(value) || value < min || value > 100000) fail(`${name} 숫자를 확인해 주세요.`); return value; }
function optional(value, name, max = 1000) { return value == null ? null : string(value, name, max); }
function unique(items, key, name) { const ids = items.map(item => item[key]); if (new Set(ids).size !== ids.length) fail(`${name} ID가 중복되었습니다.`); }

export async function importT06(request, db, userId) {
  const raw = await request.text();
  if (raw.length > 1000000) fail("가져오기 파일은 1MB 이하여야 합니다.");
  let data;
  try { data = JSON.parse(raw); } catch { fail("JSON 파일 형식이 잘못되었습니다."); }
  if (data?.schemaVersion !== "pds-v2") fail("T06 JSON 내보내기 파일이 필요합니다.");
  const plans = array(data.plans, "계획", 100), revisions = array(data.revisions ?? [], "수정 이력", 500);
  const tasks = array(data.allTasks ?? data.tasks, "할 일", 1000), logs = array(data.allLogs ?? data.logs, "실행 기록", 2000);
  const completions = array(data.completions ?? [], "완료 기록", 1000), actions = array(data.actions ?? [], "다음 계획", 100);
  if (!plans.length || plans.length + revisions.length + tasks.length + logs.length + completions.length + actions.length > 3000) fail("가져올 자료의 건수를 확인해 주세요.");
  if (await db.prepare("SELECT id FROM plans WHERE owner_id=? LIMIT 1").bind(userId).first()) fail("가져오기는 계획이 없는 계정에서 한 번만 할 수 있습니다.");
  unique(plans, "id", "계획"); unique(tasks, "id", "할 일"); unique(logs, "id", "실행 기록");
  const planIds = new Map(plans.map(p => [string(p.id, "계획 ID", 80), crypto.randomUUID()]));
  const taskIds = new Map(tasks.map(t => [string(t.id, "할 일 ID", 80), crypto.randomUUID()]));
  const statements = [];
  for (const p of plans) {
    statements.push(db.prepare("INSERT INTO plans (id,owner_id,title,start_date,end_date,priority,success_criteria,estimated_minutes,carry_forward,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(
      planIds.get(p.id), userId, string(p.title,"계획명",120), string(p.start_date,"시작일",10), string(p.end_date,"종료일",10), integer(p.priority,"우선순위",1), string(p.success_criteria,"성공 기준",500), integer(p.estimated_minutes,"예상 시간"), string(p.carry_forward ?? "","다음 계획",500), string(p.created_at,"작성 시각",40), string(p.updated_at,"수정 시각",40)
    ));
  }
  for (const r of revisions) {
    const pid = planIds.get(r.plan_id); if (!pid) fail("수정 이력의 계획을 찾을 수 없습니다.");
    let old; try { old = JSON.parse(string(r.snapshot_json,"수정 전 내용",5000)); } catch { fail("수정 전 계획의 JSON 형식을 확인해 주세요."); }
    old.id = pid; old.owner_id = userId;
    statements.push(db.prepare("INSERT INTO plan_revisions (id,plan_id,version,snapshot_json,changed_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),pid,integer(r.version,"수정 버전",1),JSON.stringify(old),string(r.changed_at,"수정 시각",40)));
  }
  for (const t of tasks) {
    const pid = planIds.get(t.plan_id); if (!pid) fail("할 일의 계획을 찾을 수 없습니다.");
    statements.push(db.prepare("INSERT INTO tasks (id,plan_id,title,due_date,priority,tag,estimated_minutes,status,completed_at,deleted_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(
      taskIds.get(t.id),pid,string(t.title,"할 일",180),string(t.due_date,"마감일",10),integer(t.priority,"우선순위",1),string(t.tag ?? "","태그",40),integer(t.estimated_minutes,"예상 시간"),t.status === "done" ? "done" : "doing",optional(t.completed_at,"완료 시각",40),optional(t.deleted_at,"삭제 시각",40),string(t.created_at,"작성 시각",40),string(t.updated_at,"수정 시각",40)
    ));
  }
  for (const l of logs) {
    const tid = taskIds.get(l.task_id); if (!tid) fail("실행 기록의 할 일을 찾을 수 없습니다.");
    statements.push(db.prepare("INSERT INTO work_logs (id,task_id,start_at,end_at,actual_minutes,blocker,note,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(
      crypto.randomUUID(),tid,string(l.start_at,"시작 시각",40),string(l.end_at,"끝 시각",40),integer(l.actual_minutes,"실제 시간"),string(l.blocker ?? "","막힘",500),string(l.note ?? "","한 일",500),string(l.created_at,"작성 시각",40)
    ));
  }
  for (const c of completions) {
    const tid = taskIds.get(c.task_id); if (!tid) fail("완료 기록의 할 일을 찾을 수 없습니다.");
    statements.push(db.prepare("INSERT INTO completion_events (task_id,completed_at) VALUES (?,?)").bind(tid,string(c.completed_at,"완료 시각",40)));
  }
  for (const a of actions) {
    const from = planIds.get(a.from_plan_id), to = planIds.get(a.to_plan_id); if (!from || !to) fail("다음 계획 연결을 확인해 주세요.");
    statements.push(db.prepare("INSERT INTO review_actions (id,from_plan_id,to_plan_id,improvement,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),from,to,string(a.improvement,"고칠 점",500),string(a.created_at,"작성 시각",40)));
  }
  await db.batch(statements);
  return new Response(JSON.stringify({ imported: { plans: plans.length, tasks: tasks.length, logs: logs.length } }), { status: 201, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
