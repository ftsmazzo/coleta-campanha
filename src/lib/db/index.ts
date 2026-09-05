import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada.");
  }
  return connectionString;
}

const globalForDb = globalThis as unknown as {
  coletaSql?: ReturnType<typeof postgres>;
  coletaDb?: ReturnType<typeof drizzle<typeof schema>>;
};

function getSql() {
  if (!globalForDb.coletaSql) {
    globalForDb.coletaSql = postgres(getConnectionString(), {
      max: 5,
      prepare: false,
    });
  }
  return globalForDb.coletaSql;
}

function getDb() {
  if (!globalForDb.coletaDb) {
    globalForDb.coletaDb = drizzle(getSql(), { schema });
  }
  return globalForDb.coletaDb;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

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

const DDL_MIGRATE = `
  ALTER TABLE collections ADD COLUMN IF NOT EXISTS share_token TEXT;

  CREATE TABLE IF NOT EXISTS field_attachments (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    field_answer_id TEXT NOT NULL REFERENCES field_answers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    file_name TEXT,
    file_path TEXT,
    mime TEXT,
    size_bytes INTEGER,
    contact_json TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'jornada',
    scope_json TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_share_token ON collections(share_token) WHERE share_token IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_field_attachments_field ON field_attachments(field_answer_id);
  CREATE INDEX IF NOT EXISTS idx_share_links_collection ON share_links(collection_id);
`;

let migrated: Promise<void> | null = null;

export async function ensureDb() {
  if (!migrated) {
    migrated = (async () => {
      // Tabelas base primeiro (CREATE IF NOT EXISTS não altera schema antigo).
      await getSql().unsafe(DDL);
      // Depois colunas/tabelas novas — senão índice em share_token quebra o boot.
      await getSql().unsafe(DDL_MIGRATE);
    })();
  }
  await migrated;
}
