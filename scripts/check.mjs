import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workerSource = await readFile(resolve(root, "dist/server/index.js"), "utf8");
const generated = `data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`;
const worker = (await import(generated)).default;
assert.equal(typeof worker.fetch, "function");
const manifest = JSON.parse(await readFile(resolve(root, "dist/.openai/hosting.json"), "utf8"));
assert.equal(manifest.d1, "DB");
const html = await worker.fetch(new Request("https://example.test/"), {});
assert.equal(html.status, 200);
assert.match(await html.text(), /<h2 id="form-heading">로그인<\/h2>/);
const css = await worker.fetch(new Request("https://example.test/app.css"), {});
assert.equal(css.status, 200);
const js = await worker.fetch(new Request("https://example.test/app.js"), {});
assert.equal(js.status, 200);
new Function(await js.text());
for (const path of ["/auth.css","/auth.js","/private.js"]) {
  const asset = await worker.fetch(new Request(`https://example.test${path}`), {});
  assert.equal(asset.status, 200);
  if (path.endsWith(".js")) new Function(await asset.text());
}
const unavailable = await worker.fetch(new Request("https://example.test/api/snapshot"), {});
assert.equal(unavailable.status, 503);
console.log("PASS ESM, public login screen, assets, D1 required");
