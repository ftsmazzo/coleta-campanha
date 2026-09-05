"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentSchema } from "@/lib/schema-types";

export default function NovoTipoPage() {
  const router = useRouter();
  const [name, setName] = useState("Onboarding customizado");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ schema: DocumentSchema; engine: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function previewSchema() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/tipos/from-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, name }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Falha ao estruturar o texto.");
      return;
    }
    setPreview(await res.json());
  }

  async function save() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/tipos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sourceText: text }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Não salvou o tipo.");
      return;
    }
    const data = await res.json();
    router.push(`/tipos/${data.id}`);
  }

  return (
    <div className="rise" style={{ display: "grid", gap: "1.1rem", maxWidth: 920 }}>
      <header>
        <h1 className="display" style={{ margin: "0 0 0.35rem", fontSize: "2rem" }}>
          Colar checklist
        </h1>
        <p style={{ margin: 0, color: "var(--ink-soft)" }}>
          A IA (ou heurística) transforma o texto em seções e campos. Depois você usa isso em qualquer campanha.
        </p>
      </header>

      <div className="panel" style={{ padding: "1.1rem", display: "grid", gap: "0.85rem" }}>
        <div className="field">
          <label htmlFor="name">Nome do tipo</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="text">Texto do checklist / PDF</label>
          <textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui o onboarding, roteiro de entrevista, lista de papéis…"
            style={{ minHeight: 280 }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" type="button" disabled={pending || !text.trim()} onClick={previewSchema}>
            Pré-visualizar schema
          </button>
          <button className="btn btn-primary" type="button" disabled={pending || !text.trim()} onClick={save}>
            Salvar tipo
          </button>
        </div>
        {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
      </div>

      {preview ? (
        <div className="panel" style={{ padding: "1.1rem", display: "grid", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span className="badge">engine: {preview.engine}</span>
            <span className="badge badge-muted">{preview.schema.sections.length} seções</span>
          </div>
          {preview.schema.sections.map((section) => (
            <div key={section.key}>
              <h3 className="display" style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>
                {section.title}
              </h3>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
                {section.fields.map((f) => (
                  <li key={f.key}>
                    {f.label} <span className="badge badge-muted">{f.type}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
