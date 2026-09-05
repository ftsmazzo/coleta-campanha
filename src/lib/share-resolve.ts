import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, collections, documentTypes, shareLinks } from "@/lib/db/schema";
import { ensureFieldRows, listFieldViews } from "@/lib/extract";
import type { DocumentSchema } from "@/lib/schema-types";
import { parseScopeJson, type ShareMode } from "@/lib/share";

export type ShareContext = {
  collection: typeof collections.$inferSelect;
  schema: DocumentSchema;
  fields: Awaited<ReturnType<typeof listFieldViews>>;
  campaign: typeof campaigns.$inferSelect | null;
  mode: ShareMode;
  scope: string[] | null;
  linkTitle: string | null;
};

/** Resolve token em share_links (novo) ou collections.share_token (legado). */
export async function resolveShareContext(token: string): Promise<ShareContext | null> {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);

  let collection: typeof collections.$inferSelect | undefined;
  let mode: ShareMode = "jornada";
  let scope: string[] | null = null;
  let linkTitle: string | null = null;

  if (link) {
    const [row] = await db.select().from(collections).where(eq(collections.id, link.collectionId)).limit(1);
    collection = row;
    mode = link.mode === "escolha" ? "escolha" : "jornada";
    scope = parseScopeJson(link.scopeJson);
    linkTitle = link.title;
  } else {
    const [row] = await db.select().from(collections).where(eq(collections.shareToken, token)).limit(1);
    collection = row;
  }

  if (!collection) return null;

  const [docType] = await db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.id, collection.documentTypeId))
    .limit(1);
  if (!docType) return null;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, collection.campaignId))
    .limit(1);

  const schema = JSON.parse(docType.schemaJson) as DocumentSchema;
  await ensureFieldRows(collection.id, schema);
  const fields = await listFieldViews(collection.id);

  return {
    collection,
    schema,
    fields,
    campaign: campaign ?? null,
    mode,
    scope,
    linkTitle,
  };
}
