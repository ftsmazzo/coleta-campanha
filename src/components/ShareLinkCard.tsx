"use client";

import { useEffect, useState } from "react";

type Props = { collectionId: string };

export function ShareLinkCard({ collectionId }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function absoluteUrl(pathOrUrl: string) {
    if (pathOrUrl.startsWith("http")) return pathOrUrl;
    if (typeof window === "undefined") return pathOrUrl;
    return `${window.location.origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  }

  async function refresh() {
    const res = await fetch(`/api/coletas/${collectionId}/share`);
    const data = await res.json();
    if (res.ok) {
      setUrl(data.url ? absoluteUrl(data.url) : null);
      setOpenCount(data.openCount ?? null);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  async function generate() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/coletas/${collectionId}/share`, { method: "POST" });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Falha ao gerar link");
      return;
    }
    setUrl(absoluteUrl(data.url || `/r/${data.token}`));
    await refresh();
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(absoluteUrl(url));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="panel session-panel">
      <h3 className="display panel-title">Link para a equipe</h3>
      <p className="panel-sub">
        Jornada Typeform: uma pergunta por vez (texto, áudio ou arquivo). Várias pessoas no mesmo link. O que já
        estiver respondido fica bloqueado.
      </p>
      {openCount != null ? (
        <p className="journey-meta" style={{ marginTop: 0 }}>
          {openCount} pergunta(s) ainda abertas
        </p>
      ) : null}
      {url ? (
        <div className="share-row">
          <input readOnly value={url} />
          <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
            {copied ? "Copiado" : "Copiar link"}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void generate()}>
          {pending ? "Gerando…" : "Gerar link da jornada"}
        </button>
      )}
      {url ? (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 8 }}
          disabled={pending}
          onClick={() => void generate()}
        >
          Garantir token
        </button>
      ) : null}
      {error ? <p className="journey-error">{error}</p> : null}
    </section>
  );
}
