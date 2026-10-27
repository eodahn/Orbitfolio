// Codes are safe to put in the return URL; never include upstream responses or credentials.
export const oauthMessages = Object.freeze({
  cancelled:
    "Você cancelou a autorização no GitHub. Pode conectar novamente quando quiser.",
  invalid_state:
    "A autorização expirou ou não pertence a esta sessão. Inicie a conexão novamente.",
  invalid_code:
    "O código de autorização expirou ou é inválido. Conecte o GitHub novamente.",
  session_required: "Entre no Orbitfolio antes de conectar sua conta GitHub.",
  not_configured:
    "A conexão GitHub aguarda a configuração do administrador do site.",
  rate_limit: "O GitHub limitou as consultas. Aguarde e tente novamente.",
  unavailable:
    "Não foi possível alcançar o GitHub. Tente novamente em instantes.",
  access_denied:
    "O GitHub negou o acesso. Confira as permissões da conta ou organização.",
  error: "Não foi possível concluir a conexão. Inicie a autorização novamente.",
});
export function oauthErrorCode(error) {
  if (Object.hasOwn(oauthMessages, error?.code)) return error.code;
  return (
    {
      401: "session_required",
      403: "access_denied",
      429: "rate_limit",
      502: "unavailable",
      503: "unavailable",
    }[error?.status] || "error"
  );
}
