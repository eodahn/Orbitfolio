import { profileIdentity, identityConflict } from "./profile-fields.js";
import { githubRepositoryUrl } from "../shared/project-links.js";
import {
  normalizeLanguages,
  validProjectUrl,
  ensureOrbits,
} from "./project-data.js";
import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
const SESSION_DAYS = 30;
const isoNow = () => new Date().toISOString();
const tokenHash = (value) => createHash("sha256").update(value).digest("hex");
const passwordHash = (value) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
};
const passwordMatches = (value, stored) => {
  if (
    typeof stored !== "string" ||
    !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(stored)
  )
    return false;
  const [salt, hash] = stored.split(":");
  const actual = scryptSync(value, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
};
const slug = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}
export async function sessionUser(db, cookieHeader) {
  const token = parseCookies(cookieHeader).orbitfolio_session;
  if (!token) return null;
  return (
    (await db
      .prepare(
        "SELECT users.id, users.name, users.email, users.bio, users.created_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
      )
      .get(tokenHash(token), isoNow())) ?? null
  );
}
export function requireUser(user) {
  if (!user) throw new ApiError(401, "Entre para continuar.");
  return user;
}
export async function publicUser(db, user, viewerId = null) {
  if (!user) return null;
  const privacy = await privacyFor(db, user.id);
  const visible = (category) =>
    user.id === viewerId || privacy[category] === "public";
  const count = async (sql) => (await db.prepare(sql).get(user.id)).count;
  const follows = async (a, b) =>
    !!(await db
      .prepare(
        "SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?",
      )
      .get(a, b));
  const isFollowing = viewerId ? await follows(viewerId, user.id) : false;
  const followsViewer = viewerId ? await follows(user.id, viewerId) : false;
  const record = await db
    .prepare(
      "SELECT username, avatar_url, avatar_zoom, avatar_offset_x, avatar_offset_y, is_demo FROM users WHERE id = ?",
    )
    .get(user.id);
  return {
    id: user.id,
    name: user.name,
    bio: user.bio,
    username: record.username || `viajante-${user.id}`,
    avatarUrl: record.avatar_url,
    avatarZoom: record.avatar_zoom,
    avatarOffsetX: record.avatar_offset_x,
    avatarOffsetY: record.avatar_offset_y,
    isDemo: !!record.is_demo,
    projects: await count(
      `SELECT COUNT(*) AS count FROM projects WHERE owner_id = ? ${viewerId === user.id ? "" : "AND github_private=0"}`,
    ),
    followers: visible("followers")
      ? await count(
          "SELECT COUNT(*) AS count FROM follows WHERE followed_id = ?",
        )
      : null,
    followingCount: visible("following")
      ? await count(
          "SELECT COUNT(*) AS count FROM follows WHERE follower_id = ?",
        )
      : null,
    friends: visible("friends")
      ? await count(
          "SELECT COUNT(*) AS count FROM follows a JOIN follows b ON a.follower_id=b.followed_id AND a.followed_id=b.follower_id WHERE a.follower_id = ?",
        )
      : null,
    following: isFollowing,
    followsViewer,
    isFriend: isFollowing && followsViewer,
    visibility: Object.fromEntries(
      SOCIAL_CATEGORIES.map((key) => [key, visible(key)]),
    ),
    ...(user.id === viewerId
      ? {
          privacy,
        }
      : {}),
  };
}
export async function publicProject(
  db,
  project,
  viewerId = null,
  authorized = false,
) {
  if (
    !project ||
    (project.github_private && project.owner_id !== viewerId && !authorized)
  )
    return null;
  const owner = await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(project.owner_id);
  return {
    id: project.id,
    sizeBytes: project.size_bytes,
    name: project.name,
    description: project.description_text ?? project.description,
    repositoryUrl:
      project.repository_url || project.github_url || project.demo_url,
    orbit:
      project.orbit_x == null
        ? null
        : [project.orbit_x, project.orbit_y, project.orbit_z],
    github: {
      integrationEnabled: !!project.github_integration_enabled,
      private: !!project.github_private,
      fullName: project.github_repository_full_name,
      defaultBranch: project.github_default_branch,
    },
    languages: JSON.parse(project.languages_json),
    languageBytes: JSON.parse(project.language_bytes_json || "{}"),
    githubUrl: project.github_url,
    demoUrl: project.demo_url,
    externalUrl: project.demo_url,
    views: project.views,
    rating: project.rating,
    updatedAt: project.updated_at,
    createdAt: project.created_at,
    likes: (
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM project_likes WHERE project_id = ?",
        )
        .get(project.id)
    ).count,
    owner: await publicUser(db, owner, viewerId),
    liked: viewerId
      ? !!(await db
          .prepare(
            "SELECT 1 FROM project_likes WHERE user_id = ? AND project_id = ?",
          )
          .get(viewerId, project.id))
      : false,
    favorited: viewerId
      ? !!(await db
          .prepare(
            "SELECT 1 FROM favorites WHERE user_id = ? AND project_id = ?",
          )
          .get(viewerId, project.id))
      : false,
  };
}
export async function createSession(db, userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 86400000,
  ).toISOString();
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    )
    .run(tokenHash(token), userId, expiresAt);
  return {
    token,
    expiresAt,
  };
}
export function sessionCookie(token, expiresAt) {
  return `orbitfolio_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Expires=${new Date(expiresAt).toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export async function clearSession(db, header) {
  const token = parseCookies(header).orbitfolio_session;
  if (token)
    await db
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .run(tokenHash(token));
  return "orbitfolio_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}
export async function register(db, input) {
  const { name, username } = profileIdentity(input);
  const email = String(input.email ?? "")
      .trim()
      .toLowerCase(),
    password = String(input.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ApiError(422, "Informe um e-mail válido.");
  if (password.length < 8)
    throw new ApiError(422, "A senha deve ter ao menos 8 caracteres.");
  if (
    await db
      .prepare("SELECT 1 FROM users WHERE lower(email) = lower(?)")
      .get(email)
  )
    throw new ApiError(409, "Este e-mail já possui uma conta.");
  if (
    await db
      .prepare("SELECT 1 FROM users WHERE lower(username)=lower(?)")
      .get(username)
  )
    throw new ApiError(
      409,
      "Este nome de usuário já está em uso. Escolha outro.",
    );
  const user = {
    id: randomUUID(),
    name,
    email,
    bio: "Explorador(a) da comunidade Orbitfolio.",
  };
  try {
    await db
      .prepare(
        "INSERT INTO users (id, name, email, password_hash, bio, username) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        user.id,
        user.name,
        user.email,
        passwordHash(password),
        user.bio,
        username,
      );
  } catch (error) {
    identityConflict(error);
  }
  return user;
}
export async function login(db, input) {
  const email = String(input.email ?? "")
      .trim()
      .toLowerCase(),
    password = String(input.password ?? "");
  const user = await db
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
    .get(email);
  if (!user || !passwordMatches(password, user.password_hash))
    throw new ApiError(401, "E-mail ou senha inválidos.");
  return user;
}
export async function createProject(db, user, input) {
  requireUser(user);
  let metadata = null;
  if (input.importId) {
    const row = await db
      .prepare(
        "SELECT * FROM project_imports WHERE id=? AND user_id=? AND expires_at>?",
      )
      .get(input.importId, user.id, Date.now());
    if (!row)
      throw new ApiError(
        422,
        "Importação expirada. Leia o repositório novamente.",
      );
    metadata = JSON.parse(row.metadata_json);
  }
  if (
    !metadata &&
    (input.githubIntegrationEnabled ||
      input.github_integration_enabled ||
      input.github)
  )
    throw new ApiError(
      422,
      "Importe o repositório para vincular uma integração.",
    );
  const name = String(input.name ?? metadata?.name ?? "").trim(),
    description = String(
      input.description ?? metadata?.description ?? "",
    ).trim();
  if (name.length < 2 || name.length > 50)
    throw new ApiError(422, "Informe um nome entre 2 e 50 caracteres.");
  if (description.length > 350)
    throw new ApiError(422, "A descrição deve ter até 350 caracteres.");
  const languages = normalizeLanguages(
    input.languages ?? metadata?.languages ?? {},
  );
  const sizeBytes = Number(metadata?.sizeBytes ?? input.sizeBytes ?? 0);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0)
    throw new ApiError(422, "Tamanho inválido.");
  const repositoryUrl = validProjectUrl(
      metadata?.repositoryUrl ?? input.repositoryUrl ?? input.githubUrl ?? "",
    ),
    demoUrl = validProjectUrl(input.demoUrl ?? "");
  if (input.githubUrl && !githubRepositoryUrl(input.githubUrl))
    throw new ApiError(
      422,
      "Informe o link principal de um repositório GitHub.",
    );
  if (!repositoryUrl && !demoUrl)
    throw new ApiError(
      422,
      "Adicione um link do GitHub ou um link externo para criar o projeto.",
    );
  let id = slug(name);
  if (!id) throw new ApiError(422, "Nome inválido.");
  if (await db.prepare("SELECT 1 FROM projects WHERE id=?").get(id))
    id += `-${randomUUID().slice(0, 8)}`;
  const gh = metadata?.github,
    now = isoNow();
  await db.transaction(async (db) => {
    if (db.dialect === "postgres")
      await db.exec("SELECT pg_advisory_xact_lock(7430192602)");
    await db
      .prepare(
        `INSERT INTO projects(id,owner_id,name,description,description_text,languages_json,github_url,demo_url,size_bytes,repository_url,github_repository_id,github_repository_owner,github_repository_name,github_repository_full_name,github_default_branch,github_integration_enabled,github_private,language_bytes_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        user.id,
        name,
        description.length >= 10 ? description : "Sem descrição.",
        description,
        JSON.stringify(languages),
        gh?.url || githubRepositoryUrl(repositoryUrl),
        demoUrl,
        sizeBytes,
        repositoryUrl,
        gh?.id ?? null,
        gh?.owner ?? null,
        gh?.name ?? null,
        gh?.fullName ?? null,
        gh?.defaultBranch ?? null,
        gh?.integrationEnabled ? 1 : 0,
        gh?.private ? 1 : 0,
        JSON.stringify(metadata?.languageBytes ?? {}),
        now,
        now,
      );
    await ensureOrbits(db);
    if (input.importId)
      await db
        .prepare("DELETE FROM project_imports WHERE id=?")
        .run(input.importId);
  });
  return await db.prepare("SELECT * FROM projects WHERE id=?").get(id);
}
export async function setRelation(db, table, fields, values, active) {
  const where = fields.map((field) => `${field} = ?`).join(" AND ");
  if (active)
    await db
      .prepare(
        `INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
      )
      .run(...values);
  else await db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...values);
}
export async function rankingProjects(db, viewerId, period) {
  const days =
    {
      week: 7,
      month: 30,
      all: null,
    }[period] ?? null;
  const params = days
    ? [new Date(Date.now() - days * 86400000).toISOString()]
    : [];
  const clause = days ? "WHERE project_likes.created_at >= ?" : "";
  const rows = await db
    .prepare(
      `SELECT projects.*, COUNT(project_likes.user_id) AS period_likes FROM projects LEFT JOIN project_likes ON project_likes.project_id = projects.id ${clause} GROUP BY projects.id ORDER BY period_likes DESC, projects.views DESC, projects.updated_at DESC`,
    )
    .all(...params);
  return (
    await Promise.all(
      rows.map(async (row) => await publicProject(db, row, viewerId)),
    )
  ).filter(Boolean);
}
export const SOCIAL_CATEGORIES = [
  "followers",
  "following",
  "friends",
  "likes",
  "favorites",
];
export async function privacyFor(db, userId) {
  return Object.assign(
    Object.fromEntries(SOCIAL_CATEGORIES.map((key) => [key, "public"])),
    Object.fromEntries(
      (
        await db
          .prepare(
            "SELECT category, visibility FROM profile_privacy WHERE user_id=?",
          )
          .all(userId)
      ).map((row) => [row.category, row.visibility]),
    ),
  );
}
