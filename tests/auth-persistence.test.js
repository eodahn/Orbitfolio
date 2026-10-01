import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { databasePath, prepareDatabasePath } from "../server/storage.js";
import { githubConfig, createGithubService } from "../server/github.js";
import { openDatabase } from "../server/db.js";
import { register, login } from "../server/app.js";
const url = (path) => new URL(path, import.meta.url).href;
test("accounts survive separate server processes, expired sessions and a consistent backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "orbit-persist-")),
    file = join(dir, "nested", "db.sqlite");
  const env = {
    ...process.env,
    ORBITFOLIO_DATABASE_PATH: file,
    ORBITFOLIO_REQUIRE_EXISTING_DATABASE: "false",
  };
  const run = (code) =>
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {openDatabase} from ${JSON.stringify(url("../server/db.js"))};import {register,login,createSession,sessionUser} from ${JSON.stringify(url("../server/app.js"))}; const db=openDatabase();${code};db.close();`,
      ],
      { env, cwd: dir, encoding: "utf8" },
    ).trim();
  try {
    const id = run(
      `const u=register(db,{name:'Conta permanente',email:'remember@test.local',password:'test-password'});createSession(db,u.id);console.log(u.id)`,
    );
    assert.ok(existsSync(file));
    assert.equal(
      run(
        `console.log(login(db,{email:' REMEMBER@test.local ',password:'test-password'}).id)`,
      ),
      id,
    );
    assert.equal(
      run(
        `db.prepare("UPDATE sessions SET expires_at='2000-01-01'").run();console.log(login(db,{email:'remember@test.local',password:'test-password'}).id)`,
      ),
      id,
    );
    const target = join(dir, "backup.sqlite");
    execFileSync(
      process.execPath,
      [
        new URL("../scripts/backup-database.mjs", import.meta.url).pathname,
        target,
      ],
      { env },
    );
    const backup = openDatabase(target);
    assert.equal(
      login(backup, { email: "remember@test.local", password: "test-password" })
        .id,
      id,
    );
    backup.close();
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [
          new URL("../scripts/backup-database.mjs", import.meta.url).pathname,
          target,
        ],
        { env, stdio: "pipe" },
      ),
    );
    assert.throws(
      () =>
        prepareDatabasePath(join(dir, "absent.sqlite"), {
          ORBITFOLIO_REQUIRE_EXISTING_DATABASE: "true",
        }),
      /Banco configurado/,
    );
    assert.equal(existsSync(join(dir, "absent.sqlite")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("invalid login stays 401 including malformed stored hashes; never bypasses authentication", () => {
  const db = openDatabase(":memory:");
  try {
    const user = register(db, {
      name: "Login test",
      email: "login@test.local",
      password: "test-password",
    });
    for (const input of [
      { email: "missing@test.local", password: "test-password" },
      { email: "login@test.local", password: "incorrect" },
    ])
      assert.throws(
        () => login(db, input),
        (e) => e.status === 401,
      );
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
      "invalid",
      user.id,
    );
    assert.throws(
      () => login(db, { email: "login@test.local", password: "test-password" }),
      (e) => e.status === 401,
    );
  } finally {
    db.close();
  }
});
test("OAuth normalizes configured origins and reports only configuration names", () => {
  const env = {
    APP_ORIGIN: " https://orbitfolio.onrender.com/ ",
    GITHUB_CLIENT_ID: " id ",
    GITHUB_CLIENT_SECRET: " secret ",
    GITHUB_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
  };
  const config = githubConfig(env);
  assert.equal(config.enabled, true);
  assert.equal(config.origin, "https://orbitfolio.onrender.com");
  assert.equal(config.clientId, "id");
  assert.equal(
    githubConfig({
      ...env,
      APP_ORIGIN: "",
      RENDER_EXTERNAL_URL: "https://orbitfolio.onrender.com",
    }).enabled,
    true,
  );
  assert.equal(
    githubConfig({ ...env, APP_ORIGIN: "https://user:password@example.com" })
      .enabled,
    false,
  );
  const db = openDatabase(":memory:");
  try {
    const user = register(db, {
      name: "OAuth test",
      email: "oauth@test.local",
      password: "test-password",
    });
    const status = createGithubService(db, {
      env: { APP_ORIGIN: env.APP_ORIGIN },
    }).status(user);
    assert.deepEqual(status.configurationIssues, [
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_TOKEN_ENCRYPTION_KEY",
    ]);
    assert.equal(status.available, false);
    assert.equal("secret" in status, false);
  } finally {
    db.close();
  }
  assert.equal(
    databasePath("data/orbitfolio.sqlite"),
    new URL("../data/orbitfolio.sqlite", import.meta.url).pathname,
  );
});
