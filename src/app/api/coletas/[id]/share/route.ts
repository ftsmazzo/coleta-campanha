import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, ensureDb } from "@/lib/db";
import { collections, documentTypes, shareLinks } from "@/lib/db/schema";
import { ensureFieldRows, listFieldViews } from "@/lib/extract";
import { computeCollectionProgress } from "@/lib/progress";
import type { DocumentSchema } from "@/lib/schema-types";
import {
  buildOpenJourneySteps,
  listSelectableFields,
  newShareToken,
  parseScopeJson,
  publicAppBaseUrl,
  publicShareUrl,
  type ShareMode,
} from "@/lib/share";
import { ensureSeedData } from "@/lib/seed";
import { nowDate } from "@/lib/paths";

type Params = { params: Promise<{ id: string }> };

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
  const schema = docType ? (JSON.parse(docType.schemaJson) as DocumentSchema) : { sections: [] };
  await ensureFieldRows(id, schema);
  const fields = await listFieldViews(id);
  const openSteps = buildOpenJourneySteps(schema, fields);
  const progress = computeCollectionProgress(schema, fields);
  const selectable = listSelectableFields(schema);

  const links = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.collectionId, id))
    .orderBy(desc(shareLinks.createdAt));

  return NextResponse.json({
    openCount: openSteps.length,
    progress,
    selectable,
    baseUrl: publicAppBaseUrl(),
    links: links.map((l) => ({
      id: l.id,
      title: l.title,
      mode: l.mode,
      scope: parseScopeJson(l.scopeJson) || [],
      token: l.token,
      url: publicShareUrl(l.token),
      createdAt: l.createdAt,
    })),
    legacyUrl: collection.shareToken ? publicShareUrl(collection.shareToken) : null,
  });
}

/** Cria um link por situação: modo + escopo de perguntas. */
export async function POST(request: Request, { params }: Params) {
  await ensureDb();
  await ensureSeedData();
  const { id } = await params;
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const mode: ShareMode = body.mode === "escolha" ? "escolha" : "jornada";
  const title = String(body.title || "").trim() || (mode === "escolha" ? "Escolher perguntas" : "Jornada completa");
  const scope = Array.isArray(body.scope)
    ? body.scope.map(String).filter(Boolean)
    : [];

  const token = newShareToken();
  const linkId = uuid();
  await db.insert(shareLinks).values({
    id: linkId,
    collectionId: id,
    token,
    title,
    mode,
    scopeJson: scope.length ? JSON.stringify(scope) : null,
    createdAt: nowDate(),
  });

  return NextResponse.json({
    id: linkId,
    token,
    title,
    mode,
    scope,
    url: publicShareUrl(token),
  });
}
