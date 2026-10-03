import { databaseConfig, databaseStartupError } from "../server/database-config.js";
import { githubConfig } from "../server/github.js";
import { databasePath } from "../server/storage.js";
import { existsSync } from "node:fs";
const config = githubConfig();
console.log(
  "OAuth GitHub:",
  config.enabled ? "configuração completa" : "configuração incompleta",
);
if (config.configurationIssues.length)
  console.log("Verifique as variáveis:", config.configurationIssues.join(", "));
try {
  const db = databaseConfig();
  console.log("Banco:", db.dialect === "postgres"
    ? "PostgreSQL configurado (conexão não testada)"
    : `SQLite local: ${existsSync(databasePath()) ? "existente" : "novo"}`);
} catch (error) {
  console.error(databaseStartupError(error));
  process.exitCode = 1;
}
console.log(
  "Contas não expiram. A sessão de login tem prazo; encerrar a sessão não exclui a conta.",
);
if (!config.enabled) process.exitCode = 1;
