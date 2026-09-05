import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { isFilled, textToValue } from "@/lib/field-utils";
import {
  isMunicipioBlockFilled,
  parseMunicipioBlocks,
  type MunicipioBlock,
} from "@/lib/municipios";
import { nowDate } from "@/lib/paths";
import type {
  DocumentSchema,
  FieldAnswerValue,
  FieldAnswerView,
  FieldType,
  SchemaField,
} from "@/lib/schema-types";

export type ShareMode = "jornada" | "escolha";

export type JourneyStep = {
  id: string;
  kind: "field" | "municipio";
  fieldAnswerId: string;
  sectionKey: string;
  sectionTitle: string;
  fieldKey: string;
  type: FieldType;
  label: string;
  question: string;
  hint?: string;
  /** Para município: id do bloco ainda aberto. */
  municipioId?: string;
  municipioNome?: string;
};

export function fieldScopeKey(sectionKey: string, fieldKey: string) {
  return `${sectionKey}.${fieldKey}`;
}

export function questionForField(field: SchemaField): string {
  if (field.question?.trim()) return field.question.trim();
  const label = field.label.trim();
  if (label.endsWith("?")) return label;

  if (field.type === "boolean") {
    return `${label} — isso já está pronto / consolidado?`;
  }
  if (field.type === "contact") {
    return `Quem cuida disso hoje: ${label}? (nome, telefone e base)`;
  }
  if (field.type === "contact_list") {
    return `Quem são as pessoas de: ${label}? Liste nome, telefone e base.`;
  }
  if (field.type === "list") {
    return `Pode listar: ${label}?`;
  }
  if (field.type === "municipio_blocks") {
    return `Como está a estrutura neste município?`;
  }
  return `Pode nos contar: ${label}?`;
}

/** Campo já respondido no onboarding geral — coleta indireta não pode alterar. */
export function isFieldLockedForIndirect(value: FieldAnswerView["value"], type: FieldType): boolean {
  if (type === "municipio_blocks") {
    return false;
  }
  return isFilled(value);
}

export function buildOpenJourneySteps(
  schema: DocumentSchema,
  fields: FieldAnswerView[],
  scopeKeys?: string[] | null,
): JourneyStep[] {
  const steps: JourneyStep[] = [];
  const scope = scopeKeys?.length ? new Set(scopeKeys) : null;

  for (const section of schema.sections) {
    for (const field of section.fields) {
      const key = fieldScopeKey(section.key, field.key);
      if (scope && !scope.has(key)) continue;

      const answer = fields.find((f) => f.sectionKey === section.key && f.fieldKey === field.key);
      if (!answer) continue;

      if (field.type === "municipio_blocks") {
        const blocks = parseMunicipioBlocks(answer.value);
        for (const block of blocks) {
          if (isMunicipioBlockFilled(block)) continue;
          steps.push({
            id: `${answer.id}::${block.id}`,
            kind: "municipio",
            fieldAnswerId: answer.id,
            sectionKey: section.key,
            sectionTitle: section.title,
            fieldKey: field.key,
            type: field.type,
            label: field.label,
            question: `Sobre ${block.municipio}/${block.uf || "AP"}: quem é o responsável político e o coordenador? Como classifica a estrutura?`,
            hint: field.hint,
            municipioId: block.id,
            municipioNome: block.municipio,
          });
        }
        continue;
      }

      if (isFieldLockedForIndirect(answer.value, field.type)) continue;

      steps.push({
        id: answer.id,
        kind: "field",
        fieldAnswerId: answer.id,
        sectionKey: section.key,
        sectionTitle: section.title,
        fieldKey: field.key,
        type: field.type,
        label: field.label,
        question: questionForField(field),
        hint: field.hint,
      });
    }
  }

  return steps;
}

export function listSelectableFields(schema: DocumentSchema) {
  return schema.sections.flatMap((section) =>
    section.fields.map((field) => ({
      key: fieldScopeKey(section.key, field.key),
      sectionKey: section.key,
      sectionTitle: section.title,
      fieldKey: field.key,
      label: field.label,
      question: questionForField(field),
      type: field.type,
    })),
  );
}

export async function ensureShareToken(collectionId: string): Promise<string> {
  const [row] = await db.select().from(collections).where(eq(collections.id, collectionId)).limit(1);
  if (!row) throw new Error("Sessão não encontrada.");
  if (row.shareToken) return row.shareToken;

  const token = randomBytes(18).toString("base64url");
  await db
    .update(collections)
    .set({ shareToken: token, updatedAt: nowDate() })
    .where(eq(collections.id, collectionId));
  return token;
}

export function newShareToken() {
  return randomBytes(18).toString("base64url");
}

export function publicShareUrl(token: string) {
  const base = (process.env.APP_URL || "").replace(/\/$/, "") || "";
  return base ? `${base}/r/${token}` : `/r/${token}`;
}

export function parseScopeJson(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.map(String).filter(Boolean);
  } catch {
    return null;
  }
}

export function parseIndirectAnswer(opts: {
  type: FieldType;
  text?: string;
  booleanValue?: boolean;
  contact?: { nome?: string; telefone?: string; base?: string };
  municipioPatch?: Partial<MunicipioBlock>;
}): FieldAnswerValue {
  if (opts.type === "boolean") {
    if (typeof opts.booleanValue === "boolean") return opts.booleanValue;
    return textToValue(String(opts.text ?? ""), "boolean");
  }
  if (opts.type === "contact" && opts.contact) {
    return {
      nome: opts.contact.nome || "",
      telefone: opts.contact.telefone || "",
      base: opts.contact.base || "",
    };
  }
  return textToValue(String(opts.text ?? ""), opts.type);
}

export function mergeMunicipioPatch(
  current: FieldAnswerValue,
  municipioId: string,
  patch: {
    text?: string;
    classificacao?: string;
    responsavelNome?: string;
    responsavelTelefone?: string;
    coordenadorNome?: string;
    coordenadorTelefone?: string;
  },
): { ok: true; value: MunicipioBlock[] } | { ok: false; error: string } {
  const blocks = parseMunicipioBlocks(current);
  const idx = blocks.findIndex((b) => b.id === municipioId);
  if (idx < 0) return { ok: false, error: "Município não encontrado." };
  if (isMunicipioBlockFilled(blocks[idx])) {
    return { ok: false, error: "Este município já foi respondido e está bloqueado." };
  }

  const cur = blocks[idx];
  const next: MunicipioBlock = {
    ...cur,
    classificacao: (patch.classificacao as MunicipioBlock["classificacao"]) || cur.classificacao,
    estruturaLocal: patch.text?.trim() || cur.estruturaLocal,
    responsavelPolitico: {
      ...cur.responsavelPolitico,
      nome: patch.responsavelNome?.trim() || cur.responsavelPolitico.nome,
      telefone: patch.responsavelTelefone?.trim() || cur.responsavelPolitico.telefone,
    },
    coordenadorCampanha: {
      ...cur.coordenadorCampanha,
      nome: patch.coordenadorNome?.trim() || cur.coordenadorCampanha.nome,
      telefone: patch.coordenadorTelefone?.trim() || cur.coordenadorCampanha.telefone,
    },
  };
  blocks[idx] = next;
  return { ok: true, value: blocks };
}
