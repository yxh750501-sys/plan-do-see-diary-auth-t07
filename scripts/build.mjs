import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const [worker, html, css, client] = await Promise.all([
  readFile(resolve(root, "worker/index.js"), "utf8"),
  readFile(resolve(root, "src/index.html"), "utf8"),
  readFile(resolve(root, "src/style.css"), "utf8"),
  readFile(resolve(root, "src/app.js"), "utf8")
]);
let output = worker;
for (const [name, value] of [["__HTML__", html], ["__CSS__", css], ["__CLIENT__", client]]) {
  if (!output.includes(name)) throw new Error(`Missing ${name}`);
  output = output.replace(name, JSON.stringify(value));
}
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, "server"), { recursive: true });
await mkdir(resolve(dist, ".openai"), { recursive: true });
await writeFile(resolve(dist, "server/index.js"), output);
await cp(resolve(root, ".openai/hosting.json"), resolve(dist, ".openai/hosting.json"));
await cp(resolve(root, "drizzle"), resolve(dist, ".openai/drizzle"), { recursive: true });
console.log(`Built ${dist}`);
