import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/db.js";
import { register, createProject } from "../server/app.js";
import { searchAll } from "../server/search.js";
import { projectLinks, safeHttpUrl } from "../shared/project-links.js";
import { normalizeLanguages } from "../server/project-data.js";
test("global search ranks exact names, normalizes accents and protects private projects", () => {
  const db = openDatabase(":memory:");
  try {
    const a = register(db, {
      name: "Álvaro",
      email: "a@test.local",
      password: "password1",
    });
    const b = register(db, {
      name: "Alvaro Junior",
      email: "b@test.local",
      password: "password1",
    });
    const p = createProject(db, a, {
      name: "Galáxia",
      description: "Mapa de estrelas",
      demoUrl: "https://example.com",
    });
    createProject(db, b, {
      name: "Galaxia Nova",
      githubUrl: "https://github.com/a/b",
    });
    assert.deepEqual(
      searchAll(db, "ALVARO").users.map((u) => u.id),
      [a.id, b.id],
    );
    assert.equal(searchAll(db, "galaxia").projects[0].id, p.id);
    assert.equal(searchAll(db, "estrelas").projects[0].id, p.id);
    db.prepare("UPDATE projects SET github_private=1 WHERE id=?").run(p.id);
    assert.equal(searchAll(db, "estrelas", b.id).projects.length, 0);
    assert.equal(searchAll(db, "estrelas", a.id).projects.length, 1);
    assert.throws(
      () => createProject(db, a, { name: "No links" }),
      /Adicione um link/,
    );
    assert.throws(
      () =>
        createProject(db, a, {
          name: "Bad GitHub",
          githubUrl: "https://example.com",
        }),
      /repositório GitHub/,
    );
    for (const url of [
      "javascript:alert(1)",
      "https://user:pass@example.com",
    ]) {
      assert.equal(safeHttpUrl(url), "");
      assert.throws(() =>
        createProject(db, a, { name: "Unsafe", demoUrl: url }),
      );
    }
    assert.deepEqual(
      projectLinks({
        githubUrl: "https://github.com/a/b",
        demoUrl: "https://example.com",
      }),
      {
        github: "https://github.com/a/b",
        external: "https://example.com/",
        primary: "https://example.com/",
      },
    );
    assert.throws(() => normalizeLanguages({ Outra: null }));
    assert.throws(() => normalizeLanguages({ Python: null, python: null }));
    assert.deepEqual(normalizeLanguages({ Lua: null }), { Lua: null });
  } finally {
    db.close();
  }
});
