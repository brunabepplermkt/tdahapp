/** Erros de login do Supabase → mensagens curtas em português. Nunca expõe o texto cru do servidor. */

export const MIN_PASSWORD = 8;

interface AuthErr {
  message?: string;
  code?: string;
  status?: number;
}

export function authErrorMessage(e: unknown): string {
  const err = (e ?? {}) as AuthErr;
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();

  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (code === "user_already_exists" || msg.includes("already registered"))
    return "Esse e-mail já tem conta. Entre com ela.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed"))
    return "Confirme seu e-mail primeiro (olhe a caixa de entrada).";
  if (code === "weak_password" || msg.includes("password should be"))
    return `Senha fraca: use pelo menos ${MIN_PASSWORD} caracteres.`;
  if (code === "same_password" || msg.includes("different from the old"))
    return "Escolha uma senha diferente da atual.";
  if (code.includes("rate_limit") || err.status === 429 || msg.includes("rate limit") || msg.includes("too many"))
    return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  if (code === "signup_disabled" || msg.includes("signups not allowed")) return "Novos cadastros estão desligados.";
  if (code === "validation_failed" || msg.includes("unable to validate email") || msg.includes("invalid format"))
    return "Esse e-mail não parece certo.";
  if (/fetch|network|failed to|offline|timeout/.test(msg)) return "Sem internet. Tente de novo.";
  return "Não deu certo. Tente de novo.";
}

export interface CredentialCheck {
  ok: boolean;
  error?: string;
}

/** Validação local antes de gastar uma chamada de rede. */
export function checkCredentials(
  email: string,
  password: string,
  opts: { needPassword?: boolean } = {},
): CredentialCheck {
  const e = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { ok: false, error: "Esse e-mail não parece certo." };
  if (opts.needPassword !== false && password.length < MIN_PASSWORD)
    return { ok: false, error: `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.` };
  return { ok: true };
}
