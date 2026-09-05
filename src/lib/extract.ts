import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { openRouterChat, openRouterConfigured, openRouterModel } from "@/lib/ai/openrouter";
import { db } from "@/lib/db";
import { fieldAnswers } from "@/lib/db/schema";
import {
  emptyMunicipioBlock,
  isPessoaFilled,
  parseMunicipioBlocks,
  seedAmapaMunicipioBlocks,
} from "@/lib/municipios";
import { nowDate } from "@/lib/paths";
import type { DocumentSchema, FieldAnswerValue, SchemaField } from "@/lib/schema-types";

function defaultValueForField(field: SchemaField): string | null {
  if (field.type === "municipio_blocks") {
    const uf = (field.defaultUf || "AP").toUpperCase();
    const blocks =
      uf === "AP"
        ? seedAmapaMunicipioBlocks()
        : [];
    return JSON.stringify(blocks);
  }
  return null;
}

function emptyAnswers(collectionId: string, schema: DocumentSchema) {
  const stamp = nowDate();
  return schema.sections.flatMap((section) =>
    section.fields.map((field) => ({
      id: uuid(),
      collectionId,
      sectionKey: section.key,
      fieldKey: field.key,
      label: field.label,
      valueJson: defaultValueForField(field),
      confidence: null as string | null,
      evidence: null as string | null,
      status: "vazio",
      updatedAt: stamp,
    })),
  );
}

/** Cria campos faltantes conforme o schema atual (permite evoluir tipo de documento). */
export async function ensureFieldRows(collectionId: string, schema: DocumentSchema) {
  const existing = await db.select().from(fieldAnswers).where(eq(fieldAnswers.collectionId, collectionId));
  const existingKeys = new Set(existing.map((r) => `${r.sectionKey}::${r.fieldKey}`));
  const stamp = nowDate();
  const toInsert = [];

  for (const section of schema.sections) {
    for (const field of section.fields) {
      const key = `${section.key}::${field.key}`;
      if (existingKeys.has(key)) {
        const row = existing.find((r) => r.sectionKey === section.key && r.fieldKey === field.key);
        if (
          row &&
          field.type === "municipio_blocks" &&
          (!row.valueJson || row.valueJson === "null" || row.valueJson === "[]")
        ) {
          await db
            .update(fieldAnswers)
            .set({
              valueJson: defaultValueForField(field),
              label: field.label,
              updatedAt: stamp,
            })
            .where(eq(fieldAnswers.id, row.id));
        }
        continue;
      }
      toInsert.push({
        id: uuid(),
        collectionId,
        sectionKey: section.key,
        fieldKey: field.key,
        label: field.label,
        valueJson: defaultValueForField(field),
        confidence: null as string | null,
        evidence: null as string | null,
        status: "vazio",
        updatedAt: stamp,
      });
    }
  }

  if (toInsert.length) await db.insert(fieldAnswers).values(toInsert);
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

    // Merge especial para municipio_blocks: atualiza por nome de município
    if (Array.isArray(hit.value) && hit.value.some((v) => v && typeof v === "object" && "municipio" in (v as object))) {
      const current = parseMaybeJson(row.valueJson);
      const merged = mergeMunicipioBlocks(current, hit.value);
      if (opts?.onlyEmpty && row.status === "editado") {
        // ainda permite merge em lacunas internas
      }
      await db
        .update(fieldAnswers)
        .set({
          valueJson: JSON.stringify(merged),
          confidence: hit.confianca ?? "media",
          evidence: hit.evidencia ?? null,
          status: row.status === "editado" ? "editado" : "sugerido",
          updatedAt: stamp,
        })
        .where(eq(fieldAnswers.id, row.id));
      applied += 1;
      continue;
    }

    if (opts?.onlyEmpty) {
      const current = parseMaybeJson(row.valueJson);
      const occupied =
        current != null &&
        !(typeof current === "string" && !current.trim()) &&
        !(Array.isArray(current) && current.length === 0) &&
        !(
          typeof current === "object" &&
          !Array.isArray(current) &&
          !Object.values(current as object).some((v) => String(v ?? "").trim())
        );
      if (row.status === "editado" || row.status === "aceito") continue;
      if (occupied) continue;
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

function mergeMunicipioBlocks(current: FieldAnswerValue, incoming: unknown): unknown[] {
  const base = parseMunicipioBlocks(current);
  const updates = parseMunicipioBlocks(incoming);

  for (const upd of updates) {
    const idx = base.findIndex((b) => b.municipio.toLowerCase() === upd.municipio.toLowerCase());
    if (idx < 0) {
      base.push(emptyMunicipioBlock(upd));
      continue;
    }
    const cur = base[idx];
    base[idx] = {
      ...cur,
      classificacao: upd.classificacao || cur.classificacao,
      estruturaLocal: upd.estruturaLocal || cur.estruturaLocal,
      aliados: upd.aliados || cur.aliados,
      capacidadeMobilizacao: upd.capacidadeMobilizacao || cur.capacidadeMobilizacao,
      agendaPactuada: upd.agendaPactuada || cur.agendaPactuada,
      situacaoEleitoral: upd.situacaoEleitoral || cur.situacaoEleitoral,
      necessidades: upd.necessidades || cur.necessidades,
      responsavelPolitico: isPessoaFilled(upd.responsavelPolitico)
        ? upd.responsavelPolitico
        : cur.responsavelPolitico,
      coordenadorCampanha: isPessoaFilled(upd.coordenadorCampanha)
        ? upd.coordenadorCampanha
        : cur.coordenadorCampanha,
      ibge: upd.ibge || cur.ibge,
      uf: upd.uf || cur.uf,
    };
  }
  return base;
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
    fields: s.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      defaultUf: f.defaultUf,
    })),
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
      "value": "...",
      "confianca": "alta|media|baixa",
      "evidencia": "trecho curto <= 12 palavras"
    }
  }
}

Regras:
- Não invente nomes, telefones ou fatos.
- Campos sem evidência: omita.
- contact → { "nome", "telefone", "base" }.
- contact_list → array desses objetos.
- list → array de strings.
- municipio_blocks → array de objetos, UM POR MUNICÍPIO mencionado:
  {
    "municipio": "Macapá",
    "uf": "AP",
    "responsavelPolitico": { "nome", "telefone", "base" },
    "coordenadorCampanha": { "nome", "telefone", "base" },
    "estruturaLocal": "",
    "aliados": "",
    "capacidadeMobilizacao": "",
    "agendaPactuada": "",
    "situacaoEleitoral": "",
    "necessidades": "",
    "classificacao": "estruturada|em_implantacao|fragil|sem_estrutura"
  }
  Separe municípios distintos. Nunca junte várias cidades num único texto.

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
