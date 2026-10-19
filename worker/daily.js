const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
const ask = (value, name, max) => { const s = typeof value === "string" ? value.trim() : ""; if (!s || s.length > max) throw new Error(`${name}: 1~${max}자를 적어 주세요.`); return s; };
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const one = async (db, sql, ...args) => db.prepare(sql).bind(...args).first();
function todayKst(date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const map = Object.fromEntries(parts.map(part => [part.type,part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
export async function dailyState(db, userId) {
  const [spec, entries, change] = await Promise.all([
    one(db,"SELECT * FROM daily_specs WHERE user_id=?",userId),
    all(db,"SELECT * FROM daily_entries WHERE user_id=? ORDER BY kst_date,id",userId),
    one(db,"SELECT * FROM daily_rule_changes WHERE user_id=?",userId)
  ]);
  const total = entries.reduce((sum,e) => sum + e.value,0);
  const average = entries.length ? Math.round(total / entries.length * 10) / 10 : 0;
  const before = entries.slice(0,2), after = entries.slice(2);
  const mean = list => list.length ? Math.round(list.reduce((sum,e) => sum+e.value,0) / list.length * 10) / 10 : 0;
  return { spec, entries, change, summary: { count: entries.length, total: Math.round(total*10)/10, average, beforeAverage: mean(before), afterAverage: mean(after) } };
}
export async function handleDaily(request, db, userId, path, body, clock = () => new Date()) {
  if (path === "/api/daily" && request.method === "GET") return reply(await dailyState(db,userId));
  if (path === "/api/daily/spec" && request.method === "POST") {
    if (await one(db,"SELECT user_id FROM daily_specs WHERE user_id=?",userId)) return reply({ error: "1일차 기준은 이미 고정됐습니다." },409);
    const time = clock().toISOString();
    const spec = {
      question: ask(body.question,"질문",300), metric: ask(body.metric,"지표",100), unit: ask(body.unit,"단위",30),
      calculationRule: "매일 입력한 값을 같은 단위로 합산하고, 평균은 합계 ÷ 기록일 수",
      missingRule: "빠진 날짜는 0으로 채우지 않고 기록일 수에서 제외",
      duplicateRule: "서울 날짜별 한 건만 허용하고 두 번째 입력은 거부",
      outlierRule: "큰 값도 원값을 보존하고 설명을 메모에 기록",
      roundingRule: "합계·평균은 소수 첫째 자리에서 반올림",
      weekStart: "월요일", planRule: ask(body.planRule,"계획 규칙",300)
    };
    await db.prepare("INSERT INTO daily_specs (user_id,question,metric,unit,calculation_rule,missing_rule,duplicate_rule,outlier_rule,rounding_rule,week_start,plan_rule,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(userId,spec.question,spec.metric,spec.unit,spec.calculationRule,spec.missingRule,spec.duplicateRule,spec.outlierRule,spec.roundingRule,spec.weekStart,spec.planRule,time).run();
    return reply(await dailyState(db,userId),201);
  }
  if (path === "/api/daily/entries" && request.method === "POST") {
    const state = await dailyState(db,userId);
    if (!state.spec) return reply({ error: "1일차 기준을 먼저 고정해 주세요." },400);
    if (state.entries.length >= 5) return reply({ error: "5일 기록이 모두 저장됐습니다." },409);
    if (state.entries.length >= 2 && !state.change) return reply({ error: "3일차 전에 계획 규칙 한 가지를 바꿔 주세요." },409);
    const date = todayKst(clock());
    if (state.entries.some(e => e.kst_date === date)) return reply({ error: "같은 서울 날짜에는 한 건만 기록할 수 있습니다." },409);
    if (state.entries.length && date <= state.entries.at(-1).kst_date) return reply({ error: "다음 실제 날짜에 기록해 주세요." },409);
    if (typeof body.value !== "number" || !Number.isFinite(body.value) || body.value < 0 || body.value > 100000 || Math.round(body.value*10) !== body.value*10) return reply({ error: "값은 0~100000의 소수 첫째 자리 이하로 적어 주세요." },400);
    const note = ask(body.note,"실제로 한 일",500), time = clock().toISOString();
    await db.prepare("INSERT INTO daily_entries (id,user_id,kst_date,value,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,date,body.value,note,time,time).run();
    return reply(await dailyState(db,userId),201);
  }
  if (path === "/api/daily/rule-change" && request.method === "POST") {
    const state = await dailyState(db,userId);
    if (!state.spec || state.entries.length !== 2 || state.change) return reply({ error: "규칙 변경은 2일차 뒤, 3일차 전에 한 번만 가능합니다." },409);
    const after = ask(body.afterRule,"새 계획 규칙",300), reason = ask(body.reason,"바꾼 이유",500);
    if (after === state.spec.plan_rule) return reply({ error: "계획 규칙을 실제로 한 가지 바꿔 주세요." },400);
    await db.prepare("INSERT INTO daily_rule_changes (id,user_id,before_rule,after_rule,reason,day1_id,day2_id,changed_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,state.spec.plan_rule,after,reason,state.entries[0].id,state.entries[1].id,clock().toISOString()).run();
    return reply(await dailyState(db,userId),201);
  }
  return reply({ error: "요청한 경로를 찾을 수 없습니다." },404);
}
