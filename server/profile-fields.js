import { ApiError } from "./app.js";
export function profileIdentity(input) {
  const name = String(input.name ?? "").trim(),
    username = String(input.username ?? "")
      .trim()
      .toLowerCase();
  if (name.length < 2 || name.length > 50)
    throw new ApiError(
      422,
      "Informe um nome de exibição entre 2 e 50 caracteres.",
    );
  if (!/^[a-z0-9_-]{3,50}$/.test(username))
    throw new ApiError(
      422,
      "Use um username de 3 a 50 letras, números, _ ou -.",
    );
  return { name, username };
}
export function identityConflict(error) {
  if (
    error.code === "23505" ||
    (error.code?.startsWith("ERR_SQLITE") && /UNIQUE/i.test(error.message))
  ) {
    if (/username/.test(error.constraint || error.message))
      throw new ApiError(
        409,
        "Este nome de usuário já está em uso. Escolha outro.",
      );
    throw new ApiError(409, "Este e-mail já possui uma conta.");
  }
  throw error;
}
