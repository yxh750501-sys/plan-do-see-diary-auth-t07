import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(root, "dist/server/index.js"), "utf8");
const sql = await readFile(resolve(root, "drizzle/0000_natural_queen_noir.sql"), "utf8");
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).default;
const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys=ON");
for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) database.exec(statement);
const DB = {
  prepare(query) { const statement = database.prepare(query); let args=[]; return { bind(...values) { args=values; return this; }, all() { return { results: statement.all(...args) }; }, first() { return statement.get(...args) ?? null; }, run() { return statement.run(...args); } }; },
  async batch(commands) { database.exec("BEGIN"); try { const rows=commands.map(command=>command.run()); database.exec("COMMIT"); return rows; } catch(error) { database.exec("ROLLBACK"); throw error; } }
};
const port = Number(process.env.PDS_PREVIEW_PORT || 4173);
const server = createServer(async (req,res) => {
  try {
    const chunks=[]; for await(const chunk of req) chunks.push(chunk);
    const url=`http://127.0.0.1:${port}${req.url}`;
    const headers = new Headers(req.headers);
    const request = new Request(url, { method:req.method, headers, body:["GET","HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response=await worker.fetch(request,{DB}); res.writeHead(response.status,Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch(error) { res.writeHead(500); res.end(String(error)); }
});
server.listen(port,"127.0.0.1",()=>console.log(`Preview http://127.0.0.1:${port}/`));
