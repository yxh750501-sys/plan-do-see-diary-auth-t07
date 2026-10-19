const $ = (selector) => document.querySelector(selector);
const state = { data: null, selectedPlanId: null, evidence: null };
const labels = { 1: "높음", 2: "보통", 3: "낮음" };
const nodes = {};
function el(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = String(value); return node; }
function append(parent, ...children) { for (const child of children) parent.append(child); return parent; }
function chip(value, extra = "") { return el("span", `chip ${extra}`, value); }
function empty(message) { return el("div", "empty", message); }
function showMessage(message, isError = false) { const box = $("#message"); box.textContent = message; box.className = `message${isError ? " error" : ""}`; box.hidden = false; window.clearTimeout(showMessage.timeout); showMessage.timeout = window.setTimeout(() => box.hidden = true, 6500); }
function formatMinutes(value) { const sign = value < 0 ? "−" : ""; const n = Math.abs(value); return `${sign}${n}분`; }
function formatDateTime(value) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function todayKst() { const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const map = Object.fromEntries(parts.map(part => [part.type,part.value])); return `${map.year}-${map.month}-${map.day}`; }
function formObject(form) { return Object.fromEntries(new FormData(form)); }
function planPayload(form) { const v = formObject(form); return { title: v.title, startDate: v.startDate, endDate: v.endDate, priority: Number(v.priority), successCriteria: v.successCriteria, estimatedMinutes: Number(v.estimatedMinutes) }; }
function taskPayload(form) { const v = formObject(form); return { title: v.title, dueDate: v.dueDate, priority: Number(v.priority), tag: v.tag, estimatedMinutes: Number(v.estimatedMinutes) }; }
function currentPlan() { return state.data?.plans.find(p => p.id === state.selectedPlanId); }
function currentReview() { return state.data?.reviews.find(r => r.planId === state.selectedPlanId); }
function ownTasks() { return state.data?.tasks.filter(t => t.plan_id === state.selectedPlanId) ?? []; }
async function request(path, method = "GET", body) {
  const response = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await response.json();
  if (response.status === 401) { location.replace("/"); throw new Error("로그인이 필요합니다."); }
  if (!response.ok) throw new Error(data.error || `서버 오류 ${response.status}`);
  return data;
}
async function refresh(keepSelection = true) {
  const data = await request("/api/snapshot");
  state.data = data;
  if (!keepSelection || !data.plans.some(p => p.id === state.selectedPlanId)) state.selectedPlanId = data.plans[0]?.id ?? null;
  render();
}
async function change(path, method, body, message) { try { await request(path, method, body); await refresh(); showMessage(message); } catch (error) { showMessage(error.message, true); } }
function smallButton(text, action, id, danger = false) { const b = el("button", danger ? "danger" : "", text); b.type = "button"; b.dataset.action = action; b.dataset.id = id; return b; }

function renderPlans() {
  const data = state.data, list = $("#plan-list"), selector = $("#active-plan");
  list.replaceChildren(); selector.replaceChildren();
  $("#plan-count").textContent = `${data.plans.length}개`;
  if (!data.plans.length) { list.append(empty("먼저 본인의 실제 계획을 저장해 주세요.")); selector.append(el("option", "", "계획을 먼저 만드세요")); return; }
  for (const plan of data.plans) {
    const option = el("option", "", plan.title); option.value = plan.id; selector.append(option);
    const card = el("article", `plan-item${plan.id === state.selectedPlanId ? " active" : ""}`);
    const main = el("div", "plan-main"), info = el("div"); append(info, el("h4", "", plan.title), el("p", "", plan.success_criteria));
    append(main, info, chip(`우선순위 ${labels[plan.priority]}`)); card.append(main);
    const meta = el("div", "plan-meta"); append(meta, chip(`${plan.start_date} → ${plan.end_date}`), chip(`예상 ${formatMinutes(plan.estimated_minutes)}`)); card.append(meta);
    if (plan.carry_forward) card.append(el("p", "carry-note", `↗ 이전 돌아보기: ${plan.carry_forward}`));
    const actions = el("div", "small-actions"); append(actions, smallButton("이 계획 보기", "select-plan", plan.id), smallButton("계획 수정", "edit-plan", plan.id)); card.append(actions);
    const revisions = data.revisions.filter(r => r.plan_id === plan.id);
    if (revisions.length) { const details = el("details", "revision-list"), summary = el("summary", "", `수정 전 계획 ${revisions.length}개 보존`); details.append(summary); for (const r of revisions) { const original = JSON.parse(r.snapshot_json); details.append(el("div", "revision", `v${r.version} · ${original.title} · ${original.start_date}~${original.end_date} · ${original.success_criteria} · 예상 ${formatMinutes(original.estimated_minutes)}`)); } card.append(details); }
    list.append(card);
  }
  selector.value = state.selectedPlanId;
}

