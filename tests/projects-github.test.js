import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/db.js";
import {
  register,
  createProject,
  publicProject,
  setRelation,
  createSession,
} from "../server/app.js";
import {
  deleteProject,
  normalizeLanguages,
  ensureOrbits,
  saveImport,
} from "../server/project-data.js";
import {
  createGithubService,
  mapRepository,
  encryptToken,
  decryptToken,
  githubConfig,
  githubRequest,
  repositoryPath,
} from "../server/github.js";
import { framingDistance } from "../src/three/preview.js";
const account = (db, name) =>
  register(db, {
    name,
    email: name + "@test.local",
    password: "test-password",
  });
const env = {
  APP_ORIGIN: "http://localhost:5173",
  GITHUB_CLIENT_ID: "test-client",
  GITHUB_CLIENT_SECRET: "test-secret",
  GITHUB_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
};
const repo = {
  id: 123,
  name: "hello",
  full_name: "owner/hello",
  html_url: "https://github.com/owner/hello",
  owner: { login: "owner" },
  private: true,
  size: 2048,
  default_branch: "main",
  description: "Repository test",
};
const response = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
test("manual projects persist optional percentages and stable positions; delete is owner-only and cascades", () => {
  const directory = mkdtempSync(join(tmpdir(), "orbit-db-")),
    file = join(directory, "db.sqlite");
  let db = openDatabase(file);
  try {
    const a = account(db, "Alice"),
      b = account(db, "Bruno");
    const p = createProject(db, a, {
      name: "Manual test",
      demoUrl: "https://example.com/project",
      languages: { JavaScript: null, CSS: 30 },
      description: "",
    });
    const view = publicProject(db, p, a.id);
    assert.equal(view.description, "");
    assert.equal(view.languages.JavaScript, null);
    assert.equal(view.languages.CSS, 30);
    assert.equal(view.orbit.length, 3);
    for (const table of ["favorites", "project_likes"])
      setRelation(db, table, ["user_id", "project_id"], [b.id, p.id], true);
    assert.throws(
      () => deleteProject(db, b, p.id),
      (e) => e.status === 403,
    );
    assert.throws(
      () => deleteProject(db, null, p.id),
      (e) => e.status === 401,
    );
    db.close();
    db = openDatabase(file);
    ensureOrbits(db);
    assert.deepEqual(
      publicProject(
        db,
        db.prepare("SELECT * FROM projects WHERE id=?").get(p.id),
        a.id,
      ).orbit,
      view.orbit,
    );
    createProject(db, a, {
      name: "Another planet",
      demoUrl: "https://example.com/project",
      languages: {},
    });
    ensureOrbits(db);
    assert.deepEqual(
      publicProject(
        db,
        db.prepare("SELECT * FROM projects WHERE id=?").get(p.id),
        a.id,
      ).orbit,
      view.orbit,
    );
    deleteProject(db, a, p.id);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM favorites").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM project_likes").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM commits").get().n, 0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true });
  }
});
test("language validation and GitHub byte mapping", () => {
  assert.deepEqual(normalizeLanguages({ JS: null, CSS: "" }), {
    JS: null,
    CSS: null,
  });
  assert.throws(
    () => normalizeLanguages({ JS: 80, CSS: 30 }),
    (e) => e.status === 422,
  );
  assert.throws(
    () => normalizeLanguages({ JS: 20, CSS: 30 }),
    (e) => e.status === 422,
  );
  assert.throws(
    () => normalizeLanguages({ JS: -1 }),
    (e) => e.status === 422,
  );
  const mapped = mapRepository(repo, { JS: 600, CSS: 400 }, false);
  assert.deepEqual(mapped.languages, { JS: 60, CSS: 40 });
  assert.equal(mapped.sizeBytes, 2097152);
  assert.equal(mapped.github.integrationEnabled, false);
  assert.throws(
    () => repositoryPath("https://evil.test/a/b"),
    (e) => e.status === 422,
  );
});
test("OAuth state is bound to session, one-use and expires; tokens encrypted with per-user AAD", async () => {
  const db = openDatabase(":memory:"),
    user = account(db, "Alice"),
    session = createSession(db, user.id),
    cookies = "orbitfolio_session=" + session.token;
  const calls = [];
  const service = createGithubService(db, {
    env,
    fetcher: async (url, options) => {
      calls.push([url, options]);
      return url.includes("access_token")
        ? response({ access_token: "credential-example" })
        : response({
            id: 99,
            login: "alice",
            name: "Alice",
            avatar_url: "https://avatars.githubusercontent.com/u/99",
            html_url: "https://github.com/alice",
          });
    },
  });
  assert.equal(
    createGithubService(db, { env: {} }).status(user).available,
    false,
  );
  const url = new URL(service.connect(user, cookies).url),
    query = new URLSearchParams({
      state: url.searchParams.get("state"),
      code: "test-code",
    });
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  await assert.rejects(
    () => service.callback(user, "orbitfolio_session=wrong", query),
    (e) => e.status === 403,
  );
  await service.callback(user, cookies, query);
  assert.equal(calls.length, 2);
  assert.deepEqual(service.status(user).account, {
    id: 99,
    login: "alice",
    name: "Alice",
    avatarUrl: "https://avatars.githubusercontent.com/u/99",
    profileUrl: "https://github.com/alice",
  });
  assert.equal(
    JSON.stringify(service.status(user)).includes("credential-example"),
    false,
  );
  assert.ok(JSON.parse(calls[0][1].body).code_verifier);
  const encrypted = db
    .prepare("SELECT encrypted_token FROM github_connections WHERE user_id=?")
    .get(user.id).encrypted_token;
  assert.ok(!encrypted.includes("credential-example"));
  assert.equal(
    decryptToken(encrypted, user.id, githubConfig(env)),
    "credential-example",
  );
  assert.throws(() => decryptToken(encrypted, "other", githubConfig(env)));
  await assert.rejects(
    () => service.callback(user, cookies, query),
    (e) => e.status === 403,
  );
  const next = new URL(service.connect(user, cookies).url);
  db.prepare("UPDATE github_oauth_states SET expires_at=0").run();
  await assert.rejects(
    () =>
      service.callback(
        user,
        cookies,
        new URLSearchParams({
          state: next.searchParams.get("state"),
          code: "new",
        }),
      ),
    (e) => e.status === 403,
  );
  db.close();
});
test("private repository access uses viewer token, prevents public leaks, and real commit mapping uses tag or SHA", async () => {
  const db = openDatabase(":memory:"),
    a = account(db, "Alice"),
    b = account(db, "Bruno"),
    config = githubConfig(env);
  for (const user of [a, b])
    db.prepare(
      "INSERT INTO github_connections(user_id,github_user_id,github_login,encrypted_token) VALUES(?,?,?,?)",
    ).run(
      user.id,
      user === a ? 1 : 2,
      user.name,
      encryptToken(user.name, user.id, config),
    );
  const calls = [];
  const service = createGithubService(db, {
    env,
    fetcher: async (url, options) => {
      calls.push(options.headers.Authorization);
      if (options.headers.Authorization === "Bearer Bruno")
        return response({}, 404);
      if (url.includes("/languages")) return response({ JS: 600, CSS: 400 });
      if (url.includes("/commits?"))
        return response(
          [
            {
              sha: "abcdef123456",
              commit: {
                message: "Ship new feature",
                author: { name: "Alice", date: "2026-09-25T12:00:00Z" },
              },
              html_url: "https://github.com/owner/hello/commit/abcdef123456",
              author: { avatar_url: "" },
            },
            {
              sha: "7654321abcde",
              commit: {
                message: "Second commit",
                author: { name: "Alice", date: "2026-09-24T12:00:00Z" },
              },
              html_url: "https://github.com/owner/hello/commit/7654321abcde",
            },
          ],
          200,
          { link: '<https://api.github.com/next>; rel="next"' },
        );
      if (url.includes("/tags?"))
        return response([{ name: "v1.0.0", commit: { sha: "abcdef123456" } }]);
      return response(repo);
    },
  });
  const draft = await service.inspect(a, {
    fullName: "owner/hello",
    integrated: true,
  });
  const p = createProject(db, a, {
    importId: draft.importId,
    name: draft.name,
    description: draft.description,
    languages: draft.languages,
  });
  assert.equal(publicProject(db, p, b.id), null);
  assert.equal(publicProject(db, p, a.id).github.private, true);
  assert.throws(
    () =>
      createProject(db, b, {
        name: "Spoofed",
        github: { integrationEnabled: true },
      }),
    (e) => e.status === 422,
  );
  const commits = await service.commits(a, p, 1);
  assert.equal(commits.commits[0].version, "v1.0.0");
  assert.equal(commits.commits[1].version, "7654321");
  assert.equal(commits.hasNext, true);
  await assert.rejects(
    () => service.commits(b, p),
    (e) => e.status === 404,
  );
  assert.equal(calls.at(-1), "Bearer Bruno");
  await assert.rejects(
    () => service.inspect(a, { fullName: "owner/hello", integrated: false }),
    (e) => e.status === 403,
  );
  db.close();
});
test("GitHub errors are sanitized and rate-limit distinguished", async () => {
  for (const [status, headers, expected] of [
    [401, {}, 401],
    [403, {}, 403],
    [403, { "x-github-sso": "required" }, 403],
    [429, {}, 429],
    [404, {}, 404],
    [403, { "x-ratelimit-remaining": "0" }, 429],
    [500, {}, 502],
  ])
    await assert.rejects(
      () =>
        githubRequest("/repos/a/b", {
          fetcher: async () =>
            response({ message: "sensitive remote text" }, status, headers),
        }),
      (e) => e.status === expected && !e.message.includes("sensitive"),
    );
  await assert.rejects(
    () =>
      githubRequest("/repos/a/b", {
        fetcher: async () => {
          throw Error("secret");
        },
      }),
    (e) => e.status === 503,
  );
});
test("camera framing contains small and large spheres in portrait and landscape", () => {
  for (const r of [6, 25])
    for (const aspect of [0.35, 1, 2]) {
      const distance = framingDistance(r * 1.025, 58, aspect);
      const angle = Math.asin((r * 1.025) / distance);
      assert.ok(angle < (58 * Math.PI) / 360);
      assert.ok(angle < Math.atan(Math.tan((58 * Math.PI) / 360) * aspect));
    }
});

