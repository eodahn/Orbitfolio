import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
export const projectRoot = fileURLToPath(new URL("..", import.meta.url));
export function databasePath(filename, env = process.env) {
  const value =
    filename ?? env.ORBITFOLIO_DATABASE_PATH ?? "data/orbitfolio.sqlite";
  return value === ":memory:" ? value : resolve(projectRoot, value);
}
export function prepareDatabasePath(filename, env = process.env) {
  const path = databasePath(filename, env);
  if (
    env.ORBITFOLIO_REQUIRE_EXISTING_DATABASE === "true" &&
    (path === ":memory:" || !existsSync(path))
  ) {
    throw new Error(
      "Banco configurado não encontrado. Inicialização cancelada para não substituir contas por um banco vazio. Confira ORBITFOLIO_DATABASE_PATH e o disco persistente.",
    );
  }
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  return path;
}
export function storageWarnings(env = process.env) {
  if (!env.RENDER || env.DATABASE_URL) return [];
  if (
    !env.ORBITFOLIO_DATABASE_PATH ||
    !isAbsolute(env.ORBITFOLIO_DATABASE_PATH)
  )
    return [
      "Configure ORBITFOLIO_DATABASE_PATH com um caminho absoluto em um disco persistente do Render. Sem isso, contas podem ser perdidas ao reimplantar.",
    ];
  return [
    "Confirme que ORBITFOLIO_DATABASE_PATH pertence a um disco persistente montado. Definir a variável, sozinho, não cria o disco.",
  ];
}
