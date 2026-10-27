import { randomUUID } from "node:crypto";
import {
  developmentProjects,
  developmentUsers,
} from "../src/mocks/development-data.js";

// Development-only seed. The browser never imports these records at runtime.
export async function seedDevelopmentData(db) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Seeds de desenvolvimento não podem executar em produção.");
  if ((await db.prepare("SELECT COUNT(*) AS count FROM users").get()).count)
    return;
  await db.transaction(async (db) => {
    const insertUser = db.prepare(
      "INSERT INTO users (id, name, email, bio, username) VALUES (?, ?, ?, ?, ?)",
    );
    const insertProject = db.prepare(
      "INSERT INTO projects (id, owner_id, name, description, languages_json, github_url, demo_url, views, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertCommit = db.prepare(
      "INSERT INTO commits (id, project_id, message, author_name, committed_at) VALUES (?, ?, ?, ?, ?)",
    );
    for (const user of developmentUsers) {
      await insertUser.run(
        user.id,
        user.name,
        `${user.id}@seed.orbitfolio.local`,
        user.bio,
        `viajante-${user.id}`,
      );
    }
    for (const [index, project] of developmentProjects.entries()) {
      await insertProject.run(
        project.id,
        project.owner.id,
        project.name,
        project.description,
        JSON.stringify(project.languages),
        project.githubUrl ?? "",
        project.demoUrl ?? "",
        project.views,
        project.rating,
        project.updatedAt,
        project.updatedAt,
      );
      await db
        .prepare("UPDATE projects SET size_bytes=? WHERE id=?")
        .run(
          [8388608, 2147483648, 2097152, 134217728, 536870912][index],
          project.id,
        );
      await insertCommit.run(
        randomUUID(),
        project.id,
        "Projeto publicado no Orbitfolio",
        project.owner.name,
        project.updatedAt,
      );
    }
  });
}
