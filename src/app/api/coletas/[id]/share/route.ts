import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/lib/db";
import { campaigns, collections, documentTypes } from "@/lib/db/schema";
import { ensureFieldRows, listFieldViews } from "@/lib/extract";
import { computeCollectionProgress } from "@/lib/progress";
import type { DocumentSchema } from "@/lib/schema-types";
import { buildOpenJourneySteps, ensureShareToken, publicShareUrl } from "@/lib/share";
import { ensureSeedData } from "@/lib/seed";

type Params = { params: Promise<{ id: string }> };

/** Garante token e devolve URL pública da coleta indireta. */
export async function POST(_request: Request, { params }: Params) {
  await ensureDb();
  await ensureSeedData();
  const { id } = await params;
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });

  const token = await ensureShareToken(id);
  return NextResponse.json({
    token,
    url: publicShareUrl(token),
  });
}

export async function GET(_request: Request, { params }: Params) {
  await ensureDb();
  const { id } = await params;
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });

  const [docType] = await db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.id, collection.documentTypeId))
    .limit(1);
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, collection.campaignId))
    .limit(1);

  const schema = docType ? (JSON.parse(docType.schemaJson) as DocumentSchema) : { sections: [] };
  await ensureFieldRows(id, schema);
  const fields = await listFieldViews(id);
  const openSteps = buildOpenJourneySteps(schema, fields);
  const progress = computeCollectionProgress(schema, fields);

  return NextResponse.json({
    token: collection.shareToken,
    url: collection.shareToken ? publicShareUrl(collection.shareToken) : null,
    openCount: openSteps.length,
    progress,
    campaignName: campaign?.name ?? null,
  });
}
