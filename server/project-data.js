import { randomUUID } from "node:crypto";
import { ApiError, requireUser } from "./app.js";
import { WORLD, projectRadius } from "../shared/world-config.js";
import { hash, random } from "../src/utils/seed.js";

export function normalizeLanguages(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ApiError(422, "Linguagens inválidas.");
  const entries = Object.entries(input);
  if (entries.length > 24) throw new ApiError(422, "Use até 24 linguagens.");
  const seen = new Set();
  let total = 0,
    complete = entries.length > 0;
  const result = entries.map(([raw, value]) => {
    const name = raw.trim(),
      key = name.toLowerCase();
    if (!name || name.length > 50 || seen.has(key))
      throw new ApiError(
        422,
        "Informe linguagens únicas com até 50 caracteres.",
      );
    seen.add(key);
    const percentage = value == null || value === "" ? null : Number(value);
    if (
      percentage !== null &&
      (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)
    )
      throw new ApiError(422, "Porcentagens devem estar entre 0 e 100.");
    if (percentage === null) complete = false;
    else total += percentage;
    return [name, percentage];
  });
  if (total > 100.5 || (complete && Math.abs(total - 100) > 0.5))
    throw new ApiError(
      422,
      "Quando todas as porcentagens forem preenchidas, a soma deve ser 100%.",
    );
  return Object.fromEntries(result);
}
export function validProjectUrl(value = "") {
  if (!value) return "";
  try {
    const u = new URL(String(value));
    if (
      !["https:", "http:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.href.length > 2048
    )
      throw Error();
    return u.href;
  } catch {
    throw new ApiError(422, "Informe um link http(s) válido.");
  }
}
export function ensureOrbits(db) {
  const rows = db
    .prepare(
      "SELECT id,size_bytes,orbit_x,orbit_y,orbit_z FROM projects ORDER BY created_at,id",
    )
    .all();
  const bodies = rows
    .filter((p) => p.orbit_x != null)
    .map((p) => ({
      x: p.orbit_x,
      y: p.orbit_y,
      z: p.orbit_z,
      r: projectRadius(p.size_bytes),
    }));
  const update = db.prepare(
    "UPDATE projects SET orbit_x=?,orbit_y=?,orbit_z=? WHERE id=?",
  );
  for (const p of rows.filter((p) => p.orbit_x == null)) {
    const rng = random(hash(p.id)),
      r = projectRadius(p.size_bytes),
      valid = (q) =>
        bodies.every(
          (b) =>
            (q.x - b.x) ** 2 + (q.y - b.y) ** 2 + (q.z - b.z) ** 2 >
            (r + b.r + WORLD.margin) ** 2,
        );
    let position;
    for (let i = 0; i < 2000; i++) {
      const q = Object.fromEntries(
        ["x", "y", "z"].map((k) => [
          k,
          WORLD.min + r + rng() * (WORLD.max - WORLD.min - 2 * r),
        ]),
      );
      if (valid(q)) {
        position = q;
        break;
      }
    }
    if (!position)
      throw new ApiError(
        409,
        "O universo está cheio. Não foi possível posicionar o planeta com segurança.",
      );
    update.run(position.x, position.y, position.z, p.id);
    bodies.push({ ...position, r });
  }
}
export function deleteProject(db, user, id) {
  requireUser(user);
  const row = db.prepare("SELECT owner_id FROM projects WHERE id=?").get(id);
  if (!row) throw new ApiError(404, "Projeto não encontrado.");
  if (row.owner_id !== user.id)
    throw new ApiError(
      403,
      "Somente o proprietário pode excluir este projeto.",
    );
  db.prepare("DELETE FROM projects WHERE id=?").run(id);
}
export function saveImport(db, user, metadata) {
  const id = randomUUID();
  db.prepare("DELETE FROM project_imports WHERE expires_at<?").run(Date.now());
  db.prepare("INSERT INTO project_imports VALUES(?,?,?,?)").run(
    id,
    user.id,
    JSON.stringify(metadata),
    Date.now() + 30 * 60 * 1000,
  );
  return { importId: id, ...metadata };
}