function taskStatus(task, review) { if (task.status === "done") return "done"; if (review?.evidence.delayed.includes(task.id)) return "delayed"; return "doing"; }
function renderTasks() {
  const tasks = ownTasks(), review = currentReview(), list = $("#task-list"), logSelect = $("#log-task");
  list.replaceChildren(); logSelect.replaceChildren();
  $("#task-count").textContent = `${tasks.length}개`;
  for (const task of tasks) { const option = el("option", "", task.title); option.value = task.id; logSelect.append(option); }
  if (!tasks.length) logSelect.append(el("option", "", "할 일을 먼저 만드세요"));
  const query = $("#task-search").value.trim().toLocaleLowerCase(), filter = $("#task-filter").value, sort = $("#task-sort").value;
  let shown = tasks.filter(t => (`${t.title} ${t.tag}`).toLocaleLowerCase().includes(query));
  if (filter === "doing") shown = shown.filter(t => t.status === "doing");
  if (filter === "done") shown = shown.filter(t => t.status === "done");
  if (filter === "delayed") shown = shown.filter(t => review?.evidence.delayed.includes(t.id));
  if (filter === "blocked") shown = shown.filter(t => review?.evidence.blocked.includes(t.id));
  if (state.evidence) shown = shown.filter(t => state.evidence.includes(t.id));
  shown.sort((a,b) => {
    if (sort === "priority") return a.priority - b.priority || a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
    if (sort === "due") return a.due_date.localeCompare(b.due_date) || a.priority - b.priority || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });
  if (!shown.length) { list.append(empty(state.evidence ? "이 숫자에 해당하는 할 일이 없습니다." : "조건에 맞는 할 일이 없습니다.")); return; }
  for (const task of shown) {
    const status = taskStatus(task, review), card = el("article", `task-item ${status}${state.evidence ? " highlight" : ""}`); card.id = `task-${task.id}`;
    const info = el("div", "task-info"); append(info, el("span", `task-status ${status}`, status === "done" ? "완료" : status === "delayed" ? "지연" : "진행 중"), el("h4", "", task.title));
    const meta = el("div", "task-meta"); append(meta, chip(`마감 ${task.due_date}`), chip(`우선순위 ${labels[task.priority]}`), chip(`예상 ${formatMinutes(task.estimated_minutes)}`)); if (task.tag) meta.append(chip(`#${task.tag}`)); if (review?.evidence.blocked.includes(task.id)) meta.append(chip("막힘 기록", "orange")); info.append(meta);
    const taskLogs = state.data.logs.filter(l => l.task_id === task.id); if (taskLogs.length) info.append(el("p", "", `실제 ${formatMinutes(taskLogs.reduce((sum,l) => sum+l.actual_minutes,0))} · 실행 기록 ${taskLogs.length}건`));
    const actions = el("div", "small-actions"); append(actions, smallButton(task.status === "done" ? "진행 중으로" : "완료", task.status === "done" ? "reopen" : "complete", task.id), smallButton("수정", "edit-task", task.id), smallButton("삭제", "delete-task", task.id, true)); append(card, info, actions); list.append(card);
  }
}

