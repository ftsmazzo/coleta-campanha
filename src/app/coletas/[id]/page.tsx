import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CollectionWorkspace } from "@/components/CollectionWorkspace";
import { db } from "@/lib/db";
import { campaigns, collections, documentTypes } from "@/lib/db/schema";
import { ensureFieldRows, listFieldViews } from "@/lib/extract";
import type { DocumentSchema } from "@/lib/schema-types";
import { ensureSeedData } from "@/lib/seed";

type Props = { params: Promise<{ id: string }> };

export default async function ColetaPage({ params }: Props) {
  const { id } = await params;
  await ensureSeedData();
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) notFound();

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
  if (!docType) notFound();

  const schema = JSON.parse(docType.schemaJson) as DocumentSchema;
  await ensureFieldRows(id, schema);
  const fields = await listFieldViews(id);
  const audioParts = collection.audioPartsJson ? JSON.parse(collection.audioPartsJson) : null;

  return (
    <div className="rise" style={{ display: "grid", gap: "1rem", maxWidth: 1100 }}>
      <header>
        <p className="badge">{campaign ? `${campaign.state} · ${campaign.year}` : "campanha"}</p>
        <h1 className="display" style={{ margin: "0.35rem 0", fontSize: "clamp(1.6rem, 3vw, 2.2rem)" }}>
          {collection.title}
        </h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>
          Sessão · {docType.name}
          {campaign ? ` · ${campaign.candidate}` : ""}
        </p>
        {collection.errorMessage ? (
          <p style={{ color: "var(--danger)", marginTop: 8 }}>{collection.errorMessage}</p>
        ) : null}
      </header>

      <CollectionWorkspace
        collectionId={collection.id}
        initialTranscript={collection.transcript}
        initialFields={fields}
        schema={schema}
        audioParts={audioParts}
        status={collection.status}
      />
    </div>
  );
}
