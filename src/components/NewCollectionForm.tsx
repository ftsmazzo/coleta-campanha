"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewCollectionForm({
  campaignId,
  types,
}: {
  campaignId: string;
  types: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/coletas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        documentTypeId: fd.get("documentTypeId"),
        title: fd.get("title"),
        sourceKind: fd.get("sourceKind"),
      }),
    });
    setPending(false);
    if (!res.ok) return;
    const data = await res.json();
    router.push(`/coletas/${data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="panel" style={{ padding: "1.1rem", display: "grid", gap: "0.75rem" }}>
      <h2 className="display" style={{ margin: 0, fontSize: "1.15rem" }}>
        Nova coleta
      </h2>
      <div className="field">
        <label htmlFor="title">Título</label>
        <input id="title" name="title" placeholder="Onboarding — reunião núcleo" />
      </div>
      <div className="field">
        <label htmlFor="documentTypeId">Tipo de documento</label>
        <select id="documentTypeId" name="documentTypeId" required defaultValue={types[0]?.id}>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="sourceKind">Fonte inicial</label>
        <select id="sourceKind" name="sourceKind" defaultValue="texto">
          <option value="texto">Texto</option>
          <option value="audio">Áudio</option>
          <option value="upload">Upload</option>
        </select>
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending || !types.length}>
        {pending ? "Criando…" : "Abrir coleta"}
      </button>
    </form>
  );
}
