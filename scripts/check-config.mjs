import { githubConfig } from "../server/github.js";
import { databasePath, storageWarnings } from "../server/storage.js";
import { existsSync } from "node:fs";
const config = githubConfig();
console.log(
  "OAuth GitHub:",
  config.enabled ? "configuração completa" : "configuração incompleta",
);
if (config.configurationIssues.length)
  console.log("Verifique as variáveis:", config.configurationIssues.join(", "));
console.log(
  "Banco:",
  process.env.DATABASE_URL
    ? "PostgreSQL configurado (conexão não testada)"
    : process.env.NODE_ENV === "production"
      ? "DATABASE_URL ausente"
      : `SQLite local: ${existsSync(databasePath()) ? "existente" : "novo"}`,
);
for (const warning of storageWarnings()) console.log(warning);
console.log(
  "Contas não expiram. A sessão de login tem prazo; encerrar a sessão não exclui a conta.",
);
if (
  !config.enabled ||
  (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL)
)
  process.exitCode = 1;
