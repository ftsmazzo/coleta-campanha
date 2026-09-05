import { documentSchemaSchema, type DocumentSchema } from "@/lib/schema-types";
import { openRouterChat, openRouterConfigured, openRouterModel } from "@/lib/ai/openrouter";

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

/** Heurística: seções em CAPS / títulos e bullets viram campos. */
export function schemaFromTextHeuristic(raw: string, fallbackName = "documento"): DocumentSchema {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const sections: DocumentSchema["sections"] = [];
  let current: DocumentSchema["sections"][number] | null = null;

  const pushField = (label: string) => {
    if (!current) {
      current = {
        key: "geral",
        title: "Geral",
        fields: [],
      };
      sections.push(current);
    }
    const key = slugify(label) || `campo_${current.fields.length + 1}`;
    if (current.fields.some((f) => f.key === key)) return;
    const isContact =
      /nome|telefone|contato|coordenador|quem |responsavel|responsável/i.test(label) &&
      !/lista completa|organograma/i.test(label);
    current.fields.push({
      key,
      label: label.replace(/^[\-☐•\d\.\)\s]+/, "").slice(0, 160),
      type: isContact ? "contact" : label.length > 80 ? "textarea" : "text",
      required: false,
    });
  };

  for (const line of lines) {
    const isHeading =
      (/^[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ0-9][A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ0-9\s\—\-]{8,}$/.test(line) && line.length < 90) ||
      /^#{1,3}\s+/.test(line) ||
      /^(OBJETIVO|CLIENTE|AGENDA|EQUIPES|ESTRUTURA|FORNECEDORES|CONTATOS|OPERAÇÃO|OPERACAO|INFORMAÇÕES|INFORMACOES|FOTOGRAFIA|ONBOARDING|PRIMEIRA|RESULTADO)/i.test(
        line,
      );

    if (isHeading) {
      const title = line.replace(/^#+\s*/, "").slice(0, 120);
      current = {
        key: slugify(title) || `secao_${sections.length + 1}`,
        title,
        fields: [],
      };
      sections.push(current);
      continue;
    }

    if (/^[\-☐•*]/.test(line) || /^\d+[\.\-\)]\s+/.test(line) || /NOME|TELEFONE|ONDE É A BASE/i.test(line)) {
      pushField(line);
    }
  }

  const usable = sections.filter((s) => s.fields.length > 0);
  if (usable.length === 0) {
    return {
      sections: [
        {
          key: slugify(fallbackName) || "geral",
          title: fallbackName,
          fields: [{ key: "conteudo", label: "Conteúdo coletado", type: "textarea", required: true }],
        },
      ],
    };
  }
  return { sections: usable };
}

export async function schemaFromTextWithAi(raw: string): Promise<DocumentSchema | null> {
  if (!openRouterConfigured()) return null;

  const text = await openRouterChat({
    model: openRouterModel("schema"),
    maxTokens: 4096,
    user: `Converta o checklist/roteiro abaixo em um JSON de schema de coleta para campanha eleitoral.

Formato EXATO:
{
  "sections": [
    {
      "key": "snake_case",
      "title": "Título",
      "description": "opcional",
      "fields": [
        {
          "key": "snake_case",
          "label": "Pergunta ou rótulo",
          "type": "text|textarea|list|contact|contact_list|boolean|date|select|municipio_blocks",
          "required": true/false,
          "hint": "opcional"
        }
      ]
    }
  ]
}

Regras:
- Use type "contact" quando pedir NOME/TELEFONE/BASE.
- Use "contact_list" para listas de pessoas.
- Use type "municipio_blocks" quando o texto pedir estrutura por município / território.
- Use "list" para listas de itens sem contato.
- Não invente seções que não existam no texto.
- Responda SOMENTE com JSON válido.

TEXTO:
${raw.slice(0, 14000)}`,
  });

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);
  return documentSchemaSchema.parse(parsed);
}

export async function buildSchemaFromText(raw: string, name?: string): Promise<{
  schema: DocumentSchema;
  engine: "ai" | "heuristic";
}> {
  try {
    const ai = await schemaFromTextWithAi(raw);
    if (ai) return { schema: ai, engine: "ai" };
  } catch (error) {
    console.error("[schema-from-text] ai", error);
  }
  return { schema: schemaFromTextHeuristic(raw, name), engine: "heuristic" };
}
