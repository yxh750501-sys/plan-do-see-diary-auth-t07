import bcrypt from "bcryptjs";

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const COOKIE_NAME = "pds_session";
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
const genericLoginError = "아이디 또는 비밀번호가 올바르지 않습니다.";
const DUMMY_HASH = "$2b$12$SQsMPsPA1e8MFN/IcrtJIuGggyc6PuLmTt1X.u4oQ1aMK9Uc7PVFG";

function response(data, status = 200, cookie) {
  const headers = { ...jsonHeaders };
  if (cookie) headers["set-cookie"] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}
function cookieValue(request) {
  const cookie = request.headers.get("cookie") || "";
  return cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || "";
}
function sessionCookie(token) { return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`; }
function expiredCookie() { return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
async function tokenHash(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function currentSession(request, db) {
  const token = cookieValue(request);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const hash = await tokenHash(token);
  const row = await db.prepare("SELECT s.token_hash,s.user_id,s.expires_at,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(hash, new Date().toISOString()).first();
  return row || null;
}
async function createSession(db, userId) {
  const token = randomToken();
  const time = new Date();
  await db.prepare("INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)").bind(await tokenHash(token), userId, time.toISOString(), new Date(time.getTime() + SESSION_SECONDS * 1000).toISOString()).run();
  return sessionCookie(token);
}
function credentials(body) {
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = body.password;
  if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new Error("아이디는 영문 소문자·숫자·밑줄로 3~32자여야 합니다.");
  if (typeof password !== "string" || password.length < 12 || password.length > 72) throw new Error("비밀번호는 12~72자로 입력해 주세요.");
  return { username, password };
}
export async function handleAuth(request, db, path, body) {
  if (path === "/api/auth/me" && request.method === "GET") {
    const session = await currentSession(request, db);
    return session ? response({ username: session.username }) : response({ error: "로그인이 필요합니다." }, 401);
  }
  if (path === "/api/auth/signup" && request.method === "POST") {
    const { username, password } = credentials(body);
    if (await db.prepare("SELECT id FROM users WHERE username=?").bind(username).first()) return response({ error: "이미 사용 중인 아이디입니다." }, 409);
    const id = crypto.randomUUID(), hash = await bcrypt.hash(password, 12);
    try { await db.prepare("INSERT INTO users (id,username,password_hash,created_at) VALUES (?,?,?,?)").bind(id, username, hash, new Date().toISOString()).run(); }
    catch (error) { if (/UNIQUE|constraint/i.test(String(error))) return response({ error: "이미 사용 중인 아이디입니다." }, 409); throw error; }
    return response({ username }, 201, await createSession(db, id));
  }
  if (path === "/api/auth/login" && request.method === "POST") {
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[a-z0-9_]{3,32}$/.test(username) || !password) return response({ error: genericLoginError }, 401);
    const user = await db.prepare("SELECT id,password_hash FROM users WHERE username=?").bind(username).first();
    const matches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !matches) return response({ error: genericLoginError }, 401);
    return response({ username }, 200, await createSession(db, user.id));
  }
  const session = await currentSession(request, db);
  if (!session) return response({ error: "로그인이 필요합니다." }, 401);
  if (path === "/api/auth/logout" && request.method === "POST") {
    await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(session.token_hash).run();
    return response({ ok: true }, 200, expiredCookie());
  }
  if (path === "/api/auth/password" && request.method === "POST") {
    if (typeof body.currentPassword !== "string" || typeof body.newPassword !== "string" || body.newPassword.length < 12 || body.newPassword.length > 72) return response({ error: "비밀번호 입력을 확인해 주세요." }, 400);
    const user = await db.prepare("SELECT password_hash FROM users WHERE id=?").bind(session.user_id).first();
    if (!(await bcrypt.compare(body.currentPassword, user.password_hash))) return response({ error: genericLoginError }, 401);
    const hash = await bcrypt.hash(body.newPassword, 12);
    await db.batch([
      db.prepare("UPDATE users SET password_hash=? WHERE id=?").bind(hash, session.user_id),
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(session.user_id)
    ]);
    return response({ ok: true }, 200, expiredCookie());
  }
  if (path === "/api/auth/account" && request.method === "DELETE") {
    const user = await db.prepare("SELECT password_hash FROM users WHERE id=?").bind(session.user_id).first();
    if (typeof body.password !== "string" || !(await bcrypt.compare(body.password, user.password_hash))) return response({ error: genericLoginError }, 401);
    const uid = session.user_id;
    await db.batch([
      db.prepare("DELETE FROM daily_rule_changes WHERE user_id=?").bind(uid),
      db.prepare("DELETE FROM daily_entries WHERE user_id=?").bind(uid),
      db.prepare("DELETE FROM daily_specs WHERE user_id=?").bind(uid),
      db.prepare("DELETE FROM review_actions WHERE from_plan_id IN (SELECT id FROM plans WHERE owner_id=?)").bind(uid),
      db.prepare("DELETE FROM completion_events WHERE task_id IN (SELECT t.id FROM tasks t JOIN plans p ON p.id=t.plan_id WHERE p.owner_id=?)").bind(uid),
      db.prepare("DELETE FROM work_logs WHERE task_id IN (SELECT t.id FROM tasks t JOIN plans p ON p.id=t.plan_id WHERE p.owner_id=?)").bind(uid),
      db.prepare("DELETE FROM plan_revisions WHERE plan_id IN (SELECT id FROM plans WHERE owner_id=?)").bind(uid),
      db.prepare("DELETE FROM tasks WHERE plan_id IN (SELECT id FROM plans WHERE owner_id=?)").bind(uid),
      db.prepare("DELETE FROM plans WHERE owner_id=?").bind(uid),
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(uid),
      db.prepare("DELETE FROM users WHERE id=?").bind(uid)
    ]);
    return response({ ok: true }, 200, expiredCookie());
  }
  return response({ error: "요청한 경로를 찾을 수 없습니다." }, 404);
}
