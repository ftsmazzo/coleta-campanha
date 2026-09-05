import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não configurada.");
}

const globalForDb = globalThis as unknown as {
  coletaSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.coletaSql ??
  postgres(connectionString, {
    max: 5,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.coletaSql = sql;
}

export const db = drizzle(sql, { schema });
export type Db = typeof db;

const DDL = `
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    state TEXT NOT NULL,
    candidate TEXT NOT NULL,
    year INTEGER NOT NULL,
    office TEXT NOT NULL DEFAULT 'governador',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS document_types (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    schema_json TEXT NOT NULL,
    source_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    document_type_id TEXT NOT NULL REFERENCES document_types(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'texto',
    status TEXT NOT NULL DEFAULT 'rascunho',
    audio_path TEXT,
    audio_mime TEXT,
    audio_parts_json TEXT,
    transcript TEXT,
    payload_json TEXT,
    error_message TEXT,
    validated BOOLEAN NOT NULL DEFAULT FALSE,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS field_answers (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    section_key TEXT NOT NULL,
    field_key TEXT NOT NULL,
    label TEXT NOT NULL,
    value_json TEXT,
    confidence TEXT,
    evidence TEXT,
    status TEXT NOT NULL DEFAULT 'vazio',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_collections_campaign ON collections(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_field_answers_collection ON field_answers(collection_id);
`;

let migrated: Promise<void> | null = null;

export async function ensureDb() {
  if (!migrated) {
    migrated = (async () => {
      await sql.unsafe(DDL);
    })();
  }
  await migrated;
}
