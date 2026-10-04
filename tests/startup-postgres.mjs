import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import pg from "pg";

if (!process.env.TEST_DATABASE_URL) throw Error("Configure TEST_DATABASE_URL com um PostgreSQL exclusivo para testes.");
const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await admin.connect();
const schema = "startup_" + randomUUID().replaceAll("-", "");
let child;
async function stop() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
}
async function start(databaseUrl) {
  let logs = "";
  child = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, NODE_ENV: "production", RENDER: "true", PORT: "0", DATABASE_URL: databaseUrl,
      ORBITFOLIO_DATABASE_PATH: "/nonexistent/sqlite-must-not-be-opened/db.sqlite",
      ORBITFOLIO_REQUIRE_EXISTING_DATABASE: "true", SEED_SHOWCASE: "true", SEED_DEMO: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", data => { logs += data; });
  child.stderr.on("data", data => { logs += data; });
  for (let i = 0; i < 200; i++) {
    const match = logs.match(/Orbitfolio disponível em 0\.0\.0\.0:(\d+)/);
    if (match) return { base: `http://127.0.0.1:${match[1]}`, logs };
    if (child.exitCode !== null) return { code: child.exitCode, logs };
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error("Startup timed out (private logs omitted).");
}
try {
  const missing = await start("");
  assert.equal(missing.code, 1);
  assert.match(missing.logs, /DATABASE_URL_MISSING/);
  assert.doesNotMatch(missing.logs, /Configure ORBITFOLIO_DATABASE_PATH/);
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", `-c search_path=${schema}`);
  let server = await start(` ${url.href} `);
  assert.ok(server.base, "Empty PostgreSQL must start despite legacy SQLite settings");
  assert.match(server.logs, /Migrações postgres concluídas/);
  assert.equal((await (await fetch(server.base + "/api/health")).json()).backend, "node-postgres");
  const payload = { name: "Persistência", username: "startup-user", email: "startup@test.local", password: "test-password" };
  const registered = await fetch(server.base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(registered.status, 201);
  await stop();
  server = await start(url.href);
  assert.ok(server.base);
  const login = await fetch(server.base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(login.status, 200);
  const counts = await admin.query(`SELECT (SELECT count(*) FROM "${schema}".schema_migrations) AS migrations, (SELECT count(*) FROM "${schema}".users WHERE username='bruno-simon') AS demo`);
  assert.equal(Number(counts.rows[0].migrations), 3);
  assert.equal(Number(counts.rows[0].demo), 1);
  console.log("PASS production startup: explicit missing URL, empty PostgreSQL migrations, ignored legacy SQLite path, HTTP port, registration/login after restart, idempotent showcase.");
} finally {
  await stop();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
}
