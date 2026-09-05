import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentTypes } from "@/lib/db/schema";
import type { DocumentSchema } from "@/lib/schema-types";

type Props = { params: Promise<{ id: string }> };

export default async function TipoDetailPage({ params }: Props) {
  const { id } = await params;
  const [row] = await db.select().from(documentTypes).where(eq(documentTypes.id, id)).limit(1);
  if (!row) notFound();
  const schema = JSON.parse(row.schemaJson) as DocumentSchema;

  return (
    <div className="rise" style={{ display: "grid", gap: "1.1rem", maxWidth: 900 }}>
      <header>
        <p className="badge">{row.slug}</p>
        <h1 className="display" style={{ margin: "0.4rem 0", fontSize: "2rem" }}>
          {row.name}
        </h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>{row.description}</p>
      </header>

      {schema.sections.map((section) => (
        <section key={section.key} className="panel" style={{ padding: "1rem 1.1rem" }}>
          <h2 className="display" style={{ margin: "0 0 0.35rem", fontSize: "1.2rem" }}>
            {section.title}
          </h2>
          {section.description ? (
            <p style={{ margin: "0 0 0.7rem", color: "var(--ink-soft)", fontSize: "0.9rem" }}>{section.description}</p>
          ) : null}
          <div style={{ display: "grid", gap: "0.45rem" }}>
            {section.fields.map((field) => (
              <div
                key={field.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "0.45rem 0",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span>{field.label}</span>
                <span className="badge badge-muted">{field.type}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