test("repository redirects retain authorization only on GitHub API", async () => {
  const calls = [];
  const result = await githubRequest("/repos/old/name", {
    token: "fixture",
    fetcher: async (url, options) => {
      calls.push([url, options.headers.Authorization]);
      return calls.length === 1
        ? response({}, 301, {
            location: "https://api.github.com/repos/new/name",
          })
        : response({ id: 1 });
    },
  });
  assert.equal(result.data.id, 1);
  assert.equal(calls[1][1], "Bearer fixture");
  let count = 0;
  await assert.rejects(
    () =>
      githubRequest("/repos/a/b", {
        token: "fixture",
        fetcher: async () => {
          count++;
          return response({}, 301, { location: "https://example.com/steal" });
        },
      }),
    (e) => e.status === 503,
  );
  assert.equal(count, 1);
});

test("OAuth callback distinguishes invalid code, rate limit and unavailable upstream", async () => {
  for (const [status, payload, expected] of [
    [200, { error: "bad_verification_code" }, "invalid_code"],
    [429, {}, "rate_limit"],
    [500, {}, "unavailable"],
  ]) {
    const db = openDatabase(":memory:"),
      user = account(db, "Alice");
    const cookies = "orbitfolio_session=" + createSession(db, user.id).token;
    const service = createGithubService(db, {
      env,
      fetcher: async () => response(payload, status),
    });
    const state = new URL(service.connect(user, cookies).url).searchParams.get(
      "state",
    );
    await assert.rejects(
      () =>
        service.callback(
          user,
          cookies,
          new URLSearchParams({ state, code: "fixture" }),
        ),
      (error) => error.code === expected,
    );
    assert.equal(service.status(user).connected, false);
    db.close();
  }
});
