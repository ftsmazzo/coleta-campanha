import { isFilled } from "@/lib/field-utils";
import { municipioBlocksProgress, parseMunicipioBlocks } from "@/lib/municipios";
import type { DocumentSchema, FieldAnswerView } from "@/lib/schema-types";

/** Progresso real do onboarding — ignora seed vazio e campos fora do schema. */
export function computeCollectionProgress(schema: DocumentSchema, fields: FieldAnswerView[]) {
  let total = 0;
  let filled = 0;

  for (const section of schema.sections) {
    for (const schemaField of section.fields) {
      const answer = fields.find((f) => f.sectionKey === section.key && f.fieldKey === schemaField.key);
      if (schemaField.type === "municipio_blocks") {
        const prog = municipioBlocksProgress(parseMunicipioBlocks(answer?.value));
        total += Math.max(prog.total, 1);
        filled += prog.filled;
        continue;
      }
      total += 1;
      if (answer && isFilled(answer.value)) filled += 1;
    }
  }

  return {
    total,
    filled,
    missing: Math.max(0, total - filled),
    percent: total ? Math.round((filled / total) * 100) : 0,
  };
}
