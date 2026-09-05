import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { NewCollectionForm } from "@/components/NewCollectionForm";
import { db } from "@/lib/db";
import { campaigns, collections, documentTypes } from "@/lib/db/schema";

type Props = { params: Promise<{ id: string }> };

export default async function CampanhaDetailPage({ params }: Props) {
  const { id } = await params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) notFound();

  const [types, collects] = await Promise.all([
    db.select().from(documentTypes).orderBy(desc(documentTypes.createdAt)),
    db.select().from(collections).where(eq(collections.campaignId, id)).orderBy(desc(collections.createdAt)),
  ]);

  return (
    <div className="rise" style={{ display: "grid", gap: "1.25rem", maxWidth: 920 }}>
      <header>
        <p className="badge">{campaign.state}</p>
        <h1 className="display" style={{ margin: "0.4rem 0", fontSize: "2rem" }}>
          {campaign.name}
        </h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>
          {campaign.candidate} · {campaign.year} · {campaign.office}
        </p>
      </header>

      <NewCollectionForm campaignId={campaign.id} types={types.map((t) => ({ id: t.id, name: t.name }))} />

      <section style={{ display: "grid", gap: "0.6rem" }}>
        <h2 className="display" style={{ margin: 0, fontSize: "1.25rem" }}>
          Coletas
        </h2>
        {collects.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Ainda sem coletas nesta campanha.</p>
        ) : (
          collects.map((c) => (
            <Link
              key={c.id}
              href={`/coletas/${c.id}`}
              className="panel"
              style={{ padding: "0.9rem 1rem", display: "flex", justifyContent: "space-between" }}
            >
              <span>{c.title}</span>
              <span className="badge badge-muted">{c.status}</span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
