import { publicProject, publicUser, ApiError } from "./app.js";
export const normalizeSearch = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export async function searchAll(db, input, viewerId = null) {
  const q = normalizeSearch(input);
  if (q.length > 120)
    throw new ApiError(422, "Pesquise com até 120 caracteres.");
  if (!q)
    return {
      users: [],
      projects: [],
    };
  const tokens = q.split(" "),
    score = (names, details = "") => {
      const fields = names.map(normalizeSearch),
        all = [...fields, normalizeSearch(details)].join(" ");
      if (fields.includes(q)) return 0;
      if (fields.some((n) => n.startsWith(q))) return 1;
      if (fields.some((n) => n.includes(q))) return 2;
      return tokens.every((t) => all.includes(t)) ? 3 : Infinity;
    };
  const rank = (rows, names, details) =>
    rows
      .map((row) => ({
        row,
        score: score(names(row), details(row)),
      }))
      .filter((r) => Number.isFinite(r.score))
      .sort(
        (a, b) =>
          a.score - b.score || a.row.name.localeCompare(b.row.name, "pt-BR"),
      )
      .slice(0, 50)
      .map((r) => r.row);
  // Filter at SQL boundary before matching, ranking or counting private projects.
  const projects = await Promise.all(
    rank(
      await db
        .prepare("SELECT * FROM projects WHERE github_private=0 OR owner_id=?")
        .all(viewerId),
      (p) => [p.name],
      (p) =>
        [
          p.description_text ?? p.description,
          ...Object.keys(JSON.parse(p.languages_json)),
        ].join(" "),
    ).map(async (p) => await publicProject(db, p, viewerId)),
  );
  const users = await Promise.all(
    rank(
      await db.prepare("SELECT * FROM users").all(),
      (u) => [u.name, u.username || ""],
      () => "",
    ).map(async (u) => await publicUser(db, u, viewerId)),
  );
  return {
    users,
    projects,
  };
}
