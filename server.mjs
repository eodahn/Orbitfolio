import { seedShowcase } from "./server/showcase.js";
import { readAvatarMultipart, saveAvatar } from "./server/avatars.js";
import { oauthErrorCode } from "./shared/oauth-errors.js";
import { databaseConfig, databaseStartupError } from "./server/database-config.js";
import { searchAll } from "./server/search.js";
import { createGithubService } from "./server/github.js";
import { ensureOrbits, deleteProject } from "./server/project-data.js";
import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { openConfiguredDatabase } from "./server/db.js";
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
let db;
try {
  const config = databaseConfig();
  console.log(`Banco selecionado: ${config.dialect}. Aplicando migrations pendentes.`);
  db = await openConfiguredDatabase();
  console.log(`Migrações ${db.dialect} concluídas.`);
  if (process.env.SEED_SHOWCASE === "true") await seedShowcase(db);
  if (process.env.SEED_DEMO === "true" && process.env.NODE_ENV !== "production" && process.env.RENDER !== "true")
    await seedDevelopmentData(db);
  await ensureOrbits(db);
} catch (error) {
  console.error(databaseStartupError(error));
  await db?.close();
  process.exit(1);
}
const github = createGithubService(db);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
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
    (process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || "")
      .trim()
      .replace(/\/+$/, ""),
  ]);
  if (origin && !allowed.has(origin))
    throw new ApiError(403, "Origem inválida.");
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    csrf(req);
    const user = await sessionUser(db, req.headers.cookie);
    const page = () => {
      const value = Number(url.searchParams.get("page") || 1);
      if (!Number.isSafeInteger(value) || value < 1 || value > 10000)
        throw new ApiError(422, "Página inválida.");
      return value;
    };
    if (path === "/api/account/avatar" && req.method === "POST") {
      requireUser(user);
      await saveAvatar(db, user, await readAvatarMultipart(req));
      return reply(res, 200, { user: await publicUser(db, user, user.id) });
    }
    const avatarRoute = path.match(/^\/api\/users\/([^/]+)\/avatar$/);
    if (avatarRoute && req.method === "GET") {
      const row = await db
        .prepare("SELECT * FROM user_avatars WHERE user_id=?")
        .get(decodeURIComponent(avatarRoute[1]));
      if (
        !row ||
        (url.searchParams.has("v") && url.searchParams.get("v") !== row.version)
      )
        throw new ApiError(404, "Foto não encontrada.");
      const headers = {
        "Content-Type": row.mime_type,
        "Content-Length": row.size_bytes,
        "Cache-Control": url.searchParams.has("v")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=300",
        ETag: '"' + row.version + '"',
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      };
      if (req.headers["if-none-match"] === headers.ETag) {
        res.writeHead(304, {
          ETag: headers.ETag,
          "Cache-Control": headers["Cache-Control"],
        });
        return res.end();
      }
      res.writeHead(200, headers);
      return res.end(Buffer.from(row.data));
    }
    if (path === "/api/github/status" && req.method === "GET")
      return reply(res, 200, await github.status(requireUser(user)));
    if (path === "/api/github/auth" && req.method === "GET") {
      if (req.headers["sec-fetch-site"] === "cross-site")
        throw new ApiError(403, "Inicie a conexão pelo Orbitfolio.");
      const target = await github.connect(
        requireUser(user),
        req.headers.cookie,
      );
      res.writeHead(303, {
        Location: target.url,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      return res.end();
    }
    if (path === "/api/github/connect" && req.method === "POST")
      return reply(
        res,
        200,
        await github.connect(requireUser(user), req.headers.cookie),
      );
    if (path === "/api/github/disconnect" && req.method === "DELETE") {
      await github.disconnect(requireUser(user));
      return reply(res, 204);
    }
    if (path === "/api/github/callback" && req.method === "GET") {
      let result = "connected",
        reason = "";
      try {
        await github.callback(user, req.headers.cookie, url.searchParams);
      } catch (error) {
        result = "error";
        reason = "&reason=" + oauthErrorCode(error);
      }
      res.writeHead(303, {
        Location: "/projects/new?github=" + result + reason,
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
        projects: await Promise.all(
          (
            await db
              .prepare(
                "SELECT * FROM projects WHERE owner_id=? ORDER BY created_at DESC",
              )
              .all(user.id)
          ).map(async (p) => await publicProject(db, p, user.id)),
        ),
      });
    }
    if (path === "/api/search" && req.method === "GET")
      return reply(
        res,
        200,
        await searchAll(db, url.searchParams.get("q"), user?.id),
      );
    if (path === "/api/health" && req.method === "GET")
      return reply(res, 200, {
        ok: true,
        backend: `node-${db.dialect}`,
      });
    if (path === "/api/auth/session" && req.method === "GET")
      return reply(res, 200, {
        user: await publicUser(db, user, user?.id),
      });
    if (path === "/api/auth/register" && req.method === "POST") {
      const input = await readJson(req);
      const { account, session } = await db.transaction(async (tx) => {
        const account = await register(tx, input);
        return { account, session: await createSession(tx, account.id) };
      });
      return reply(
        res,
        201,
        {
          user: await publicUser(db, account, account.id),
        },
        {
          "Set-Cookie": sessionCookie(session.token, session.expiresAt),
        },
      );
    }
    if (path === "/api/auth/login" && req.method === "POST") {
      const account = await login(db, await readJson(req));
      const session = await createSession(db, account.id);
      return reply(
        res,
        200,
        {
          user: await publicUser(db, account, account.id),
        },
        {
          "Set-Cookie": sessionCookie(session.token, session.expiresAt),
        },
      );
    }
    if (path === "/api/auth/logout" && req.method === "POST")
      return reply(res, 204, null, {
        "Set-Cookie": await clearSession(db, req.headers.cookie),
      });
    if (path === "/api/projects" && req.method === "GET") {
      const query = (url.searchParams.get("q") ?? "").trim();
      const rows = query
        ? await db
            .prepare(
              "SELECT * FROM projects WHERE lower(name) LIKE lower(?) OR lower(description) LIKE lower(?) ORDER BY updated_at DESC",
            )
            .all(`%${query}%`, `%${query}%`)
        : await db
            .prepare("SELECT * FROM projects ORDER BY updated_at DESC")
            .all();
      return reply(res, 200, {
        projects: (
          await Promise.all(
            rows.map(async (row) => await publicProject(db, row, user?.id)),
          )
        ).filter(Boolean),
      });
    }
    if (path === "/api/projects" && req.method === "POST") {
      requireUser(user);
      const input = await readJson(req);
      if (input.importId) {
        const preview = await db
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
          await db
            .prepare("UPDATE project_imports SET metadata_json=? WHERE id=?")
            .run(JSON.stringify(metadata), input.importId);
        }
      }
      const project = await createProject(db, user, input);
      return reply(res, 201, {
        project: await publicProject(db, project, user.id),
      });
    }
    const detail = path.match(/^\/api\/projects\/([^/]+)$/);
    if (detail && req.method === "DELETE") {
      await deleteProject(db, requireUser(user), decodeURIComponent(detail[1]));
      return reply(res, 204);
    }
    if (detail && req.method === "GET") {
      const project = await db
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(decodeURIComponent(detail[1]));
      if (!project) throw new ApiError(404, "Projeto não encontrado.");
      if (project.github_private && project.owner_id !== user?.id)
        await github.authorize(requireUser(user), project);
      return reply(res, 200, {
        project: await publicProject(db, project, user?.id, true),
      });
    }
    const projectAction = path.match(
      /^\/api\/projects\/([^/]+)\/(like|favorite|commits)$/,
    );
    if (projectAction) {
      const project = await db
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
      await setRelation(
        db,
        action === "like" ? "project_likes" : "favorites",
        ["user_id", "project_id"],
        [account.id, project.id],
        req.method === "POST",
      );
      return reply(res, 200, {
        project: await publicProject(db, project, account.id),
      });
    }
    if (path === "/api/favorites" && req.method === "GET") {
      if (!user)
        return reply(res, 200, {
          projects: [],
        });
      const rows = await db
        .prepare(
          "SELECT projects.* FROM favorites JOIN projects ON projects.id = favorites.project_id WHERE favorites.user_id = ? ORDER BY favorites.created_at DESC",
        )
        .all(user.id);
      return reply(res, 200, {
        projects: (
          await Promise.all(
            rows.map(async (row) => await publicProject(db, row, user.id)),
          )
        ).filter(Boolean),
      });
    }
    if (path === "/api/progress" && req.method === "GET") {
      const account = requireUser(user);
      const rows = await db
        .prepare(
          "SELECT * FROM projects WHERE owner_id = ? AND github_integration_enabled=1 ORDER BY updated_at DESC",
        )
        .all(account.id);
      return reply(res, 200, {
        projects: await Promise.all(
          rows.map(async (row) => await publicProject(db, row, account.id)),
        ),
        favorites: (
          await db
            .prepare(
              "SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?",
            )
            .get(account.id)
        ).count,
        following: (
          await db
            .prepare(
              "SELECT COUNT(*) AS count FROM follows WHERE follower_id = ?",
            )
            .get(account.id)
        ).count,
      });
    }
    if (path === "/api/rankings/featured" && req.method === "GET") {
      const period = url.searchParams.get("period") ?? "week";
      if (!["week", "month", "all"].includes(period))
        throw new ApiError(422, "Período inválido.");
      return reply(res, 200, {
        projects: await rankingProjects(db, user?.id, period),
      });
    }
    if (path === "/api/users" && req.method === "GET") {
      const query = (url.searchParams.get("q") ?? "").trim();
      const rows = query
        ? await db
            .prepare(
              "SELECT * FROM users WHERE lower(name) LIKE lower(?) OR lower(bio) LIKE lower(?) OR lower(username) LIKE lower(?) ORDER BY name",
            )
            .all(`%${query}%`, `%${query}%`, `%${query}%`)
        : await db.prepare("SELECT * FROM users ORDER BY name").all();
      return reply(res, 200, {
        users: await Promise.all(
          rows.map(async (row) => await publicUser(db, row, user?.id)),
        ),
      });
    }
    if (path === "/api/account/privacy" && req.method === "PATCH")
      return reply(res, 200, {
        privacy: await updatePrivacy(
          db,
          requireUser(user),
          await readJson(req),
        ),
      });
    if (path === "/api/account/profile" && req.method === "PATCH")
      return reply(res, 200, {
        user: await updateProfile(db, requireUser(user), await readJson(req)),
      });
    const section = path.match(
      /^\/api\/users\/([^/]+)\/(projects|followers|following|friends|likes|favorites)$/,
    );
    if (section && req.method === "GET")
      return reply(
        res,
        200,
        await profileSection(
          db,
          decodeURIComponent(section[1]),
          section[2],
          user?.id,
        ),
      );
    const userDetail = path.match(/^\/api\/users\/([^/]+)$/);
    if (userDetail && req.method === "GET") {
      const found = await db
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(decodeURIComponent(userDetail[1]));
      if (!found) throw new ApiError(404, "Usuário não encontrado.");
      return reply(res, 200, {
        user: await publicUser(db, found, user?.id),
      });
    }
    const follow = path.match(/^\/api\/users\/([^/]+)\/follow$/);
    if (follow) {
      const account = requireUser(user),
        target = decodeURIComponent(follow[1]);
      if (account.id === target)
        throw new ApiError(422, "Você não pode seguir a própria conta.");
      if (!(await db.prepare("SELECT 1 FROM users WHERE id = ?").get(target)))
        throw new ApiError(404, "Usuário não encontrado.");
      if (!["POST", "DELETE"].includes(req.method))
        throw new ApiError(405, "Método não permitido.");
      await setRelation(
        db,
        "follows",
        ["follower_id", "followed_id"],
        [account.id, target],
        req.method === "POST",
      );
      return reply(res, 200, {
        following: req.method === "POST",
      });
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
    if (file !== requested && (path.startsWith("/models/") || path.startsWith("/assets/")))
      return reply(res, 404, { error: `Asset não encontrado: ${path}. Execute npm run build e verifique o deploy.` });
    if (!existsSync(file)) {
      res.writeHead(503, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      return res.end("Execute npm run build antes de iniciar o servidor.");
    }
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control": extname(file) === ".html" ? "no-store" : "no-cache",
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
server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0", () =>
  console.log(
    `Orbitfolio disponível em 0.0.0.0:${server.address().port}`,
  ),
);

for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
