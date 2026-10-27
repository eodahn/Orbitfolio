import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { ApiError, requireUser, parseCookies } from "./app.js";
import { saveImport } from "./project-data.js";
const API = "https://api.github.com";
const sha = (value) => createHash("sha256").update(value).digest("hex");
export function githubConfig(env = process.env) {
  const origin = (
    env.APP_ORIGIN ||
    (env.NODE_ENV === "production"
      ? "https://orbitfolio.onrender.com"
      : env.RENDER_EXTERNAL_URL) ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");
  let valid = false;
  try {
    const u = new URL(origin);
    valid =
      (u.protocol === "https:" ||
        (["localhost", "127.0.0.1"].includes(u.hostname) &&
          u.protocol === "http:")) &&
      u.origin === origin &&
      (env.NODE_ENV !== "production" ||
        origin === "https://orbitfolio.onrender.com");
  } catch {}
  const callbackUrl = (
    env.GITHUB_CALLBACK_URL || `${origin}/api/github/callback`
  ).trim();
  const callbackValid = callbackUrl === `${origin}/api/github/callback`;
  const key = (env.GITHUB_TOKEN_ENCRYPTION_KEY || "").trim();
  const clientId = (env.GITHUB_CLIENT_ID || "").trim();
  const secret = (env.GITHUB_CLIENT_SECRET || "").trim();
  const configurationIssues = [];
  if (!valid) configurationIssues.push("APP_ORIGIN");
  if (!callbackValid) configurationIssues.push("GITHUB_CALLBACK_URL");
  if (!clientId) configurationIssues.push("GITHUB_CLIENT_ID");
  if (!secret) configurationIssues.push("GITHUB_CLIENT_SECRET");
  if (!/^[a-fA-F0-9]{64}$/.test(key))
    configurationIssues.push("GITHUB_TOKEN_ENCRYPTION_KEY");
  return {
    enabled: configurationIssues.length === 0,
    configurationIssues,
    callbackUrl,
    origin,
    clientId,
    secret,
    key,
  };
}
export function encryptToken(token, userId, config = githubConfig()) {
  if (!config.enabled)
    throw new ApiError(
      503,
      "Integração GitHub indisponível. O servidor precisa ser configurado.",
    );
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(config.key, "hex"), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decryptToken(value, userId, config = githubConfig()) {
  try {
    const [iv, tag, encrypted] = value
      .split(".")
      .map((s) => Buffer.from(s, "base64url"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(config.key, "hex"),
      iv,
    );
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ApiError(401, "Reconecte sua conta GitHub.");
  }
}
export async function githubRequest(path, { token, fetcher = fetch } = {}) {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new ApiError(422, "Caminho GitHub inválido.");
  let response;
  try {
    let target = new URL(API + path);
    for (let redirects = 0; redirects < 4; redirects++) {
      response = await fetcher(target.href, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Orbitfolio",
          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
      });
      if (![301, 302, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw Error("Invalid redirect");
      target = new URL(location, target);
      if (target.origin !== API || target.username || target.password)
        throw Error("Unsafe redirect");
    }
  } catch {
    throw new ApiError(
      503,
      "GitHub indisponível ou conexão perdida. Tente novamente.",
    );
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.has("retry-after") ||
          /rate limit|abuse detection/i.test(failure.message || "")))
    )
      throw new ApiError(
        429,
        "Limite de consultas ao GitHub atingido. Aguarde e tente novamente.",
      );
    if (response.status === 401)
      throw new ApiError(
        401,
        "Integração GitHub expirada. Reconecte sua conta.",
      );
    if (response.status === 404)
      throw new ApiError(
        404,
        token
          ? "Repositório não encontrado ou não autorizado para a conta GitHub conectada. Verifique o endereço e as permissões da organização."
          : "Repositório público não encontrado. Verifique o endereço ou conecte o GitHub para acessar repositórios privados.",
      );
    if (response.status === 403)
      throw new ApiError(
        403,
        response.headers.has("x-github-sso")
          ? "Autorize o acesso SSO da sua organização no GitHub e tente novamente."
          : "O GitHub negou acesso. Verifique as permissões do aplicativo OAuth na organização ou reconecte sua conta GitHub.",
      );
    if (response.status === 409)
      return {
        data: [],
        hasNext: false,
      };
    throw new ApiError(
      502,
      "Não foi possível consultar o GitHub. Tente novamente.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(502, "Resposta inválida do GitHub.");
  }
  return {
    data,
    hasNext: !!response.headers.get("link")?.includes('rel="next"'),
  };
}
export function repositoryPath(input) {
  let owner, name;
  if (typeof input === "string" && input.startsWith("https://")) {
    let url;
    try {
      url = new URL(input);
    } catch {
      throw new ApiError(422, "Link inválido.");
    }
    if (
      url.hostname !== "github.com" ||
      url.username ||
      url.password ||
      url.port
    )
      throw new ApiError(
        422,
        "Use o link de um repositório em github.com ou personalize manualmente.",
      );
    [owner, name] = url.pathname.replace(/\/$/, "").split("/").slice(1);
    if (url.pathname.replace(/\/$/, "").split("/").length !== 3)
      throw new ApiError(422, "Use o link principal do repositório.");
  } else {
    const parts = String(input || "").split("/");
    if (parts.length !== 2)
      throw new ApiError(422, "Informe owner/repositório.");
    [owner, name] = parts;
  }
  name = name?.replace(/\.git$/, "");
  if (
    !/^[a-zA-Z0-9-]+$/.test(owner || "") ||
    !/^[a-zA-Z0-9_.-]+$/.test(name || "") ||
    [".", ".."].includes(name)
  )
    throw new ApiError(422, "Informe owner/repositório ou o link do GitHub.");
  return {
    owner,
    name,
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
  };
}
export function mapRepository(repo, languages, integration) {
  const entries = Object.entries(languages).filter(
      ([, bytes]) => Number.isFinite(bytes) && bytes > 0,
    ),
    total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  return {
    name: repo.name,
    description: repo.description || "",
    repositoryUrl: repo.html_url,
    githubUrl: repo.html_url,
    sizeBytes: Math.max(0, repo.size || 0) * 1024,
    languages: Object.fromEntries(
      entries.map(([name, bytes]) => [name, (bytes / total) * 100]),
    ),
    languageBytes: Object.fromEntries(entries),
    github: {
      id: repo.id,
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      defaultBranch: repo.default_branch,
      private: !!repo.private,
      integrationEnabled: integration,
    },
  };
}
export function createGithubService(
  db,
  { env = process.env, fetcher = fetch } = {},
) {
  const config = githubConfig(env);
  const tokenFor = async (user) => {
    requireUser(user);
    if (!config.enabled)
      throw new ApiError(
        503,
        "Integração GitHub indisponível. O servidor precisa ser configurado.",
      );
    const row = await db
      .prepare("SELECT * FROM github_connections WHERE user_id=?")
      .get(user.id);
    if (!row)
      throw new ApiError(401, "Conecte sua conta GitHub para continuar.");
    return decryptToken(row.encrypted_token, user.id, config);
  };
  const request = async (path, token) =>
    await githubRequest(path, {
      token,
      fetcher,
    });
  return {
    async status(user) {
      requireUser(user);
      const row = await db
        .prepare("SELECT * FROM github_connections WHERE user_id=?")
        .get(user.id);
      let connected = config.enabled && !!row;
      if (connected) {
        try {
          decryptToken(row.encrypted_token, user.id, config);
        } catch {
          connected = false;
        }
      }
      return {
        available: config.enabled,
        configurationIssues: config.configurationIssues,
        connected,
        login: connected ? row?.github_login : null,
        account: connected
          ? {
              id: row.github_user_id,
              login: row.github_login,
              name: row.github_name,
              avatarUrl: row.github_avatar_url,
              profileUrl: row.github_profile_url,
            }
          : null,
      };
    },
    async connect(user, cookies) {
      requireUser(user);
      if (!config.enabled)
        throw new ApiError(
          503,
          "Integração GitHub indisponível. O servidor precisa ser configurado.",
        );
      const session = parseCookies(cookies).orbitfolio_session;
      if (!session) throw new ApiError(401, "Entre novamente.");
      const state = randomBytes(32).toString("base64url"),
        verifier = randomBytes(32).toString("base64url");
      await db.transaction(async (db) => {
        await db
          .prepare(
            "DELETE FROM github_oauth_states WHERE expires_at<? OR user_id=?",
          )
          .run(Date.now(), user.id);
        await db
          .prepare("INSERT INTO github_oauth_states VALUES(?,?,?,?,?)")
          .run(
            sha(state),
            user.id,
            sha(session),
            encryptToken(verifier, user.id, config),
            Date.now() + 10 * 60 * 1000,
          );
      });
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.callbackUrl,
        scope: "read:user repo",
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      });
      return {
        url: "https://github.com/login/oauth/authorize?" + params,
      };
    },
    async callback(user, cookies, query) {
      requireUser(user);
      if (!config.enabled)
        throw new ApiError(503, "Integração indisponível.", "not_configured");
      const state = String(query.get("state") || ""),
        row = await db
          .prepare("SELECT * FROM github_oauth_states WHERE state_hash=?")
          .get(sha(state));
      if (
        !row ||
        row.user_id !== user.id ||
        row.expires_at < Date.now() ||
        row.session_hash !== sha(parseCookies(cookies).orbitfolio_session || "")
      )
        throw new ApiError(
          403,
          "Autorização inválida ou expirada. Tente conectar novamente.",
          "invalid_state",
        );
      const consumed = await db
        .prepare("DELETE FROM github_oauth_states WHERE state_hash=?")
        .run(sha(state));
      if (consumed.changes !== 1)
        throw new ApiError(403, "Autorização já utilizada.", "invalid_state");
      if (query.get("error"))
        throw new ApiError(403, "Autorização GitHub cancelada.", "cancelled");
      if (!query.get("code"))
        throw new ApiError(
          401,
          "Código de autorização ausente.",
          "invalid_code",
        );
      let response;
      try {
        response = await fetcher(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: config.clientId,
              client_secret: config.secret,
              code: query.get("code"),
              redirect_uri: config.callbackUrl,
              code_verifier: decryptToken(
                row.encrypted_verifier,
                user.id,
                config,
              ),
            }),
            redirect: "error",
            signal: AbortSignal.timeout(12000),
          },
        );
      } catch {
        throw new ApiError(
          503,
          "Não foi possível concluir a conexão com GitHub.",
        );
      }
      if (response.status === 429)
        throw new ApiError(
          429,
          "Limite de consultas ao GitHub atingido.",
          "rate_limit",
        );
      if (response.status >= 500)
        throw new ApiError(503, "GitHub indisponível.", "unavailable");
      const payload = await response.json().catch(() => null);
      if (!payload)
        throw new ApiError(502, "Resposta inválida do GitHub.", "unavailable");
      if (!response.ok || !payload?.access_token)
        throw new ApiError(
          401,
          "Autorização GitHub expirada. Tente novamente.",
          "invalid_code",
        );
      const { data: identity } = await request("/user", payload.access_token);
      if (!identity?.id || !identity?.login)
        throw new ApiError(502, "Identidade GitHub inválida.", "unavailable");
      await db.transaction(async (db) => {
        await db
          .prepare(
            "INSERT INTO github_connections(user_id,github_user_id,github_login,encrypted_token) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET github_user_id=excluded.github_user_id,github_login=excluded.github_login,encrypted_token=excluded.encrypted_token,updated_at=CURRENT_TIMESTAMP",
          )
          .run(
            user.id,
            identity.id,
            identity.login,
            encryptToken(payload.access_token, user.id, config),
          );
        await db
          .prepare(
            "UPDATE github_connections SET github_name=?,github_avatar_url=?,github_profile_url=? WHERE user_id=?",
          )
          .run(
            identity.name || identity.login,
            identity.avatar_url || "",
            identity.html_url || "",
            user.id,
          );
      });
    },
    async disconnect(user) {
      requireUser(user);
      await db.transaction(async (db) => {
        await db
          .prepare("DELETE FROM github_connections WHERE user_id=?")
          .run(user.id);
        await db
          .prepare("DELETE FROM github_oauth_states WHERE user_id=?")
          .run(user.id);
        await db
          .prepare("DELETE FROM project_imports WHERE user_id=?")
          .run(user.id);
      });
    },
    async repositories(user, page = 1) {
      const { data, hasNext } = await request(
        `/user/repos?per_page=30&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        await tokenFor(user),
      );
      return {
        repositories: data.map((r) => ({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          private: r.private,
        })),
        hasNext,
      };
    },
    async inspect(user, input) {
      requireUser(user);
      if (typeof input.integrated !== "boolean")
        throw new ApiError(
          422,
          "Informe se a importação usa integração GitHub.",
        );
      const integrated = input.integrated === true,
        { path } = repositoryPath(input.url || input.fullName),
        token = integrated ? await tokenFor(user) : undefined;
      const { data: repo } = await request(path, token);
      if (repo.private && !integrated)
        throw new ApiError(
          403,
          "Este repositório exige integração autenticada.",
        );
      const { data: languages } = await request(
        repositoryPath(repo.full_name).path + "/languages",
        token,
      );
      return await saveImport(
        db,
        user,
        mapRepository(repo, languages, integrated),
      );
    },
    async authorize(user, project) {
      const token = await tokenFor(user),
        { path } = repositoryPath(project.github_repository_full_name);
      const { data: repo } = await request(path, token);
      if (Number(repo.id) !== Number(project.github_repository_id))
        throw new ApiError(
          403,
          "O vínculo do repositório mudou. Reimporte o projeto.",
        );
      return {
        token,
        path,
        repo,
      };
    },
    async commits(user, project, page = 1) {
      if (!project.github_integration_enabled)
        throw new ApiError(409, "Este projeto não possui integração GitHub.");
      // Always use the viewer's credential, never the project owner's credential.
      const { token, path } = await this.authorize(user, project);
      const branch = encodeURIComponent(
        project.github_default_branch || "HEAD",
      );
      const result = await request(
        `${path}/commits?sha=${branch}&per_page=30&page=${page}`,
        token,
      );
      let tags = [];
      try {
        tags = (await request(path + "/tags?per_page=100", token)).data;
      } catch (error) {
        if ([401, 403].includes(error.status)) throw error;
      }
      const versions = new Map(tags.map((tag) => [tag.commit.sha, tag.name]));
      // Bounded ancestry lookup: up to three recent releases, 100 commits each.
      // Only label a commit if GitHub's compare response proves it descends from the tag.
      try {
        const { data: releases } = await request(
          path + "/releases?per_page=3",
          token,
        );
        const distances = new Map();
        if (result.data.length && Array.isArray(releases))
          for (const release of releases.filter((r) => !r.draft)) {
            const comparison = (
              await request(
                `${path}/compare/${encodeURIComponent(release.tag_name)}...${encodeURIComponent(result.data[0].sha)}?per_page=100`,
                token,
              )
            ).data;
            if (!["ahead", "identical"].includes(comparison.status)) continue;
            const ancestor = comparison.base_commit?.sha;
            if (ancestor && !versions.has(ancestor))
              versions.set(ancestor, release.tag_name);
            for (const [index, commit] of (comparison.commits || []).entries())
              if (
                !tags.some((t) => t.commit.sha === commit.sha) &&
                index < (distances.get(commit.sha) ?? Infinity)
              ) {
                distances.set(commit.sha, index);
                versions.set(commit.sha, `após ${release.tag_name}`);
              }
          }
      } catch (error) {
        if ([401, 403].includes(error.status)) throw error;
      }
      return {
        commits: result.data.map((c) => ({
          sha: c.sha,
          shortSha: c.sha.slice(0, 7),
          message: c.commit.message,
          author:
            c.commit.author?.name || c.author?.login || "Autor desconhecido",
          avatarUrl: c.author?.avatar_url || "",
          committedAt: c.commit.author?.date || c.commit.committer?.date,
          url: c.html_url,
          version: versions.get(c.sha) || c.sha.slice(0, 7),
        })),
        hasNext: result.hasNext,
        page,
      };
    },
  };
}
