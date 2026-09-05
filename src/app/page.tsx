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
          Sessões operacionais com formulário, gravação e IA.
        </h1>
        <p style={{ margin: 0, maxWidth: 640, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          Cada sessão é um checklist vivo: preencha à mão, grave áudio na plataforma ou importe texto. A barra mostra o
          que já temos e o que ainda falta.
        </p>
      </header>

      <section className="panel" style={{ padding: "1.25rem 1.35rem", display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          {ap && onboarding ? (
            <form
              action={async () => {
                "use server";
                await startOnboardingCollection(ap.id, onboarding.id);
              }}
            >
              <button className="btn btn-primary" type="submit">
                Nova sessão · Onboarding AP
              </button>
            </form>
          ) : null}
          <Link className="btn btn-secondary" href="/sessoes">
            Ver sessões
          </Link>
          <Link className="btn btn-secondary" href="/tipos/novo">
            Colar checklist → tipo
          </Link>
        </div>
      </section>

      <section style={{ display: "grid", gap: "0.85rem" }}>
        <h2 className="display" style={{ margin: 0, fontSize: "1.35rem" }}>
          Sessões recentes
        </h2>
        {collectionList.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Nenhuma sessão ainda.</p>
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
    </div>
  );
}
