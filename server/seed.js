import { randomUUID } from "node:crypto";
import { developmentProjects, developmentUsers } from "../src/mocks/development-data.js";

// Development-only seed. The browser never imports these records at runtime.
export function seedDevelopmentData(db) {
  if (db.prepare("SELECT COUNT(*) AS count FROM users").get().count) return;
  const insertUser = db.prepare("INSERT INTO users (id, name, email, bio) VALUES (?, ?, ?, ?)");
  const insertProject = db.prepare("INSERT INTO projects (id, owner_id, name, description, languages_json, github_url, demo_url, views, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insertCommit = db.prepare("INSERT INTO commits (id, project_id, message, author_name, committed_at) VALUES (?, ?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    developmentUsers.forEach((user) => insertUser.run(user.id, user.name, `${user.id}@seed.orbitfolio.local`, user.bio));
    developmentProjects.forEach((project) => {
      insertProject.run(project.id, project.owner.id, project.name, project.description, JSON.stringify(project.languages), project.githubUrl ?? "", project.demoUrl ?? "", project.views, project.rating, project.updatedAt, project.updatedAt);
      insertCommit.run(randomUUID(), project.id, "Projeto publicado no Orbitfolio", project.owner.name, project.updatedAt);
    });
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
