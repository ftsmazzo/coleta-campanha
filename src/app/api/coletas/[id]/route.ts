import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, collections, documentTypes, fieldAnswers } from "@/lib/db/schema";
import { listFieldViews } from "@/lib/extract";
import { nowDate } from "@/lib/paths";
import { computeCollectionProgress } from "@/lib/progress";
import type { DocumentSchema } from "@/lib/schema-types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return NextResponse.json({ error: "Coleta não encontrada." }, { status: 404 });

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, collection.campaignId))
    .limit(1);
  const [docType] = await db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.id, collection.documentTypeId))
    .limit(1);

  const fields = await listFieldViews(id);
  const schema = docType ? (JSON.parse(docType.schemaJson) as DocumentSchema) : { sections: [] };
  const progress = computeCollectionProgress(schema, fields);

  return NextResponse.json({
    collection: {
      ...collection,
      audioParts: collection.audioPartsJson ? JSON.parse(collection.audioPartsJson) : null,
      hasAudio: Boolean(collection.audioPath),
    },
    campaign,
    documentType: docType
      ? { ...docType, schema: JSON.parse(docType.schemaJson) }
      : null,
    fields,
    progress,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return NextResponse.json({ error: "Coleta não encontrada." }, { status: 404 });

  const stamp = nowDate();
  const patch: Partial<typeof collections.$inferInsert> = { updatedAt: stamp };

  if (typeof body.transcript === "string") patch.transcript = body.transcript;
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.status === "string") patch.status = body.status;
  if (body.validated === true) {
    patch.validated = true;
    patch.validatedAt = stamp;
    patch.status = "validado";
  }

  await db.update(collections).set(patch).where(eq(collections.id, id));

  if (Array.isArray(body.fields)) {
    for (const item of body.fields as { id: string; value?: unknown; status?: string }[]) {
      if (!item.id) continue;
      const fieldPatch: { valueJson?: string | null; status: string; updatedAt: Date } = {
        status: item.status ?? "editado",
        updatedAt: stamp,
      };
      if (item.value !== undefined) {
        fieldPatch.valueJson = item.value == null ? null : JSON.stringify(item.value);
      }
      await db.update(fieldAnswers).set(fieldPatch).where(eq(fieldAnswers.id, item.id));
    }
  }

  return NextResponse.json({ ok: true });
}
