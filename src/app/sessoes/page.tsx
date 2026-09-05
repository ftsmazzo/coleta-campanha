import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, ensureDb } from "@/lib/db";
import { campaigns, collections, documentTypes, fieldAnswers } from "@/lib/db/schema";
import { ensureSeedData } from "@/lib/seed";

export default async function SessoesPage() {
  await ensureSeedData();
  await ensureDb();

  const rows = await db.select().from(collections).orderBy(desc(collections.createdAt));

  const enriched = await Promise.all(
    rows.map(async (c) => {
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, c.campaignId)).limit(1);
      const [docType] = await db.select().from(documentTypes).where(eq(documentTypes.id, c.documentTypeId)).limit(1);
      const answers = await db.select().from(fieldAnswers).where(eq(fieldAnswers.collectionId, c.id));
      const total = answers.length;
      const filled = answers.filter((a) => {
        if (!a.valueJson || a.valueJson === "null" || a.valueJson === '""') return false;
        try {
          const v = JSON.parse(a.valueJson);
          if (v == null) return false;
          if (typeof v === "string") return v.trim().length > 0;
          if (typeof v === "boolean") return true;
          if (Array.isArray(v)) return v.length > 0;
          if (typeof v === "object") return Object.values(v).some((x) => String(x ?? "").trim());
          return true;
        } catch {
          return a.valueJson.trim().length > 0;
        }
      }).length;
      return {
        ...c,
        campaign,
        docType,
        total,
        filled,
        percent: total ? Math.round((filled / total) * 100) : 0,
      };
    }),
  );

  return (
    <div className="rise" style={{ display: "grid", gap: "1.25rem", maxWidth: 980 }}>
      <header>
        <h1 className="display" style={{ margin: "0 0 0.35rem", fontSize: "2rem" }}>
          Sessões
        </h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>
          Cada sessão é um documento tipado em andamento — preencha, grave ou complete com IA.
        </p>
      </header>

      {enriched.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Nenhuma sessão ainda. Crie uma coleta a partir de uma campanha.</p>
      ) : (
        <div className="sessao-list">
          {enriched.map((c) => (
            <Link key={c.id} href={`/coletas/${c.id}`} className="panel sessao-item">
              <div className="sessao-item-top">
                <div>
                  <strong>{c.title}</strong>
                  <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginTop: 4 }}>
                    {c.campaign ? `${c.campaign.state} · ${c.campaign.candidate} · ${c.campaign.year}` : "campanha"}
                    {c.docType ? ` · ${c.docType.name}` : ""}
                  </div>
                </div>
                <span className={c.validated ? "badge" : "badge badge-muted"}>
                  {c.percent}% · {c.status}
                </span>
              </div>
              <div className="mini-bar">
                <i style={{ width: `${c.percent}%` }} />
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                {c.filled}/{c.total} campos · {c.total - c.filled} lacunas
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
