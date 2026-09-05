import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { campaigns, collections, documentTypes } from "@/lib/db/schema";
import { ensureFieldRows } from "@/lib/extract";
import { nowDate } from "@/lib/paths";
import type { DocumentSchema } from "@/lib/schema-types";
import { ensureSeedData } from "@/lib/seed";

export async function GET(request: Request) {
  await ensureSeedData();
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");

  const rows = campaignId
    ? await db
        .select()
        .from(collections)
        .where(eq(collections.campaignId, campaignId))
        .orderBy(desc(collections.createdAt))
    : await db.select().from(collections).orderBy(desc(collections.createdAt));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const campaignId = String(body.campaignId ?? "");
  const documentTypeId = String(body.documentTypeId ?? "");
  if (!campaignId || !documentTypeId) {
    return NextResponse.json({ error: "campaignId e documentTypeId são obrigatórios." }, { status: 400 });
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  const [docType] = await db.select().from(documentTypes).where(eq(documentTypes.id, documentTypeId)).limit(1);
  if (!campaign || !docType) {
    return NextResponse.json({ error: "Campanha ou tipo não encontrado." }, { status: 404 });
  }

  const stamp = nowDate();
  const row = {
    id: uuid(),
    campaignId,
    documentTypeId,
    title: String(body.title ?? "").trim() || `${docType.name} — ${campaign.name}`,
    sourceKind: String(body.sourceKind ?? "texto"),
    status: "rascunho",
    audioPath: null as string | null,
    audioMime: null as string | null,
    audioPartsJson: null as string | null,
    transcript: body.transcript ? String(body.transcript) : null,
    payloadJson: null as string | null,
    errorMessage: null as string | null,
    validated: false,
    validatedAt: null as Date | null,
    createdAt: stamp,
    updatedAt: stamp,
  };

  await db.insert(collections).values(row);
  const schema = JSON.parse(docType.schemaJson) as DocumentSchema;
  await ensureFieldRows(row.id, schema);

  return NextResponse.json(row, { status: 201 });
}