function renderReview() {
  const review = currentReview(), cards = $("#review-cards"), time = $("#time-review"), logList = $("#log-list"); cards.replaceChildren(); time.replaceChildren(); logList.replaceChildren();
  if (!review) { cards.append(empty("계획을 저장하면 돌아보기가 시작됩니다.")); $("#log-count").textContent = "0건"; return; }
  const metrics = [["계획 수", review.planned, "planned"],["완료 수",review.completed,"completed"],["지연 수",review.delayed,"delayed"],["막힘 수",review.blocked,"blocked"]];
  for (const [label,value,key] of metrics) { const card = el("button", "review-card"); card.type = "button"; card.dataset.metric = key; append(card, el("span", "", label), el("strong", "", value), el("small", "", "눌러서 근거 할 일 보기 ↗")); cards.append(card); }
  for (const [label,value,key] of [["예상 시간",review.estimatedMinutes,"estimated"],["실제 시간",review.actualMinutes,"actual"],["차이 · 실제 − 예상",review.differenceMinutes,"estimated"]]) { const row = el("div", "time-row"), button = el("button", "", formatMinutes(value)); button.type = "button"; button.dataset.metric = key; append(row, el("span", "", label), button); time.append(row); }
  const ownIds = new Set(ownTasks().map(t => t.id)), logs = state.data.logs.filter(l => ownIds.has(l.task_id)); $("#log-count").textContent = `${logs.length}건`;
  if (!logs.length) logList.append(empty("실제로 한 일을 남기면 이곳에 쌓입니다."));
  for (const log of logs.slice().reverse()) { const task = state.data.tasks.find(t => t.id === log.task_id); const item = el("article", "log-item"), main = el("div"); append(main, el("strong", "", task?.title ?? "삭제된 할 일"), el("p", "", `${formatDateTime(log.start_at)} → ${formatDateTime(log.end_at)}`)); if (log.note) main.append(el("p", "", `한 일: ${log.note}`)); if (log.blocker) main.append(el("p", "", `막힌 이유: ${log.blocker}`)); append(item, main, el("span", "duration", formatMinutes(log.actual_minutes))); logList.append(item); }
}
function render() { renderPlans(); renderTasks(); renderReview(); }
function fill(form, values) { for (const [name,value] of Object.entries(values)) { const field = form.elements.namedItem(name); if (field) field.value = value ?? ""; } }
function resetPlanForm() { const form = $("#plan-form"); form.reset(); $("#plan-edit-id").value = ""; $("#plan-form-heading").textContent = "새 계획 만들기"; $("#plan-submit").textContent = "계획 저장"; $("#plan-cancel").hidden = true; form.elements.namedItem("startDate").value = todayKst(); form.elements.namedItem("endDate").value = todayKst(); }
function resetTaskForm() { const form = $("#task-form"); form.reset(); $("#task-edit-id").value = ""; $("#task-form-heading").textContent = "할 일 추가"; $("#task-submit").textContent = "할 일 저장"; $("#task-cancel").hidden = true; form.elements.namedItem("dueDate").value = todayKst(); }
function setNextDates() { const form = $("#next-form"); form.elements.namedItem("startDate").value = todayKst(); form.elements.namedItem("endDate").value = todayKst(); }
function showEvidence(key) { state.evidence = currentReview()?.evidence[key] ?? []; $("#task-search").value = ""; $("#task-filter").value = "all"; renderTasks(); $("#do").scrollIntoView({ behavior: "smooth" }); showMessage(`${key === "planned" ? "계획" : key === "completed" ? "완료" : key === "delayed" ? "지연" : key === "blocked" ? "막힘" : "시간"} 집계의 근거 할 일 ${state.evidence.length}개를 표시했습니다.`); }

