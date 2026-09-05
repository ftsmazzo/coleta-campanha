"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewCampaignForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/campanhas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        state: fd.get("state"),
        candidate: fd.get("candidate"),
        year: Number(fd.get("year")),
        office: fd.get("office"),
      }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Não foi possível criar a campanha.");
      return;
    }
    router.refresh();
    e.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="panel" style={{ padding: "1.1rem", display: "grid", gap: "0.75rem" }}>
      <h2 className="display" style={{ margin: 0, fontSize: "1.2rem" }}>
        Nova campanha
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0.75rem" }}>
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" name="name" required placeholder="Campanha Amapá 2026" />
        </div>
        <div className="field">
          <label htmlFor="state">UF</label>
          <input id="state" name="state" required maxLength={2} placeholder="AP" />
        </div>
        <div className="field">
          <label htmlFor="candidate">Candidato</label>
          <input id="candidate" name="candidate" required placeholder="Nome" />
        </div>
        <div className="field">
          <label htmlFor="year">Ano</label>
          <input id="year" name="year" type="number" defaultValue={2026} required />
        </div>
        <div className="field">
          <label htmlFor="office">Cargo</label>
          <input id="office" name="office" defaultValue="governador" />
        </div>
      </div>
      {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Criar campanha"}
      </button>
    </form>
  );
}
