// Shared by startup, migration CLI and diagnostics. Never print connection URLs.
export function databaseConfig(env = process.env) {
  const connectionString = (env.DATABASE_URL || "").trim();
  if (!connectionString) {
    if (env.NODE_ENV === "production" || env.RENDER === "true") {
      throw Object.assign(new Error("DATABASE_URL ausente ou vazia no processo. Configure-a no Environment do serviço web Orbitfolio e salve com deploy."), { code: "DATABASE_URL_MISSING" });
    }
    return { dialect: "sqlite" };
  }
  try {
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2)
      throw Error();
  } catch {
    throw Object.assign(new Error("DATABASE_URL inválida. Use a URL PostgreSQL completa, sem aspas ou colchetes."), { code: "DATABASE_URL_INVALID" });
  }
  return { dialect: "postgres", connectionString };
}

export function databaseStartupError(error) {
  const hints = {
    DATABASE_URL_MISSING: "DATABASE_URL ausente ou vazia no processo. Configure-a no Environment do serviço web Orbitfolio e salve com deploy.",
    DATABASE_URL_INVALID: "DATABASE_URL inválida. Use a URL PostgreSQL completa, sem aspas ou colchetes.",
    ENOTFOUND: "Host PostgreSQL não encontrado. Confira a URL interna e a região/rede do serviço.",
    EAI_AGAIN: "Falha temporária de DNS ao localizar PostgreSQL.",
    ECONNREFUSED: "PostgreSQL recusou a conexão. Confira se o banco está disponível.",
    ETIMEDOUT: "Tempo esgotado ao conectar ao PostgreSQL. Confira conectividade e região/rede.",
    "28P01": "Autenticação PostgreSQL recusada. Atualize DATABASE_URL com as credenciais atuais.",
    "28000": "Acesso ao PostgreSQL recusado. Confira as permissões de conexão.",
    "3D000": "O banco PostgreSQL configurado não existe.",
    "42501": "Permissões insuficientes no PostgreSQL para aplicar migrations ou acessar tabelas.",
  };
  const code = typeof error?.code === "string" ? error.code : "";
  if (Object.hasOwn(hints, code)) return `[${code}] ${hints[code]}`;
  // PostgreSQL SQLSTATE is safe to expose; messages/details may contain secrets.
  const label = /^[0-9A-Z]{5}$/.test(code) ? ` [${code}]` : "";
  return `Falha na inicialização do banco${label}. Confira DATABASE_URL, conectividade e migrations. Detalhes privados omitidos.`;
}
