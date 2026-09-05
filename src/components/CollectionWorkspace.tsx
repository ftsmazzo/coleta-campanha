"use client";

import { useMemo, useState } from "react";
import type { DocumentSchema, FieldAnswerView } from "@/lib/schema-types";

type Props = {
  collectionId: string;
  initialTranscript: string | null;
  initialFields: FieldAnswerView[];
  schema: DocumentSchema;
  audioParts: { chunked?: boolean; partCount?: number; durationSeconds?: number | null } | null;
  status: string;
};

function valueToText(value: FieldAnswerView["value"]): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string")) return (value as string[]).join("\n");
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "object") {
    const o = value as { nome?: string; telefone?: string; base?: string; nota?: string };
    if ("nome" in o || "telefone" in o || "base" in o) {
      return [o.nome, o.telefone, o.base].filter(Boolean).join(" | ") + (o.nota ? `\n${o.nota}` : "");
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function textToValue(text: string, type: string): FieldAnswerView["value"] {
  const t = text.trim();
  if (!t) return null;
  if (type === "boolean") return /^(sim|true|1|yes)$/i.test(t);
  if (type === "list") return t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (type === "contact") {
    const [nome, telefone, base] = t.split("|").map((x) => x.trim());
    return { nome: nome || "", telefone: telefone || "", base: base || "" };
  }
  if (type === "contact_list") {
    return t.split(/\n+/).map((line) => {
      const [nome, telefone, base] = line.split("|").map((x) => x.trim());
      return { nome: nome || "", telefone: telefone || "", base: base || "" };
    });
  }
  return t;
}

export function CollectionWorkspace({
  collectionId,
  initialTranscript,
  initialFields,
  schema,
  audioParts,
  status: initialStatus,
}: Props) {
  const [transcript, setTranscript] = useState(initialTranscript ?? "");
  const [fields, setFields] = useState(initialFields);
  const [sectionKey, setSectionKey] = useState(schema.sections[0]?.key ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [audioInfo, setAudioInfo] = useState(audioParts);

  const fieldTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of schema.sections) {
      for (const f of s.fields) map.set(`${s.key}.${f.key}`, f.type);
    }
    return map;
  }, [schema]);

  const sectionFields = fields.filter((f) => f.sectionKey === sectionKey);
  const filled = fields.filter((f) => f.status !== "vazio" && valueToText(f.value).trim()).length;
  const percent = fields.length ? Math.round((filled / fields.length) * 100) : 0;

  async function uploadAudio(file: File) {
    setPending(true);
    setMessage(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/coletas/${collectionId}/audio`, { method: "POST", body: fd });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setMessage(data.error || "Falha no áudio");
      return;
    }
    setAudioInfo({
      chunked: data.chunked,
      partCount: data.partCount,
      durationSeconds: data.durationSeconds,
    });
    setStatus("audio_pronto");
    setMessage(data.note);
  }

  async function runExtract() {
    setPending(true);
    setMessage(null);
    const res = await fetch(`/api/coletas/${collectionId}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setMessage(data.error || "Falha na extração");
      return;
    }
    const refreshed = await fetch(`/api/coletas/${collectionId}`);
    const full = await refreshed.json();
    setFields(full.fields);
    setStatus(full.collection.status);
    setMessage(`Extração ok · ${data.fieldsSuggested} campos sugeridos (${data.engine})`);
  }

  async function saveField(field: FieldAnswerView, text: string) {
    const type = fieldTypeMap.get(`${field.sectionKey}.${field.fieldKey}`) || "text";
    const value = textToValue(text, type);
    setFields((prev) =>
      prev.map((f) => (f.id === field.id ? { ...f, value, status: "editado" as const } : f)),
    );
    await fetch(`/api/coletas/${collectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: [{ id: field.id, value, status: "editado" }] }),
    });
  }

  async function validateAll() {
    setPending(true);
    await fetch(`/api/coletas/${collectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validated: true }),
    });
    setStatus("validado");
    setPending(false);
    setMessage("Coleta validada.");
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="panel" style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <span className="badge badge-muted">{status}</span>
            {audioInfo?.partCount ? (
              <span className="badge badge-warn" style={{ marginLeft: 8 }}>
                áudio · {audioInfo.partCount} parte(s)
                {audioInfo.chunked ? " · dividido" : ""}
              </span>
            ) : null}
          </div>
          <strong>
            {percent}% · {filled}/{fields.length}
          </strong>
        </div>
        <div style={{ height: 8, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
          <div style={{ width: `${percent}%`, height: "100%", background: "var(--accent)", transition: "width 240ms ease" }} />
        </div>
      </div>

      <div className="panel" style={{ padding: "1rem 1.1rem", display: "grid", gap: "0.75rem" }}>
        <h2 className="display" style={{ margin: 0, fontSize: "1.15rem" }}>
          Entrada
        </h2>
        <div className="field">
          <label htmlFor="audio">Upload de áudio (longos são quebrados automaticamente)</label>
          <input
            id="audio"
            type="file"
            accept="audio/*,.webm,.mp3,.m4a,.wav,.ogg"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadAudio(file);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="transcript">Transcrição ou texto colado</label>
          <textarea
            id="transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Cole a fala da reunião, notas ou transcrição do áudio…"
            style={{ minHeight: 160 }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="button" disabled={pending || !transcript.trim()} onClick={runExtract}>
            Extrair para campos
          </button>
          <button className="btn btn-secondary" type="button" disabled={pending} onClick={validateAll}>
            Validar coleta
          </button>
        </div>
        {message ? <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: "0.9rem" }}>{message}</p> : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,240px) 1fr", gap: "0.85rem" }}>
        <nav className="panel" style={{ padding: "0.65rem", alignSelf: "start", display: "grid", gap: "0.25rem" }}>
          {schema.sections.map((section) => {
            const count = fields.filter((f) => f.sectionKey === section.key && valueToText(f.value).trim()).length;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setSectionKey(section.key)}
                style={{
                  textAlign: "left",
                  border: "none",
                  background: sectionKey === section.key ? "rgba(31,107,74,0.12)" : "transparent",
                  borderRadius: 8,
                  padding: "0.65rem 0.7rem",
                  cursor: "pointer",
                  color: "var(--ink)",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{section.title}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                  {count}/{section.fields.length}
                </div>
              </button>
            );
          })}
        </nav>

        <div style={{ display: "grid", gap: "0.7rem" }}>
          {sectionFields.map((field) => (
            <FieldEditor
              key={`${field.id}:${field.status}:${valueToText(field.value).slice(0, 24)}`}
              field={field}
              onSave={saveField}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  onSave,
}: {
  field: FieldAnswerView;
  onSave: (field: FieldAnswerView, text: string) => Promise<void>;
}) {
  const [text, setText] = useState(valueToText(field.value));

  return (
    <div className="panel" style={{ padding: "0.9rem 1rem", display: "grid", gap: "0.45rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "0.95rem" }}>{field.label}</strong>
        <span className={field.status === "vazio" ? "badge badge-muted" : "badge"}>{field.status}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== valueToText(field.value)) void onSave(field, text);
        }}
        style={{ minHeight: 72 }}
        placeholder="Preencher ou aceitar sugestão da IA"
      />
      {field.evidence ? (
        <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--ink-soft)" }}>
          evidência: {field.evidence}
          {field.confidence ? ` · confiança ${field.confidence}` : ""}
        </p>
      ) : null}
    </div>
  );
}
