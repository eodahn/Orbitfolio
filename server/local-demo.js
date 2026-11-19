import { mapRepository, repositoryPath } from "./github.js";
import { saveImport } from "./project-data.js";
import { ApiError, register } from "./app.js";
import { openDatabase } from "./db.js";
import {
  developmentUsers,
  developmentProjects,
} from "../src/mocks/development-data.js";
import references from "./local-references.json" with { type: "json" };
import { createHash, randomBytes } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import sharp from "sharp";

export async function openDemo(reset = false) {
  const db = openDatabase("data/school-demo.sqlite");
  const keyFile = new URL("../data/school-demo.key", import.meta.url);
  let password;
  try {
    password = await readFile(keyFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    password = randomBytes(18).toString("base64url");
    await writeFile(keyFile, password, { flag: "wx", mode: 0o600 });
  }
  await db.transaction(async (tx) => {
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS demo_install (version INTEGER PRIMARY KEY)",
    );
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS demo_disconnected (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE)",
    );
    if (reset) await tx.exec("DELETE FROM users; DELETE FROM demo_install");
    if (await tx.prepare("SELECT version FROM demo_install").get()) return;
    const main = await register(tx, {
      name: "Daniel Melo",
      username: "eodahn",
      email: "eodahn@demo.local",
      password,
    });
    await tx
      .prepare("UPDATE users SET bio=? WHERE id=?")
      .run(
        "Estudante de Informática para Internet. Construo experiências 3D para aproximar pessoas e projetos.",
        main.id,
      );
    const curators = [
      ...developmentUsers,
      ...[
        ["Lia Prado", "Animações e narrativa visual."],
        ["Caio Reis", "Bibliotecas para a web."],
        ["Eva Torres", "Experimentos de física e shaders."],
        ["Rui Lopes", "Acessibilidade em realidade virtual."],
        ["Bia Nunes", "Interfaces animadas e ferramentas de design."],
        ["Ivo Rios", "Interação, tipografia e movimento."],
      ].map(([name, bio], i) => ({ id: "u" + (i + 4), name, bio })),
    ];
    for (const u of curators) {
      await tx
        .prepare(
          "INSERT INTO users(id,name,username,email,bio) VALUES(?,?,?,?,?)",
        )
        .run(
          u.id,
          u.name,
          u.name.toLowerCase().replace(" ", "-"),
          u.id + "@demo.local",
          u.bio,
        );
    }
    const colors = ["#d34189", "#774fcb", "#267cb3", "#317c74"];
    for (const [i, u] of [main, ...curators].entries()) {
      const svg = `<svg width="96" height="96"><rect width="96" height="96" rx="48" fill="${colors[i % colors.length]}"/><circle cx="48" cy="39" r="17" fill="#fff"/><ellipse cx="48" cy="90" rx="32" ry="30" fill="#fff"/></svg>`;
      const data = await sharp(Buffer.from(svg)).png().toBuffer();
      await tx
        .prepare("INSERT INTO user_avatars VALUES(?,?,?,?,?)")
        .run(u.id, data, "image/png", data.length, "demo1");
      await tx
        .prepare("UPDATE users SET avatar_url=? WHERE id=?")
        .run("/api/users/" + u.id + "/avatar?v=demo1", u.id);
    }
    for (const p of [
      ...developmentProjects,
      {
        id: "orbitfolio",
        name: "Orbitfolio",
        description: "Um universo navegável para os projetos da comunidade.",
        owner: main,
        languages: { JavaScript: 84, CSS: 14, HTML: 2 },
      },
      {
        id: "laboratorio",
        name: "Laboratório orbital",
        description: "Protótipo privado das próximas experiências de voo.",
        owner: main,
        languages: { JavaScript: 90, CSS: 10 },
      },
    ]) {
      const own = p.owner.id === main.id;
      const repo =
        p.id === "orbitfolio" ? "https://github.com/eodahn/Orbitfolio" : "";
      const link = "/?planet=" + encodeURIComponent(p.id);
      await tx
        .prepare(
          `INSERT INTO projects(id,owner_id,name,description,languages_json,language_bytes_json,size_bytes,repository_url,github_url,demo_url,github_integration_enabled,github_private,github_repository_full_name,github_default_branch,views,rating)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          p.id,
          p.owner.id,
          p.name,
          p.description,
          JSON.stringify(p.languages),
          JSON.stringify(
            Object.fromEntries(
              Object.entries(p.languages).map(([k, v]) => [k, v * 1024]),
            ),
          ),
          102400,
          repo,
          repo,
          "http://127.0.0.1:5173" + link,
          Number(own),
          Number(p.id === "laboratorio"),
          own ? "eodahn/" + p.id : null,
          own ? "feature/frontend-rebuild" : null,
          p.views ?? (p.id === "laboratorio" ? 8 : 460),
          p.rating ?? 4.8,
        );
      for (const [i, msg] of [
        "Estrutura inicial do projeto",
        "Ajusta a interface de navegação",
        "Conclui testes para apresentação",
      ].entries()) {
        const date = new Date(Date.now() - (4 - i) * 86400000).toISOString();
        await tx.prepare("INSERT INTO commits VALUES(?,?,?,?,?)").run(
          createHash("sha1")
            .update(p.id + msg)
            .digest("hex"),
          p.id,
          msg,
          p.owner.name,
          date,
        );
      }
      if (p.id !== "laboratorio")
        await tx
          .prepare("INSERT INTO project_likes(user_id,project_id) VALUES(?,?)")
          .run(own ? "u1" : main.id, p.id);
    }
    for (const [i, ref] of references.entries()) {
      const owner = [main, ...curators][i];
      await tx
        .prepare(
          `INSERT INTO projects(id,owner_id,name,description,github_url,repository_url,demo_url,languages_json,size_bytes)
        VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          ref.id,
          owner.id,
          ref.name,
          "Referência selecionada para a mostra. " + ref.description,
          ref.repo,
          ref.repo,
          ref.site,
          JSON.stringify({ [ref.language]: null }),
          (i + 2) * 1048576,
        );
      await tx
        .prepare("INSERT INTO commits VALUES(?,?,?,?,?)")
        .run(
          createHash("sha1").update(ref.id).digest("hex"),
          ref.id,
          "Adiciona referência ao catálogo acadêmico",
          owner.name,
          new Date().toISOString(),
        );
      await tx
        .prepare("INSERT INTO project_likes(user_id,project_id) VALUES(?,?)")
        .run(main.id, ref.id);
    }
    for (const id of ["three-js", "orbit-chat", "nebula-ui"])
      await tx
        .prepare("INSERT INTO favorites(user_id,project_id) VALUES(?,?)")
        .run(main.id, id);
    for (const [a, b] of [
      [main.id, "u1"],
      ["u1", main.id],
      [main.id, "u2"],
      ["u3", main.id],
    ])
      await tx
        .prepare("INSERT INTO follows(follower_id,followed_id) VALUES(?,?)")
        .run(a, b);
    await tx.exec("INSERT INTO demo_install VALUES(1)");
  });

  console.log("Senha da conta local @eodahn disponível em data/school-demo.key");
  return db;
}

