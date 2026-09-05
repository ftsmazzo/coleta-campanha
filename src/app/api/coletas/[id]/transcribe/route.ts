import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, documentTypes } from "@/lib/db/schema";
import { applyExtractionToFields, extractAgainstSchema } from "@/lib/extract";
import { nowDate } from "@/lib/paths";
import type { DocumentSchema } from "@/lib/schema-types";
import { transcribeAudioParts } from "@/lib/stt";

type Params = { params: Promise<{ id: string }> };

/** Reprocessa áudio já salvo na sessão: STT + IA nas lacunas. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return NextResponse.json({ error: "Coleta não encontrada." }, { status: 404 });
  if (!collection.audioPath) {
    return NextResponse.json({ error: "Esta sessão ainda não tem áudio salvo." }, { status: 400 });
  }

  const parts = collection.audioPartsJson
    ? (JSON.parse(collection.audioPartsJson) as { partPaths?: string[] })
    : {};
  const partPaths = Array.isArray(parts.partPaths) ? parts.partPaths : [];

  try {
    await db
      .update(collections)
      .set({ status: "transcrevendo", errorMessage: null, updatedAt: nowDate() })
      .where(eq(collections.id, id));

    const { transcript, engine: sttEngine } = await transcribeAudioParts({
      partPaths,
      fallbackPath: collection.audioPath,
      mime: collection.audioMime,
    });

    await db
      .update(collections)
      .set({ transcript, status: "extraindo", updatedAt: nowDate() })
      .where(eq(collections.id, id));

    const [docType] = await db
      .select()
      .from(documentTypes)
      .where(eq(documentTypes.id, collection.documentTypeId))
      .limit(1);

    let fieldsSuggested = 0;
    if (docType) {
      const schema = JSON.parse(docType.schemaJson) as DocumentSchema;
      const extracted = await extractAgainstSchema({ schema, transcript });
      fieldsSuggested = await applyExtractionToFields(id, extracted, { onlyEmpty: true });
    }

    await db
      .update(collections)
      .set({ status: "revisao", updatedAt: nowDate() })
      .where(eq(collections.id, id));

    return NextResponse.json({
      ok: true,
      transcript,
      fieldsSuggested,
      sttEngine,
      note:
        fieldsSuggested > 0
          ? `Transcrição ok — IA sugeriu ${fieldsSuggested} campo(s).`
          : "Transcrição ok. Sem evidência explícita para preencher automaticamente.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no STT.";
    await db
      .update(collections)
      .set({ status: "erro", errorMessage: message, updatedAt: nowDate() })
      .where(eq(collections.id, id));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
