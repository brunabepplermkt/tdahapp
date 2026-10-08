/**
 * Configuração do Supabase (somente chave PÚBLICA/anon, nunca service role).
 * Sem variáveis → o app roda 100% local, como sempre.
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** A chave service_role ignora a RLS: se alguém colar uma por engano, recusamos. */
export function looksLikeServiceRole(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const part = key.split(".")[1];
  if (!part) return false;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string };
    return json.role === "service_role";
  } catch {
    return false;
  }
}

export function readSupabaseConfig(
  env: { url?: string; anonKey?: string } = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
): SupabaseConfig | null {
  const url = env.url?.trim();
  const anonKey = env.anonKey?.trim();
  if (!url || !anonKey) return null;
  try {
    const u = new URL(url);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !local) return null;
  } catch {
    return null;
  }
  if (looksLikeServiceRole(anonKey)) {
    console.error("[leve] Chave service_role detectada no cliente — ignorada. Use apenas a anon key.");
    return null;
  }
  return { url, anonKey };
}
