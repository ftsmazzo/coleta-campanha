import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Campanha eleitoral — escopo raiz de toda coleta. */
export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  candidate: text("candidate").notNull(),
  year: integer("year").notNull(),
  office: text("office").notNull().default("governador"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Tipo de documento cadastrado (ex.: onboarding_campanha).
 * `schemaJson` descreve seções e campos para coleta/extração.
 */
export const documentTypes = pgTable("document_types", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  version: integer("version").notNull().default(1),
  schemaJson: text("schema_json").notNull(),
  sourceText: text("source_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Uma rodada de coleta (áudio, texto colado ou upload). */
export const collections = pgTable("collections", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  documentTypeId: text("document_type_id")
    .notNull()
    .references(() => documentTypes.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  sourceKind: text("source_kind").notNull().default("texto"),
  status: text("status").notNull().default("rascunho"),
  audioPath: text("audio_path"),
  audioMime: text("audio_mime"),
  audioPartsJson: text("audio_parts_json"),
  transcript: text("transcript"),
  payloadJson: text("payload_json"),
  errorMessage: text("error_message"),
  validated: boolean("validated").notNull().default(false),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  /** Token público para coleta indireta (Typeform / link compartilhado). */
  shareToken: text("share_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Respostas materializadas por campo — facilita UI de revisão e % completo.
 */
export const fieldAnswers = pgTable("field_answers", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  sectionKey: text("section_key").notNull(),
  fieldKey: text("field_key").notNull(),
  label: text("label").notNull(),
  valueJson: text("value_json"),
  confidence: text("confidence"),
  evidence: text("evidence"),
  status: text("status").notNull().default("vazio"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Anexos por campo (coleta indireta): documento ou contato. */
export const fieldAttachments = pgTable("field_attachments", {
  id: text("id").primaryKey(),
  collectionId: text("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  fieldAnswerId: text("field_answer_id")
    .notNull()
    .references(() => fieldAnswers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // documento | contato
  fileName: text("file_name"),
  filePath: text("file_path"),
  mime: text("mime"),
  sizeBytes: integer("size_bytes"),
  contactJson: text("contact_json"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
