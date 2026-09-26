import {
  ApiError,
  publicUser,
  publicProject,
  requireUser,
  privacyFor,
  SOCIAL_CATEGORIES,
} from "./app.js";

export function profileSection(db, targetId, category, viewerId) {
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId);
  if (!target) throw new ApiError(404, "Usuário não encontrado.");
  if (category !== "projects" && !SOCIAL_CATEGORIES.includes(category))
    throw new ApiError(404, "Seção não encontrada.");
  if (
    targetId !== viewerId &&
    category !== "projects" &&
    privacyFor(db, targetId)[category] !== "public"
  )
    throw new ApiError(403, "Esta seção é privada.");
  const relations = {
    followers:
      "SELECT users.* FROM users JOIN follows ON users.id=follows.follower_id WHERE follows.followed_id=? ORDER BY users.name",
    following:
      "SELECT users.* FROM users JOIN follows ON users.id=follows.followed_id WHERE follows.follower_id=? ORDER BY users.name",
    friends:
      "SELECT users.* FROM users JOIN follows a ON users.id=a.followed_id JOIN follows b ON b.follower_id=a.followed_id AND b.followed_id=a.follower_id WHERE a.follower_id=? ORDER BY users.name",
  };
  if (relations[category])
    return {
      users: db
        .prepare(relations[category])
        .all(targetId)
        .map((u) => publicUser(db, u, viewerId)),
    };
  const query =
    category === "projects"
      ? "SELECT * FROM projects WHERE owner_id=? ORDER BY updated_at DESC"
      : `SELECT projects.* FROM projects JOIN ${category === "likes" ? "project_likes" : "favorites"} r ON projects.id=r.project_id WHERE r.user_id=? ORDER BY r.created_at DESC`;
  return {
    projects: db
      .prepare(query)
      .all(targetId)
      .map((p) => publicProject(db, p, viewerId))
      .filter(Boolean),
  };
}
export function updatePrivacy(db, user, input) {
  requireUser(user);
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== "object" ||
    Object.keys(input).some(
      (key) =>
        !SOCIAL_CATEGORIES.includes(key) ||
        !["public", "private"].includes(input[key]),
    )
  )
    throw new ApiError(422, "Configuração de privacidade inválida.");
  db.exec("BEGIN");
  try {
    for (const [key, value] of Object.entries(input))
      db.prepare(
        "INSERT INTO profile_privacy(user_id,category,visibility) VALUES(?,?,?) ON CONFLICT(user_id,category) DO UPDATE SET visibility=excluded.visibility",
      ).run(user.id, key, value);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return privacyFor(db, user.id);
}
export function updateProfile(db, user, input) {
  requireUser(user);
  const name = String(input.name ?? "").trim(),
    username = String(input.username ?? "")
      .trim()
      .toLowerCase(),
    bio = String(input.bio ?? "").trim(),
    avatar = String(input.avatarUrl ?? "").trim();
  if (
    name.length < 2 ||
    name.length > 80 ||
    !/^[a-z0-9_-]{3,64}$/.test(username) ||
    bio.length > 500
  )
    throw new ApiError(
      422,
      "Confira nome, username (3–64 letras, números, _ ou -) e bio (até 500 caracteres).",
    );
  if (avatar && !/^https?:\/\//i.test(avatar))
    throw new ApiError(422, "Use uma URL http(s) para a foto.");
  if (
    db
      .prepare("SELECT 1 FROM users WHERE username=? COLLATE NOCASE AND id<>?")
      .get(username, user.id)
  )
    throw new ApiError(409, "Username já utilizado.");
  db.prepare(
    "UPDATE users SET name=?,username=?,bio=?,avatar_url=? WHERE id=?",
  ).run(name, username, bio, avatar, user.id);
  return publicUser(
    db,
    db.prepare("SELECT * FROM users WHERE id=?").get(user.id),
    user.id,
  );
}
