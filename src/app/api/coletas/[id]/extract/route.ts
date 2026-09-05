import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, documentTypes } from "@/lib/db/schema";
import { openRouterConfigured } from "@/lib/ai/openrouter";
import { applyExtractionToFields, extractAgainstSchema } from "@/lib/extract";
import { nowDate } from "@/lib/paths";
import type { DocumentSchema } from "@/lib/schema-types";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return NextResponse.json({ error: "Coleta não encontrada." }, { status: 404 });

  const transcript = String(body.transcript ?? collection.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json({ error: "Informe a transcrição/texto para extrair." }, { status: 400 });
  }

  const [docType] = await db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.id, collection.documentTypeId))
    .limit(1);
  if (!docType) return NextResponse.json({ error: "Tipo de documento ausente." }, { status: 404 });

  const schema = JSON.parse(docType.schemaJson) as DocumentSchema;

  await db
    .update(collections)
    .set({ status: "extraindo", transcript, errorMessage: null, updatedAt: nowDate() })
    .where(eq(collections.id, id));

  try {
    const extracted = await extractAgainstSchema({ schema, transcript });
    const fieldsSuggested = await applyExtractionToFields(id, extracted, {
      onlyEmpty: Boolean(body.onlyEmpty),
    });
    await db
      .update(collections)
      .set({
        status: "revisao",
        payloadJson: JSON.stringify(extracted),
        updatedAt: nowDate(),
      })
      .where(eq(collections.id, id));

    return NextResponse.json({
      ok: true,
      fieldsSuggested,
      engine: openRouterConfigured() ? "ai" : "heuristic",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na extração.";
    await db
      .update(collections)
      .set({ status: "erro", errorMessage: message, updatedAt: nowDate() })
      .where(eq(collections.id, id));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
