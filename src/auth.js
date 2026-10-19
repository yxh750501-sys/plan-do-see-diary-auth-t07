const form = document.querySelector("#auth-form");
const message = document.querySelector("#message");
const submit = document.querySelector("#submit");
let mode = "login";
function setMode(next) {
  mode = next;
  document.querySelector("#form-heading").textContent = mode === "login" ? "로그인" : "새 계정 만들기";
  document.querySelector(".helper").textContent = mode === "login" ? "가입한 계정으로 내 기록을 열어 보세요." : "아이디와 12자 이상 비밀번호를 정해 주세요.";
  submit.firstChild.textContent = mode === "login" ? "로그인 " : "가입하고 시작하기 ";
  document.querySelector("#password").autocomplete = mode === "login" ? "current-password" : "new-password";
  for (const item of ["login", "signup"]) {
    const selected = mode === item, button = document.querySelector(`#${item}-tab`);
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-selected", String(selected));
  }
  message.textContent = "";
}
document.querySelector("#login-tab").addEventListener("click", () => setMode("login"));
document.querySelector("#signup-tab").addEventListener("click", () => setMode("signup"));
form.addEventListener("submit", async event => {
  event.preventDefault(); submit.disabled = true; message.textContent = "";
  const username = form.elements.namedItem("username"), password = form.elements.namedItem("password");
  const body = { username: username.value.trim().toLowerCase(), password: password.value };
  try {
    const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const data = await response.json();
    password.value = "";
    if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
    location.replace("/diary");
  } catch (error) { message.textContent = error.message; submit.disabled = false; }
});
