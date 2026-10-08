/**
 * Os dados locais pertencem à primeira conta para a qual foram enviados.
 * Se outra conta entrar neste mesmo aparelho, NÃO misturamos: sem isso, os dados
 * da conta A poderiam subir para a conta B (vazamento entre usuários).
 */
const KEY = "tdahapp:sync:owner:v1";

export type OwnerCheck = "free" | "same" | "other";

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function checkOwner(userId: string, kv: KV | null = browserStorage()): OwnerCheck {
  const owner = kv?.getItem(KEY);
  if (!owner) return "free";
  return owner === userId ? "same" : "other";
}

export function claimOwner(userId: string, kv: KV | null = browserStorage()) {
  try {
    kv?.setItem(KEY, userId);
  } catch {
    /* sem armazenamento: sem como lembrar; a RLS ainda protege o remoto */
  }
}

function browserStorage(): KV | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