async function localHistory(db, user, project, page) {
  if (project.github_private && project.owner_id !== user.id)
    return { commits: [], page, hasNext: false };
  const rows = await db
    .prepare(
      "SELECT * FROM commits WHERE project_id=? ORDER BY committed_at DESC LIMIT 20 OFFSET ?",
    )
    .all(project.id, (page - 1) * 20);
  return {
    commits: rows.map((c) => ({
      sha: c.id,
      shortSha: c.id.slice(0, 7),
      message: c.message,
      author: c.author_name,
      committedAt: c.committed_at,
      url: "/project/" + project.id,
      version: "Demonstração",
    })),
    page,
    hasNext: rows.length === 20,
  };
}

// Serve the existing repository picker entirely from the school database.
export function demoRepositories(db) {
  async function connected(user) {
    return !(await db
      .prepare("SELECT 1 FROM demo_disconnected WHERE user_id=?")
      .get(user.id));
  }
  async function source(user, input, integrated) {
    const { owner, name } = repositoryPath(input);
    const url = "https://github.com/" + owner + "/" + name;
    const project = await db
      .prepare(
        "SELECT * FROM projects WHERE lower(github_url)=lower(?) AND github_private=0 ORDER BY created_at,id LIMIT 1",
      )
      .get(url);
    if (!project)
      throw new ApiError(
        404,
        "Esta referência não está no catálogo local. Use Personalizar para adicionar outro link.",
      );
    if (integrated && !(await connected(user)))
      throw new ApiError(403, "Reconecte o catálogo local.");
    return project;
  }
  return {
    async status(user) {
      return {
        available: true,
        connected: await connected(user),
        login: "catálogo demonstrativo local",
      };
    },
    async repositories(user, page) {
      if (!(await connected(user)))
        throw new ApiError(403, "Conecte o catálogo local.");
      const rows = await db
        .prepare(
          "SELECT DISTINCT github_url FROM projects WHERE github_url LIKE 'https://github.com/%' AND github_private=0 ORDER BY github_url LIMIT 30 OFFSET ?",
        )
        .all((page - 1) * 30);
      return {
        repositories: rows.map((p) => ({
          fullName: p.github_url.slice("https://github.com/".length),
          private: false,
        })),
        hasNext: rows.length === 30,
      };
    },
    async inspect(user, input) {
      const project = await source(
        user,
        input.url || input.fullName,
        input.integrated,
      );
      const { owner, name } = repositoryPath(project.github_url);
      const id = Number.parseInt(
        createHash("sha1")
          .update(project.github_url)
          .digest("hex")
          .slice(0, 12),
        16,
      );
      const metadata = mapRepository(
        {
          id,
          name,
          owner: { login: owner },
          full_name: owner + "/" + name,
          html_url: project.github_url,
          description: project.description,
          size: project.size_bytes / 1024,
          default_branch: project.github_default_branch || "HEAD",
        },
        JSON.parse(project.language_bytes_json),
        input.integrated === true,
      );
      metadata.languages = JSON.parse(project.languages_json);
      return saveImport(db, user, metadata);
    },
    async authorize(user, project) {
      if (project.github_private) throw new ApiError(403, "Planeta privado.");
      await source(user, project.github_repository_full_name, true);
      return { repo: { private: false } };
    },
    async connect(user) {
      await db
        .prepare("DELETE FROM demo_disconnected WHERE user_id=?")
        .run(user.id);
      return { url: "/projects/new?github=connected" };
    },
    async disconnect(user) {
      await db
        .prepare("INSERT OR IGNORE INTO demo_disconnected VALUES(?)")
        .run(user.id);
    },
    async callback() {
      throw new ApiError(400, "O catálogo demonstrativo é local.");
    },
    async commits(user, project, page) {
      if (project.github_private && project.owner_id !== user.id)
        throw new ApiError(403, "Planeta privado.");
      if (project.github_url) {
        const original = await db
          .prepare(
            "SELECT p.id FROM projects p JOIN commits c ON c.project_id=p.id WHERE p.github_url=? AND p.github_private=0 ORDER BY p.created_at LIMIT 1",
          )
          .get(project.github_url);
        if (original) project = { ...project, id: original.id };
      }
      return localHistory(db, user, project, page);
    },
  };
}
