import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTypes } from "@/lib/db/schema";
import { ensureSeedData } from "@/lib/seed";

export default async function TiposPage() {
  await ensureSeedData();
  const rows = await db.select().from(documentTypes).orderBy(desc(documentTypes.createdAt));

  return (
    <div className="rise" style={{ display: "grid", gap: "1.25rem", maxWidth: 900 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 className="display" style={{ margin: "0 0 0.35rem", fontSize: "2rem" }}>
            Tipos de documento
          </h1>
          <p style={{ margin: 0, color: "var(--ink-soft)" }}>Schemas reutilizáveis por campanha</p>
        </div>
        <Link className="btn btn-primary" href="/tipos/novo">
          Novo a partir de texto
        </Link>
      </header>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.55rem" }}>
        {rows.map((t) => {
          const schema = JSON.parse(t.schemaJson) as { sections: { fields: unknown[] }[] };
          const fields = schema.sections.reduce((acc, s) => acc + s.fields.length, 0);
          return (
            <li key={t.id} className="panel" style={{ padding: "1rem 1.1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong>{t.name}</strong>
                  <div style={{ fontSize: "0.85rem", color: "var(--ink-soft)", marginTop: 4 }}>
                    {t.slug} · v{t.version} · {schema.sections.length} seções · {fields} campos
                  </div>
                </div>
                <Link className="btn btn-secondary" href={`/tipos/${t.id}`}>
                  Ver schema
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
