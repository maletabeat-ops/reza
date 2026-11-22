// Database access. Production: Postgres through DATABASE_URL (Neon, Supabase, Render…).
// Development without DATABASE_URL: an embedded Postgres (PGlite) stored in ./.data.
import postgres from "postgres";

let run; // (text, params) => Promise<rows>

export async function initDb() {
  if (process.env.DATABASE_URL) {
    const sql = postgres(process.env.DATABASE_URL, {
      ssl: process.env.PGSSL === "disable" ? false : "require",
      max: 5,
      onnotice: () => {},
    });
    run = (text, params = []) => sql.unsafe(text, params);
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite(process.env.PGLITE_DIR || "./.data/pg");
    run = async (text, params = []) => (await db.query(text, params)).rows;
    console.warn("[db] DATABASE_URL is not set: using the embedded development database in ./.data");
  }
  await migrate();
}

export const q = (text, params) => run(text, params);

async function migrate() {
  const steps = [
    `create table if not exists users (
       id text primary key,
       email text unique not null,
       name text not null,
       pass text not null,
       created_at timestamptz not null default now())`,
    `create table if not exists businesses (
       id text primary key,
       user_id text not null references users(id) on delete cascade,
       slug text unique not null,
       sphere text not null,
       locale text not null,
       doc jsonb not null,
       ver integer not null default 0,
       published boolean not null default true,
       tg_owner_chat bigint,
       tg_code text,
       updated_at timestamptz not null default now())`,
    `create index if not exists businesses_user_idx on businesses(user_id)`,
    `create table if not exists tg_chats (
       chat_id bigint primary key,
       business_id text not null references businesses(id) on delete cascade,
       client_name text,
       updated_at timestamptz not null default now())`,
  ];
  for (const s of steps) await run(s);
}

export async function getBusiness(where, value) {
  const col = { id: "id", user: "user_id", slug: "slug", code: "tg_code", owner: "tg_owner_chat" }[where];
  const rows = await q(`select * from businesses where ${col} = $1 limit 1`, [value]);
  return rows[0] || null;
}

// Read-modify-write of a business document with optimistic locking (ver column).
export async function updateDoc(businessId, mutate) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await getBusiness("id", businessId);
    if (!row) throw new Error("business not found");
    const doc = structuredClone(row.doc);
    const result = await mutate(doc, row);
    const upd = await q(
      `update businesses set doc = $2::jsonb, ver = ver + 1, updated_at = now() where id = $1 and ver = $3 returning ver`,
      [businessId, JSON.stringify(doc), row.ver],
    );
    if (upd.length) return { doc, ver: upd[0].ver, result, row };
  }
  throw new Error("could not save: too many concurrent updates");
}
