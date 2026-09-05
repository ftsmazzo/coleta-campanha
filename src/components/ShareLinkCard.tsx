"use client";

import { useEffect, useMemo, useState } from "react";

type Selectable = {
  key: string;
  sectionKey: string;
  sectionTitle: string;
  fieldKey: string;
  label: string;
  question: string;
};

type LinkRow = {
  id: string;
  title: string;
  mode: string;
  scope: string[];
  token: string;
  url: string;
};

type Props = { collectionId: string };

export function ShareLinkCard({ collectionId }: Props) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [selectable, setSelectable] = useState<Selectable[]>([]);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"jornada" | "escolha">("jornada");
  const [selected, setSelected] = useState<string[]>([]);
  const [filterSection, setFilterSection] = useState<string>("");

  function absoluteUrl(pathOrUrl: string) {
    if (pathOrUrl.startsWith("http")) return pathOrUrl;
    if (typeof window === "undefined") return pathOrUrl;
    return `${window.location.origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  }

  async function refresh() {
    const res = await fetch(`/api/coletas/${collectionId}/share`);
    const data = await res.json();
    if (!res.ok) return;
    setLinks(data.links || []);
    setSelectable(data.selectable || []);
    setOpenCount(data.openCount ?? null);
  }

  useEffect(() => {
    void refresh();
  }, [collectionId]);

  const sections = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of selectable) map.set(s.sectionKey, s.sectionTitle);
    return [...map.entries()];
  }, [selectable]);

  const visible = selectable.filter((s) => !filterSection || s.sectionKey === filterSection);

  function toggle(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function selectSection(sectionKey: string) {
    const keys = selectable.filter((s) => s.sectionKey === sectionKey).map((s) => s.key);
    setSelected((prev) => [...new Set([...prev, ...keys])]);
  }

  async function createLink() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/coletas/${collectionId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || undefined,
        mode,
        scope: selected,
      }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error || "Falha ao criar link");
      return;
    }
    setTitle("");
    await refresh();
    const url = absoluteUrl(data.url || `/r/${data.token}`);
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(data.id);
    window.setTimeout(() => setCopied(null), 2000);
  }

  async function copy(url: string, id: string) {
    await navigator.clipboard.writeText(absoluteUrl(url));
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1500);
  }

  return (
    <section className="panel session-panel">
      <h3 className="display panel-title">Links para a equipe</h3>
      <p className="panel-sub">
        Crie um link por situação. Escolha <strong>jornada</strong> (uma pergunta após a outra) ou{" "}
        <strong>escolha</strong> (a pessoa vê a lista e responde o que quiser). Marque só as perguntas do recorte —
        ou deixe vazio para todas as abertas. Já respondidas continuam bloqueadas.
      </p>
      {openCount != null ? (
        <p className="journey-meta" style={{ marginTop: 0 }}>
          {openCount} pergunta(s) abertas na sessão agora
        </p>
      ) : null}

      <div className="share-builder">
        <div className="field">
          <label>Nome deste link (situação)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Núcleo político · Agenda · Território Macapá"
          />
        </div>

        <div className="journey-modes" role="tablist">
          <button
            type="button"
            className={`journey-mode ${mode === "jornada" ? "is-active" : ""}`}
            onClick={() => setMode("jornada")}
          >
            Jornada (sequencial)
          </button>
          <button
            type="button"
            className={`journey-mode ${mode === "escolha" ? "is-active" : ""}`}
            onClick={() => setMode("escolha")}
          >
            Escolher perguntas
          </button>
        </div>

        <div className="share-scope-tools">
          <select value={filterSection} onChange={(e) => setFilterSection(e.target.value)}>
            <option value="">Todas as seções</option>
            {sections.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          {filterSection ? (
            <button type="button" className="btn btn-secondary" onClick={() => selectSection(filterSection)}>
              Marcar seção filtrada
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => setSelected([])}>
            Limpar seleção
          </button>
          <span className="journey-meta">{selected.length ? `${selected.length} selecionada(s)` : "todas as abertas"}</span>
        </div>

        <div className="share-scope-list">
          {visible.map((item) => (
            <label key={item.key} className="share-scope-item">
              <input type="checkbox" checked={selected.includes(item.key)} onChange={() => toggle(item.key)} />
              <span>
                <strong>{item.sectionTitle}</strong>
                <em>{item.question}</em>
              </span>
            </label>
          ))}
        </div>

        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void createLink()}>
          {pending ? "Criando…" : "Gerar link desta situação"}
        </button>
        {error ? <p className="journey-error">{error}</p> : null}
      </div>

      {links.length ? (
        <div className="share-links-list">
          <h4 className="mun-subtitle">Links criados</h4>
          {links.map((l) => (
            <div key={l.id} className="share-link-row">
              <div>
                <strong>{l.title}</strong>
                <div className="journey-meta">
                  {l.mode === "escolha" ? "modo escolha" : "modo jornada"}
                  {l.scope.length ? ` · ${l.scope.length} pergunta(s) no recorte` : " · todas as abertas"}
                </div>
                <code className="share-url">{absoluteUrl(l.url)}</code>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => void copy(l.url, l.id)}>
                {copied === l.id ? "Copiado" : "Copiar"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
