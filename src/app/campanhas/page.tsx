import Link from "next/link";
import { desc } from "drizzle-orm";
import { NewCampaignForm } from "@/components/NewCampaignForm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { ensureSeedData } from "@/lib/seed";

export default async function CampanhasPage() {
  await ensureSeedData();
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));

  return (
    <div className="rise" style={{ display: "grid", gap: "1.25rem", maxWidth: 900 }}>
      <header>
        <h1 className="display" style={{ margin: "0 0 0.35rem", fontSize: "2rem" }}>
          Campanhas
        </h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>Escopo: UF · candidato · ano · cargo</p>
      </header>

      <NewCampaignForm />

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.55rem" }}>
        {rows.map((c) => (
          <li key={c.id} className="panel" style={{ padding: "1rem 1.1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <strong>{c.name}</strong>
                <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginTop: 4 }}>
                  {c.state} · {c.candidate} · {c.year} · {c.office}
                </div>
              </div>
              <Link className="btn btn-secondary" href={`/campanhas/${c.id}`}>
                Abrir
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
