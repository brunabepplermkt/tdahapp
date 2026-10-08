/**
 * Postgres de verdade em memória (PGlite) com o que o Supabase fornece: schema `auth`,
 * `auth.uid()` lendo o JWT e os papéis `anon`/`authenticated`. Aplica TODAS as migrations.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

export async function createDb(userIds: string[]): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    ${userIds.map((u) => `insert into auth.users values ('${u}');`).join("\n")}
  `);
  const dir = join(__dirname, "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  // o Supabase concede isto por padrão; a RLS é que protege
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;
  `);
  return db;
}

export async function asUser(db: PGlite, uid: string | null) {
  await db.exec("reset role");
  if (uid) {
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  } else {
    await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  }
}