$("#plan-form").addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget, p = planPayload(form), editId = $("#plan-edit-id").value; try { const result = await request(editId ? `/api/plans/${editId}` : "/api/plans", editId ? "PATCH" : "POST", p); state.selectedPlanId = result.id; state.evidence = null; resetPlanForm(); await refresh(); showMessage(editId ? "계획을 수정했고 이전 내용은 이력에 남았습니다." : "계획을 저장했습니다."); } catch (error) { showMessage(error.message, true); } });
$("#task-form").addEventListener("submit", async event => { event.preventDefault(); if (!state.selectedPlanId) return showMessage("계획을 먼저 만드세요.", true); const editId = $("#task-edit-id").value, body = taskPayload(event.currentTarget); if (!editId) body.planId = state.selectedPlanId; try { await request(editId ? `/api/tasks/${editId}` : "/api/tasks", editId ? "PATCH" : "POST", body); state.evidence = null; resetTaskForm(); await refresh(); showMessage(editId ? "할 일을 수정했습니다." : "할 일을 저장했습니다."); } catch (error) { showMessage(error.message, true); } });
$("#log-form").addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget, v = formObject(form); if (!state.selectedPlanId || !ownTasks().length) return showMessage("할 일을 먼저 만드세요.", true); try { await request("/api/logs", "POST", { taskId: v.taskId, startAt: new Date(v.startAt).toISOString(), endAt: new Date(v.endAt).toISOString(), blocker: v.blocker, note: v.note }); form.reset(); await refresh(); showMessage("실행 기록을 저장했습니다. 원래 계획은 그대로입니다."); } catch (error) { showMessage(error.message, true); } });
$("#next-form").addEventListener("submit", async event => { event.preventDefault(); if (!state.selectedPlanId) return showMessage("계획을 먼저 만드세요.", true); const form = event.currentTarget, body = { ...planPayload(form), improvement: form.elements.namedItem("improvement").value }; try { const result = await request(`/api/plans/${state.selectedPlanId}/next`, "POST", body); state.selectedPlanId = result.id; state.evidence = null; form.reset(); setNextDates(); await refresh(); showMessage("고칠 점 한 줄이 다음 계획으로 이어졌습니다."); $("#plan").scrollIntoView({ behavior: "smooth" }); } catch (error) { showMessage(error.message, true); } });
$("#plan-cancel").addEventListener("click", resetPlanForm); $("#task-cancel").addEventListener("click", resetTaskForm);
$("#active-plan").addEventListener("change", event => { state.selectedPlanId = event.target.value; state.evidence = null; render(); });
for (const selector of ["#task-search","#task-filter","#task-sort"]) $(selector).addEventListener(selector === "#task-search" ? "input" : "change", () => { state.evidence = null; renderTasks(); });
$("#plan-list").addEventListener("click", event => { const button = event.target.closest("button[data-action]"); if (!button) return; const plan = state.data.plans.find(p => p.id === button.dataset.id); if (!plan) return; if (button.dataset.action === "select-plan") { state.selectedPlanId = plan.id; state.evidence = null; render(); $("#do").scrollIntoView({ behavior: "smooth" }); } else { const form = $("#plan-form"); fill(form, { title: plan.title, startDate: plan.start_date, endDate: plan.end_date, priority: plan.priority, successCriteria: plan.success_criteria, estimatedMinutes: plan.estimated_minutes }); $("#plan-edit-id").value = plan.id; $("#plan-form-heading").textContent = "계획 수정"; $("#plan-submit").textContent = "수정 내용 저장"; $("#plan-cancel").hidden = false; form.scrollIntoView({ behavior: "smooth" }); } });
$("#task-list").addEventListener("click", async event => { const button = event.target.closest("button[data-action]"); if (!button) return; const task = state.data.tasks.find(t => t.id === button.dataset.id); if (!task) return; const action = button.dataset.action; if (action === "edit-task") { const form = $("#task-form"); fill(form, { title: task.title, dueDate: task.due_date, priority: task.priority, tag: task.tag, estimatedMinutes: task.estimated_minutes }); $("#task-edit-id").value = task.id; $("#task-form-heading").textContent = "할 일 수정"; $("#task-submit").textContent = "수정 내용 저장"; $("#task-cancel").hidden = false; form.scrollIntoView({ behavior: "smooth" }); return; } if (action === "delete-task" && !window.confirm(`‘${task.title}’을 목록에서 지울까요?`)) return; button.disabled = true; await change(`/api/tasks/${task.id}${action === "complete" ? "/complete" : action === "reopen" ? "/reopen" : ""}`, action === "delete-task" ? "DELETE" : "POST", undefined, action === "complete" ? "완료로 바꿨습니다. 중복 클릭해도 완료 기록은 한 건입니다." : action === "reopen" ? "진행 중으로 되돌렸습니다." : "할 일을 목록에서 지웠습니다."); });
$("#review-cards").addEventListener("click", event => { const card = event.target.closest("[data-metric]"); if (card) showEvidence(card.dataset.metric); });
$("#time-review").addEventListener("click", event => { const button = event.target.closest("[data-metric]"); if (button) showEvidence(button.dataset.metric); });
resetPlanForm(); resetTaskForm(); setNextDates(); refresh().catch(error => showMessage(`서버 기록을 불러오지 못했습니다: ${error.message}`, true));
