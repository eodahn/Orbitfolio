import { saveAvatar } from "../server/avatars.js";
import { featureContracts } from "./feature-contracts.mjs";
import assert from "node:assert/strict";
import pg from "pg";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openPostgres } from "../server/postgres.js";
import { openDatabase, openConfiguredDatabase } from "../server/db.js";
import { importSqlite } from "../server/import-sqlite.js";
import {
  register,
  login,
  createProject,
  createSession,
  sessionUser,
  setRelation,
  publicUser,
  publicProject,
} from "../server/app.js";
import { updatePrivacy, profileSection } from "../server/social.js";
import {
  createGithubService,
  encryptToken,
  githubConfig,
  decryptToken,
} from "../server/github.js";
if (!process.env.TEST_DATABASE_URL)
  throw Error(
    "Configure TEST_DATABASE_URL com um PostgreSQL exclusivo para testes.",
  );
const admin = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL,
});
await admin.connect();
const schema = "test_" + randomUUID().replaceAll("-", ""),
  directory = mkdtempSync(join(tmpdir(), "orbit-pg-"));
let db, source;
try {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set("options", `-c search_path=${schema}`);
  db = await openPostgres(url.href);
  source = openDatabase(join(directory, "source.sqlite"));
  const a = await register(source, {
    name: "Mesmo Nome",
    email: "a@test.local",
    password: "test-password",
    username: "alice",
  });
  const b = await register(source, {
    name: "Mesmo Nome",
    email: "b@test.local",
    password: "test-password",
    username: "bruno",
  });
  const project = await createProject(source, a, {
    name: "Grande planeta",
    demoUrl: "https://example.com",
    sizeBytes: 5000000000,
  });
  const session = await createSession(source, a.id);
  await setRelation(
    source,
    "follows",
    ["follower_id", "followed_id"],
    [a.id, b.id],
    true,
  );
  await setRelation(
    source,
    "follows",
    ["follower_id", "followed_id"],
    [b.id, a.id],
    true,
  );
  await setRelation(
    source,
    "favorites",
    ["user_id", "project_id"],
    [a.id, project.id],
    true,
  );
  await updatePrivacy(source, a, {
    favorites: "private",
  });
  const env = {
    APP_ORIGIN: "http://localhost:3000",
    GITHUB_CLIENT_ID: "fixture",
    GITHUB_CLIENT_SECRET: "fixture",
    GITHUB_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
  };
  await source
    .prepare(
      "INSERT INTO github_connections(user_id,github_user_id,github_login,encrypted_token) VALUES(?,?,?,?)",
    )
    .run(
      a.id,
      99,
      "alice",
      encryptToken("fixture-token", a.id, githubConfig(env)),
    );
  const gif = readFileSync(
    new URL("./fixtures/avatar-animated.gif", import.meta.url),
  );
  await saveAvatar(source, a, {
    file: gif,
    mime: "image/gif",
    fields: { zoom: 1.5, offsetX: 30, offsetY: 70 },
  });
  await source.close();
  source = null;
  const before = readFileSync(join(directory, "source.sqlite"));
  assert.equal(
    (
      await importSqlite(join(directory, "source.sqlite"), db, {
        dryRun: true,
      })
    ).dryRun,
    true,
  );
  assert.equal(
    (await db.prepare("SELECT COUNT(*) AS count FROM users").get()).count,
    0,
  );
  const imported = await importSqlite(join(directory, "source.sqlite"), db);
  assert.equal(imported.counts.users, 2);
  assert.deepEqual(
    Buffer.from(
      (
        await db
          .prepare("SELECT data FROM user_avatars WHERE user_id=?")
          .get(a.id)
      ).data,
    ),
    gif,
  );
  assert.equal((await publicUser(db, a, a.id)).avatarZoom, 1.5);
  assert.equal(
    (await importSqlite(join(directory, "source.sqlite"), db)).alreadyImported,
    true,
  );
  assert.deepEqual(readFileSync(join(directory, "source.sqlite")), before);
  assert.equal(
    (
      await login(db, {
        email: "A@test.local",
        password: "test-password",
      })
    ).id,
    a.id,
  );
  assert.equal(
    (await sessionUser(db, "orbitfolio_session=" + session.token)).id,
    a.id,
  );
  assert.equal(
    (
      await publicProject(
        db,
        await db.prepare("SELECT * FROM projects WHERE id=?").get(project.id),
        a.id,
      )
    ).sizeBytes,
    5000000000,
  );
  assert.equal((await publicUser(db, a, a.id)).friends, 1);
  assert.equal(
    (await profileSection(db, a.id, "favorites", a.id)).projects.length,
    1,
  );
  await assert.rejects(
    () => profileSection(db, a.id, "favorites", b.id),
    (e) => e.status === 403,
  );
  const status = await createGithubService(db, {
    env,
  }).status(a);
  assert.equal(status.connected, true);
  assert.equal(
    decryptToken(
      (
        await db
          .prepare(
            "SELECT encrypted_token FROM github_connections WHERE user_id=?",
          )
          .get(a.id)
      ).encrypted_token,
      a.id,
      githubConfig(env),
    ),
    "fixture-token",
  );
  await assert.rejects(
    () =>
      db.transaction(async (tx) => {
        await tx
          .prepare("UPDATE users SET name=? WHERE id=?")
          .run("Must rollback", a.id);
        throw Error("rollback");
      }),
    /rollback/,
  );
  assert.equal(
    (await db.prepare("SELECT name FROM users WHERE id=?").get(a.id)).name,
    a.name,
  );
  await Promise.all(
    Array.from(
      {
        length: 5,
      },
      () =>
        setRelation(
          db,
          "follows",
          ["follower_id", "followed_id"],
          [a.id, b.id],
          true,
        ),
    ),
  );
  await db.close();
  db = await openPostgres(url.href);
  assert.equal(
    (
      await login(db, {
        email: "a@test.local",
        password: "test-password",
      })
    ).id,
    a.id,
  );
  await assert.rejects(
    () =>
      openConfiguredDatabase({
        NODE_ENV: "production",
      }),
    /DATABASE_URL/,
  );
  const cookies = "orbitfolio_session=" + session.token;
  const github = createGithubService(db, {
    env,
    fetcher: async (url, options) => {
      if (url.includes("access_token")) {
        assert.ok(JSON.parse(options.body).code_verifier);
        return new Response(
          JSON.stringify({ access_token: "new-fixture-token" }),
        );
      }
      return new Response(
        JSON.stringify({ id: 99, login: "alice", name: "Alice OAuth" }),
      );
    },
  });
  const auth = new URL((await github.connect(a, cookies)).url);
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  const query = new URLSearchParams({
    state: auth.searchParams.get("state"),
    code: "fixture-code",
  });
  await github.callback(a, cookies, query);
  assert.equal((await github.status(a)).account.name, "Alice OAuth");
  await assert.rejects(
    () => github.callback(a, cookies, query),
    (e) => e.code === "invalid_state",
  );
  await featureContracts(db);
  console.log(
    "PASS PostgreSQL: migrations/reopen, verified SQLite transfer/dry-run/idempotency, sessions/login, large integers, friends/privacy, encrypted GitHub tokens, rollback and concurrent follows.",
  );
} finally {
  await source?.close();
  await db?.close();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
  rmSync(directory, {
    recursive: true,
    force: true,
  });
}
