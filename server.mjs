import { createGithubService } from "./server/github.js";
import { ensureOrbits, deleteProject } from "./server/project-data.js";
import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./server/db.js";
import { seedDevelopmentData } from "./server/seed.js";
import {
  ApiError,
  clearSession,
  createProject,
  createSession,
  login,
  publicProject,
  publicUser,
  rankingProjects,
  register,
  requireUser,
  sessionCookie,
  sessionUser,
  setRelation,
} from "./server/app.js";

import {
  profileSection,
  updatePrivacy,
  updateProfile,
} from "./server/social.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const db = openDatabase();
if (process.env.SEED_DEMO === "true") seedDevelopmentData(db);
ensureOrbits(db);
const github = createGithubService(db);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const reply = (res, status, payload, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  res.end(status === 204 ? undefined : JSON.stringify(payload));
};
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000)
      throw new ApiError(413, "Requisição muito grande.");
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiError(400, "JSON inválido.");
  }
}
const methodIsMutation = (method) =>
  ["POST", "PUT", "PATCH", "DELETE"].includes(method);
function csrf(req) {
  if (!methodIsMutation(req.method)) return;
  const origin = req.headers.origin;
  // Vite proxies same-site browser requests during development. Keep the
  // production origin check while allowing only the documented local dev hosts.
  const allowed = new Set([
    `http://${req.headers.host}`,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://orbitfolio.onrender.com",
    process.env.APP_ORIGIN,
  ]);
  if (origin && !allowed.has(origin))
    throw new ApiError(403, "Origem inválida.");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    csrf(req);
    const user = sessionUser(db, req.headers.cookie);
    const page = () => {
      const value = Number(url.searchParams.get("page") || 1);
      if (!Number.isSafeInteger(value) || value < 1 || value > 10000)
        throw new ApiError(422, "Página inválida.");
      return value;
    };
    if (path === "/api/github/status" && req.method === "GET")
      return reply(res, 200, github.status(requireUser(user)));
    if (path === "/api/github/connect" && req.method === "POST")
      return reply(
        res,
        200,
        github.connect(requireUser(user), req.headers.cookie),
      );
    if (path === "/api/github/disconnect" && req.method === "DELETE") {
      github.disconnect(requireUser(user));
      return reply(res, 204);
    }
    if (path === "/api/github/callback" && req.method === "GET") {
      let result = "connected";
      try {
        await github.callback(user, req.headers.cookie, url.searchParams);
      } catch {
        result = "error";
      }
      res.writeHead(303, {
        Location: "/projects/new?github=" + result,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      return res.end();
    }
    if (path === "/api/github/repositories" && req.method === "GET")
      return reply(
        res,
        200,
        await github.repositories(requireUser(user), page()),
      );
    if (path === "/api/github/repository/inspect" && req.method === "POST")
      return reply(
        res,
        200,
        await github.inspect(requireUser(user), await readJson(req)),
      );
    if (path === "/api/projects/mine" && req.method === "GET") {
      requireUser(user);
      return reply(res, 200, {
        projects: db
          .prepare(
            "SELECT * FROM projects WHERE owner_id=? ORDER BY created_at DESC",
          )
          .all(user.id)
          .map((p) => publicProject(db, p, user.id)),
      });
    }
    if (path === "/api/health" && req.method === "GET")
      return reply(res, 200, { ok: true });
    if (path === "/api/auth/session" && req.method === "GET")
      return reply(res, 200, { user: publicUser(db, user, user?.id) });
    if (path === "/api/auth/register" && req.method === "POST") {
      const account = register(db, await readJson(req));
      const session = createSession(db, account.id);
      return reply(
        res,
        201,
        { user: publicUser(db, account, account.id) },
        { "Set-Cookie": sessionCookie(session.token, session.expiresAt) },
      );
    }
    if (path === "/api/auth/login" && req.method === "POST") {
      const account = login(db, await readJson(req));
      const session = createSession(db, account.id);
      return reply(
        res,
        200,
        { user: publicUser(db, account, account.id) },
        { "Set-Cookie": sessionCookie(session.token, session.expiresAt) },
      );
    }
    if (path === "/api/auth/logout" && req.method === "POST")
      return reply(res, 204, null, {
        "Set-Cookie": clearSession(db, req.headers.cookie),
      });
    if (path === "/api/projects" && req.method === "GET") {
      const query = (url.searchParams.get("q") ?? "").trim();
      const rows = query
        ? db
            .prepare(
              "SELECT * FROM projects WHERE name LIKE ? OR description LIKE ? ORDER BY updated_at DESC",
            )
            .all(`%${query}%`, `%${query}%`)
        : db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all();
      return reply(res, 200, {
        projects: rows
          .map((row) => publicProject(db, row, user?.id))
          .filter(Boolean),
      });
    }
    if (path === "/api/projects" && req.method === "POST") {
      requireUser(user);
      const input = await readJson(req);
      if (input.importId) {
        const preview = db
          .prepare(
            "SELECT metadata_json FROM project_imports WHERE id=? AND user_id=? AND expires_at>?",
          )
          .get(input.importId, user.id, Date.now());
        if (!preview) throw new ApiError(422, "Importação expirada.");
        const metadata = JSON.parse(preview.metadata_json);
        if (metadata.github?.integrationEnabled) {
          const access = await github.authorize(user, {
            github_repository_full_name: metadata.github.fullName,
            github_repository_id: metadata.github.id,
          });
          metadata.github.private = !!access.repo.private;
          db.prepare(
            "UPDATE project_imports SET metadata_json=? WHERE id=?",
          ).run(JSON.stringify(metadata), input.importId);
        }
      }
      const project = createProject(db, user, input);
      return reply(res, 201, { project: publicProject(db, project, user.id) });
    }
    const detail = path.match(/^\/api\/projects\/([^/]+)$/);
    if (detail && req.method === "DELETE") {
      deleteProject(db, requireUser(user), decodeURIComponent(detail[1]));
      return reply(res, 204);
    }
    if (detail && req.method === "GET") {
      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(decodeURIComponent(detail[1]));
      if (!project) throw new ApiError(404, "Projeto não encontrado.");
      if (project.github_private && project.owner_id !== user?.id)
        await github.authorize(requireUser(user), project);
      return reply(res, 200, {
        project: publicProject(db, project, user?.id, true),
      });
    }
    const projectAction = path.match(
      /^\/api\/projects\/([^/]+)\/(like|favorite|commits)$/,
    );
    if (projectAction) {
      const project = db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(decodeURIComponent(projectAction[1]));
      if (!project) throw new ApiError(404, "Projeto não encontrado.");
      const action = projectAction[2];
      if (action === "commits") {
        if (req.method !== "GET")
          throw new ApiError(405, "Método não permitido.");
        return reply(
          res,
          200,
          await github.commits(requireUser(user), project, page()),
        );
      }
      if (project.github_private && project.owner_id !== user?.id)
        await github.authorize(requireUser(user), project);
      const account = requireUser(user);
      if (!["POST", "DELETE"].includes(req.method))
        throw new ApiError(405, "Método não permitido.");
      setRelation(
        db,
        action === "like" ? "project_likes" : "favorites",
        ["user_id", "project_id"],
        [account.id, project.id],
        req.method === "POST",
      );
      return reply(res, 200, {
        project: publicProject(db, project, account.id),
      });
    }
    if (path === "/api/favorites" && req.method === "GET") {
      if (!user) return reply(res, 200, { projects: [] });
      const rows = db
        .prepare(
          "SELECT projects.* FROM favorites JOIN projects ON projects.id = favorites.project_id WHERE favorites.user_id = ? ORDER BY favorites.created_at DESC",
        )
        .all(user.id);
      return reply(res, 200, {
        projects: rows
          .map((row) => publicProject(db, row, user.id))
          .filter(Boolean),
      });
    }
    if (path === "/api/progress" && req.method === "GET") {
      const account = requireUser(user);
      const rows = db
        .prepare(
          "SELECT * FROM projects WHERE owner_id = ? AND github_integration_enabled=1 ORDER BY updated_at DESC",
        )
        .all(account.id);
      return reply(res, 200, {
        projects: rows.map((row) => publicProject(db, row, account.id)),
        favorites: db
          .prepare("SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?")
          .get(account.id).count,
        following: db
          .prepare(
            "SELECT COUNT(*) AS count FROM follows WHERE follower_id = ?",
          )
          .get(account.id).count,
      });
    }
    if (path === "/api/rankings/featured" && req.method === "GET") {
      const period = url.searchParams.get("period") ?? "week";
      if (!["week", "month", "all"].includes(period))
        throw new ApiError(422, "Período inválido.");
      return reply(res, 200, {
        projects: rankingProjects(db, user?.id, period),
      });
    }
    if (path === "/api/users" && req.method === "GET") {
      const query = (url.searchParams.get("q") ?? "").trim();
      const rows = query
        ? db
            .prepare(
              "SELECT * FROM users WHERE name LIKE ? OR bio LIKE ? OR username LIKE ? ORDER BY name",
            )
            .all(`%${query}%`, `%${query}%`, `%${query}%`)
        : db.prepare("SELECT * FROM users ORDER BY name").all();
      return reply(res, 200, {
        users: rows.map((row) => publicUser(db, row, user?.id)),
      });
    }
    if (path === "/api/account/privacy" && req.method === "PATCH")
      return reply(res, 200, {
        privacy: updatePrivacy(db, requireUser(user), await readJson(req)),
      });
    if (path === "/api/account/profile" && req.method === "PATCH")
      return reply(res, 200, {
        user: updateProfile(db, requireUser(user), await readJson(req)),
      });
    const section = path.match(
      /^\/api\/users\/([^/]+)\/(projects|followers|following|friends|likes|favorites)$/,
    );
    if (section && req.method === "GET")
      return reply(
        res,
        200,
        profileSection(
          db,
          decodeURIComponent(section[1]),
          section[2],
          user?.id,
        ),
      );
    const userDetail = path.match(/^\/api\/users\/([^/]+)$/);
    if (userDetail && req.method === "GET") {
      const found = db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(decodeURIComponent(userDetail[1]));
      if (!found) throw new ApiError(404, "Usuário não encontrado.");
      return reply(res, 200, { user: publicUser(db, found, user?.id) });
    }
    const follow = path.match(/^\/api\/users\/([^/]+)\/follow$/);
    if (follow) {
      const account = requireUser(user),
        target = decodeURIComponent(follow[1]);
      if (account.id === target)
        throw new ApiError(422, "Você não pode seguir a própria conta.");
      if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(target))
        throw new ApiError(404, "Usuário não encontrado.");
      if (!["POST", "DELETE"].includes(req.method))
        throw new ApiError(405, "Método não permitido.");
      setRelation(
        db,
        "follows",
        ["follower_id", "followed_id"],
        [account.id, target],
        req.method === "POST",
      );
      return reply(res, 200, { following: req.method === "POST" });
    }
    if (path.startsWith("/api/"))
      throw new ApiError(404, "Endpoint não encontrado.");
    const dist = join(root, "dist"),
      requested = normalize(join(dist, path === "/" ? "index.html" : path));
    const file =
      requested.startsWith(dist) &&
      existsSync(requested) &&
      statSync(requested).isFile()
        ? requested
        : join(dist, "index.html");
    if (!existsSync(file)) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Execute npm run build antes de iniciar o servidor.");
    }
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    res.end(readFileSync(file));
  } catch (error) {
    reply(res, error instanceof ApiError ? error.status : 500, {
      error:
        error instanceof ApiError
          ? error.message
          : "Falha interna. Tente novamente.",
    });
  }
});
server.listen(Number(process.env.PORT ?? 3000), () =>
  console.log(
    `Orbitfolio disponível em http://localhost:${process.env.PORT ?? 3000}`,
  ),
);
