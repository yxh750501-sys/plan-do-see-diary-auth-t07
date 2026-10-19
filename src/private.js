const pick = selector => document.querySelector(selector);
const node = (tag, value, className = "") => { const n = document.createElement(tag); n.textContent = String(value); if (className) n.className = className; return n; };
function notice(text, error = false) {
  const box = pick("#message"); box.textContent = text; box.className = `message${error ? " error" : ""}`; box.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function api(path, method = "GET", body) {
  const response = await fetch(path, { method, headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await response.json();
  if (response.status === 401 && (path === "/api/auth/me" || !path.startsWith("/api/auth/"))) location.replace("/");
  if (!response.ok) throw new Error(data.error || `요청 실패 ${response.status}`);
  return data;
}
function formValues(form) { return Object.fromEntries(new FormData(form)); }
function kstToday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function addLine(parent, label, value) { const p = node("p", ""); p.append(node("strong", `${label}: `), node("span", value)); parent.append(p); }
function renderDaily(data) {
  const { spec, entries, change, summary } = data;
  pick("#daily-count").textContent = `${entries.length} / 5일`;
  pick("#daily-today").textContent = `오늘 서울 날짜: ${kstToday()}`;
  pick("#daily-spec-form").hidden = Boolean(spec);
  const specSummary = pick("#daily-spec-summary"); specSummary.replaceChildren();
  if (spec) { addLine(specSummary,"질문",spec.question); addLine(specSummary,"지표",`${spec.metric} (${spec.unit})`); addLine(specSummary,"처음 계획 규칙",spec.plan_rule); }
  const policy = pick("#daily-policy"); policy.replaceChildren();
  if (spec) for (const [label,value] of [["계산",spec.calculation_rule],["빠진 날",spec.missing_rule],["중복",spec.duplicate_rule],["튀는 값",spec.outlier_rule],["반올림",spec.rounding_rule],["주 시작",spec.week_start]]) addLine(policy,label,value);
  const entryForm = pick("#daily-entry-form");
  const canEnter = Boolean(spec) && entries.length < 5 && (entries.length < 2 || Boolean(change)) && !entries.some(e => e.kst_date === kstToday());
  entryForm.querySelectorAll("input,textarea,button").forEach(field => field.disabled = !canEnter);
  const changeForm = pick("#daily-rule-form"); changeForm.hidden = entries.length !== 2 || Boolean(change);
  const changeSummary = pick("#daily-change-summary"); changeSummary.replaceChildren();
  if (change) { addLine(changeSummary,"변경 전",change.before_rule); addLine(changeSummary,"변경 후",change.after_rule); addLine(changeSummary,"이유",change.reason); addLine(changeSummary,"변경 시각",new Date(change.changed_at).toLocaleString("ko-KR",{ timeZone:"Asia/Seoul" })); }
  const stats = pick("#daily-stats"); stats.replaceChildren();
  if (spec) { addLine(stats,"기록",`${summary.count}일`); addLine(stats,"합계",`${summary.total} ${spec.unit}`); addLine(stats,"평균",`${summary.average} ${spec.unit}`); addLine(stats,"변경 전 평균",`${summary.beforeAverage} ${spec.unit}`); addLine(stats,"변경 후 평균",`${summary.afterAverage} ${spec.unit}`); }
  const list = pick("#daily-entries"); list.replaceChildren();
  if (!entries.length) list.append(node("p","1일차에 실제 값을 기록하면 날짜별 기록이 보입니다.","empty"));
  entries.forEach((entry,index) => { const item = node("article","","log-item"); item.append(node("strong",`${index+1}일차 · ${entry.kst_date} · ${entry.value} ${spec?.unit ?? ""}`)); item.append(node("p",entry.note)); list.append(item); });
}
async function loadDaily() { renderDaily(await api("/api/daily")); }

pick("#logout-button").addEventListener("click", async () => { try { await api("/api/auth/logout","POST",{}); location.replace("/"); } catch (error) { notice(error.message,true); } });
pick("#import-form").addEventListener("submit", async event => {
  event.preventDefault();
  const file = event.currentTarget.elements.namedItem("file").files[0];
  if (!file || file.size > 1000000) return notice("1MB 이하 T06 JSON 파일을 선택해 주세요.",true);
  try {
    const response = await fetch("/api/import", { method:"POST", headers:{ "content-type":"application/json" }, body:await file.text(), cache:"no-store" });
    const result = await response.json(); if (!response.ok) throw Error(result.error || "가져오기에 실패했습니다.");
    pick("#import-result").textContent = `계획 ${result.imported.plans}개·할 일 ${result.imported.tasks}개·실행 기록 ${result.imported.logs}개를 내 계정으로 가져왔습니다.`;
    location.reload();
  } catch (error) { notice(error.message,true); }
});
pick("#password-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget, values = formValues(form);
  try { await api("/api/auth/password","POST",values); form.reset(); alert("비밀번호를 바꿨습니다. 새 비밀번호로 다시 로그인해 주세요."); location.replace("/"); }
  catch (error) { notice(error.message,true); }
});
pick("#delete-account-form").addEventListener("submit", async event => {
  event.preventDefault(); if (!confirm("계정과 내 자료 전체를 영구 삭제할까요?")) return;
  try { await api("/api/auth/account","DELETE",formValues(event.currentTarget)); location.replace("/"); }
  catch (error) { notice(error.message,true); }
});
pick("#daily-spec-form").addEventListener("submit", async event => {
  event.preventDefault(); try { renderDaily(await api("/api/daily/spec","POST",formValues(event.currentTarget))); notice("1일차 기준을 고정했습니다."); }
  catch (error) { notice(error.message,true); }
});
pick("#daily-entry-form").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget, body = formValues(form); body.value = Number(body.value);
  try { renderDaily(await api("/api/daily/entries","POST",body)); form.reset(); notice("오늘 기록을 저장했습니다."); }
  catch (error) { notice(error.message,true); }
});
pick("#daily-rule-form").addEventListener("submit", async event => {
  event.preventDefault(); try { renderDaily(await api("/api/daily/rule-change","POST",formValues(event.currentTarget))); notice("2일차 뒤 계획 규칙 변경을 기록했습니다."); }
  catch (error) { notice(error.message,true); }
});
api("/api/auth/me").then(user => { pick("#account-name").textContent = user.username; return loadDaily(); }).catch(error => notice(error.message,true));
