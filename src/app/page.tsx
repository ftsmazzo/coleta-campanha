import Link from "next/link";
import { desc } from "drizzle-orm";
import { startOnboardingCollection } from "@/app/actions";
import { db } from "@/lib/db";
import { campaigns, collections, documentTypes } from "@/lib/db/schema";
import { ensureSeedData } from "@/lib/seed";

export default async function HomePage() {
  await ensureSeedData();
  const [campaignList, typeList, collectionList] = await Promise.all([
    db.select().from(campaigns).orderBy(desc(campaigns.createdAt)),
    db.select().from(documentTypes).orderBy(desc(documentTypes.createdAt)),
    db.select().from(collections).orderBy(desc(collections.createdAt)).limit(8),
  ]);

  const ap = campaignList.find((c) => c.state === "AP");
  const onboarding = typeList.find((t) => t.slug === "onboarding_campanha");

  return (
    <div className="rise" style={{ display: "grid", gap: "1.5rem", maxWidth: 980 }}>
      <header style={{ display: "grid", gap: "0.65rem" }}>
        <p className="badge">Coleta Campanha</p>
        <h1 className="display" style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3rem)", letterSpacing: "-0.03em" }}>
          Estruture a operação antes de improvisar a sala.
        </h1>
        <p style={{ margin: 0, maxWidth: 620, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          Cole um checklist, grave ou envie áudio longo, revise campo a campo. Campanha, UF, candidato, ano e tipo de
          documento ficam no centro — pronto para entrar na Inteligência Eleitoral depois.
        </p>
      </header>

      <section className="panel" style={{ padding: "1.25rem 1.35rem", display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <Link className="btn btn-primary" href="/tipos/novo">
            Colar checklist → tipo
          </Link>
          {ap && onboarding ? (
            <form
              action={async () => {
                "use server";
                await startOnboardingCollection(ap.id, onboarding.id);
              }}
            >
              <button className="btn btn-secondary" type="submit">
                Nova coleta · Onboarding AP
              </button>
            </form>
          ) : (
            <Link className="btn btn-secondary" href="/campanhas">
              Ver campanhas
            </Link>
          )}
        </div>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--ink-soft)" }}>
          Seed pronto: <strong>Campanha Amapá 2026</strong> + tipo <strong>onboarding_campanha</strong> com papéis
          operacionais e seções do briefing.
        </p>
      </section>

      <section style={{ display: "grid", gap: "0.85rem" }}>
        <h2 className="display" style={{ margin: 0, fontSize: "1.35rem" }}>
          Coletas recentes
        </h2>
        {collectionList.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Nenhuma coleta ainda. Comece pelo onboarding do Amapá.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.55rem" }}>
            {collectionList.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/coletas/${c.id}`}
                  className="panel"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    padding: "0.9rem 1rem",
                    alignItems: "center",
                  }}
                >
                  <span>
                    <strong>{c.title}</strong>
                    <br />
                    <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>{c.sourceKind}</span>
                  </span>
                  <span className={c.status === "validado" ? "badge" : "badge badge-muted"}>{c.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "0.75rem" }}>
        <Stat label="Campanhas" value={String(campaignList.length)} />
        <Stat label="Tipos" value={String(typeList.length)} />
        <Stat label="Coletas" value={String(collectionList.length)} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel" style={{ padding: "1rem 1.1rem" }}>
      <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>{label}</div>
      <div className="display" style={{ fontSize: "1.8rem" }}>
        {value}
      </div>
    </div>
  );
}
