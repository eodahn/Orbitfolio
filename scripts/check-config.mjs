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
  "Banco SQLite existente:",
  existsSync(databasePath()) ? "sim" : "não",
);
for (const warning of storageWarnings()) console.log(warning);
console.log(
  "Contas não expiram. A sessão de login tem prazo; encerrar a sessão não exclui a conta.",
);
if (!config.enabled) process.exitCode = 1;
