import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, mkdirSync, chmodSync, linkSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { databasePath } from "../server/storage.js";
const target = process.argv[2];
if (!target)
  throw Error("Informe o destino: npm run backup:db -- /caminho/backup.sqlite");
const source = databasePath(),
  destination = resolve(target);
if (!existsSync(source))
  throw Error("Banco de origem não encontrado; nenhum banco vazio foi criado.");
if (existsSync(destination) || source === destination)
  throw Error("O destino já existe. Escolha um novo arquivo.");
mkdirSync(dirname(destination), { recursive: true });
const temporary = destination + "." + process.pid + ".tmp";
const db = new DatabaseSync(source, { readOnly: true });
const mask = process.umask(0o077);
try {
  await backup(db, temporary);
  chmodSync(temporary, 0o600);
  linkSync(temporary, destination);
  console.log(
    "Backup consistente concluído. Guarde uma cópia fora do servidor.",
  );
} finally {
  db.close();
  process.umask(mask);
  if (existsSync(temporary)) rmSync(temporary);
}
