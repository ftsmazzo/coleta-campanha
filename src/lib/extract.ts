import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { openRouterChat, openRouterConfigured, openRouterModel } from "@/lib/ai/openrouter";
import { db } from "@/lib/db";
import { fieldAnswers } from "@/lib/db/schema";
import { nowDate } from "@/lib/paths";
import type { DocumentSchema, FieldAnswerValue } from "@/lib/schema-types";

function emptyAnswers(collectionId: string, schema: DocumentSchema) {
  const stamp = nowDate();
  return schema.sections.flatMap((section) =>
    section.fields.map((field) => ({
      id: uuid(),
      collectionId,
      sectionKey: section.key,
      fieldKey: field.key,
      label: field.label,
      valueJson: null as string | null,
      confidence: null as string | null,
      evidence: null as string | null,
      status: "vazio",
      updatedAt: stamp,
    })),
  );
}

export async function ensureFieldRows(collectionId: string, schema: DocumentSchema) {
  const existing = await db
    .select({ id: fieldAnswers.id })
    .from(fieldAnswers)
    .where(eq(fieldAnswers.collectionId, collectionId));
  if (existing.length) return;
  const rows = emptyAnswers(collectionId, schema);
  if (rows.length) await db.insert(fieldAnswers).values(rows);
}

function parseMaybeJson(raw: string | null): FieldAnswerValue {
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw) as FieldAnswerValue;
  } catch {
    return raw;
  }
}

export async function listFieldViews(collectionId: string) {
  const rows = await db.select().from(fieldAnswers).where(eq(fieldAnswers.collectionId, collectionId));
  return rows.map((row) => ({
    id: row.id,
    sectionKey: row.sectionKey,
    fieldKey: row.fieldKey,
    label: row.label,
    value: parseMaybeJson(row.valueJson),
    confidence: (row.confidence as "alta" | "media" | "baixa" | null) ?? null,
    evidence: row.evidence,
    status: row.status as "vazio" | "sugerido" | "aceito" | "editado" | "pendente",
  }));
}

type ExtractedMap = Record<
  string,
  Record<
    string,
    {
      value?: FieldAnswerValue;
      confianca?: string;
      evidencia?: string;
    }
  >
>;

export async function applyExtractionToFields(
  collectionId: string,
  extracted: ExtractedMap,
  opts?: { onlyEmpty?: boolean },
) {
  const rows = await db.select().from(fieldAnswers).where(eq(fieldAnswers.collectionId, collectionId));
  const stamp = nowDate();
  let applied = 0;

  for (const row of rows) {
    const hit = extracted[row.sectionKey]?.[row.fieldKey];
    if (!hit || hit.value == null || hit.value === "") continue;

    if (opts?.onlyEmpty) {
      const current =
        row.valueJson == null || row.valueJson === "" || row.valueJson === "null"
          ? null
          : (() => {
              try {
                return JSON.parse(row.valueJson);
              } catch {
                return row.valueJson;
              }
            })();
      const occupied =
        current != null &&
        !(typeof current === "string" && !current.trim()) &&
        !(Array.isArray(current) && current.length === 0) &&
        !(typeof current === "object" && !Array.isArray(current) && !Object.values(current).some((v) => String(v ?? "").trim()));
      if (occupied || (row.status !== "vazio" && row.status !== "sugerido" && row.valueJson)) {
        // keep human edits; still allow overwrite of empty suggested blanks
        if (row.status === "editado" || row.status === "aceito") continue;
        if (occupied) continue;
      }
    }

    await db
      .update(fieldAnswers)
      .set({
        valueJson: JSON.stringify(hit.value),
        confidence: hit.confianca ?? "media",
        evidence: hit.evidencia ?? null,
        status: "sugerido",
        updatedAt: stamp,
      })
      .where(eq(fieldAnswers.id, row.id));
    applied += 1;
  }

  return applied;
}

export async function extractAgainstSchema(opts: {
  schema: DocumentSchema;
  transcript: string;
}): Promise<ExtractedMap> {
  if (!openRouterConfigured()) {
    return extractHeuristic(opts.schema, opts.transcript);
  }

  const compactSchema = opts.schema.sections.map((s) => ({
    key: s.key,
    title: s.title,
    fields: s.fields.map((f) => ({ key: f.key, label: f.label, type: f.type })),
  }));

  const text = await openRouterChat({
    model: openRouterModel("extract"),
    maxTokens: 8192,
    user: `Extraia dados de campanha da transcrição/texto abaixo, preenchendo SOMENTE campos com evidência explícita.

SCHEMA:
${JSON.stringify(compactSchema)}

Responda SOMENTE JSON no formato:
{
  "section_key": {
    "field_key": {
      "value": "... ou objeto {nome,telefone,base} ou array",
      "confianca": "alta|media|baixa",
      "evidencia": "trecho curto <= 12 palavras"
    }
  }
}

Regras:
- Não invente nomes, telefones ou fatos.
- Campos sem evidência: omita.
- contact → { "nome", "telefone", "base" } quando possível.
- contact_list → array desses objetos.
- list → array de strings.

TEXTO:
${opts.transcript.slice(0, 20000)}`,
  });

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  return JSON.parse(match[0]) as ExtractedMap;
}

function extractHeuristic(schema: DocumentSchema, transcript: string): ExtractedMap {
  const out: ExtractedMap = {};
  const lower = transcript.toLowerCase();

  for (const section of schema.sections) {
    for (const field of section.fields) {
      const needles = field.label
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .slice(0, 3);
      if (!needles.length) continue;
      const hit = needles.some((n) => lower.includes(n));
      if (!hit) continue;
      const idx = lower.indexOf(needles[0]);
      const snippet = transcript.slice(Math.max(0, idx), Math.max(0, idx) + 180).trim();
      if (!snippet) continue;
      out[section.key] ??= {};
      out[section.key][field.key] = {
        value: field.type === "contact" ? { nome: "", telefone: "", base: "", nota: snippet } : snippet,
        confianca: "baixa",
        evidencia: "heurística — validar",
      };
    }
  }
  return out;
}
