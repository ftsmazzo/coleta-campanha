"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SessionRecorder } from "@/components/SessionRecorder";
import { MunicipalityBlocksField } from "@/components/MunicipalityBlocksField";
import { isFilled, textToValue, valueToText, type ContactValue } from "@/lib/field-utils";
import { municipioBlocksProgress, parseMunicipioBlocks } from "@/lib/municipios";
import type { DocumentSchema, FieldAnswerView, FieldType } from "@/lib/schema-types";

type Props = {
  collectionId: string;
  initialTranscript: string | null;
  initialFields: FieldAnswerView[];
  schema: DocumentSchema;
  audioParts: { chunked?: boolean; partCount?: number; durationSeconds?: number | null } | null;
  status: string;
};

type Mode = "formulario" | "gravar" | "importar";

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
  const [mode, setMode] = useState<Mode>("formulario");
  const [recordingFile, setRecordingFile] = useState<File | null>(null);
  const [filterGaps, setFilterGaps] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const fieldTypeMap = useMemo(() => {
    const map = new Map<string, FieldType>();
    for (const s of schema.sections) {
      for (const f of s.fields) map.set(`${s.key}.${f.key}`, f.type);
    }
    return map;
  }, [schema]);

  const sectionStats = useMemo(
    () =>
      schema.sections.map((section) => {
        const sectionFields = fields.filter((f) => f.sectionKey === section.key);
        let total = 0;
        let filledCount = 0;

        for (const schemaField of section.fields) {
          const answer = sectionFields.find((f) => f.fieldKey === schemaField.key);
          if (schemaField.type === "municipio_blocks") {
            const prog = municipioBlocksProgress(parseMunicipioBlocks(answer?.value));
            total += prog.total || 1;
            filledCount += prog.filled;
            continue;
          }
          total += 1;
          if (answer && isFilled(answer.value)) filledCount += 1;
        }

        return {
          key: section.key,
          title: section.title,
          description: section.description,
          total,
          filled: filledCount,
          percent: total ? Math.round((filledCount / total) * 100) : 0,
        };
      }),
    [fields, schema.sections],
  );

  const overall = useMemo(() => {
    const total = sectionStats.reduce((acc, s) => acc + s.total, 0);
    const filledCount = sectionStats.reduce((acc, s) => acc + s.filled, 0);
    return {
      total,
      filled: filledCount,
      percent: total ? Math.round((filledCount / total) * 100) : 0,
      missing: total - filledCount,
    };
  }, [sectionStats]);

  const filled = overall.filled;
  const percent = overall.percent;
  const missing = overall.missing;

  const sectionFields = fields
    .filter((f) => f.sectionKey === sectionKey)
    .filter((f) => {
      const schemaField = schema.sections
        .find((s) => s.key === sectionKey)
        ?.fields.find((sf) => sf.key === f.fieldKey);
      if (!schemaField) return false;
      if (!filterGaps) return true;
      if (schemaField.type === "municipio_blocks") {
        const prog = municipioBlocksProgress(parseMunicipioBlocks(f.value));
        return prog.filled < prog.total || prog.total === 0;
      }
      return !isFilled(f.value);
    });

  const currentSection = schema.sections.find((s) => s.key === sectionKey);

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
    setMessage(data.note || "Áudio preparado. Cole a transcrição ou rode a IA quando tiver o texto.");
    setRecordingFile(null);
  }

  async function runExtract(opts?: { onlyEmpty?: boolean }) {
    setPending(true);
    setMessage(null);
    const res = await fetch(`/api/coletas/${collectionId}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, onlyEmpty: opts?.onlyEmpty ?? false }),
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
    setMessage(
      opts?.onlyEmpty
        ? `IA preencheu ${data.fieldsSuggested} lacunas (${data.engine})`
        : `IA sugeriu ${data.fieldsSuggested} campos (${data.engine})`,
    );
    setMode("formulario");
  }

  async function saveField(field: FieldAnswerView, value: FieldAnswerView["value"]) {
    setFields((prev) =>
      prev.map((f) =>
        f.id === field.id
          ? { ...f, value, status: isFilled(value) ? ("editado" as const) : ("vazio" as const) }
          : f,
      ),
    );
    await fetch(`/api/coletas/${collectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: [{ id: field.id, value, status: isFilled(value) ? "editado" : "vazio" }],
      }),
    });
    setSavedFlash(field.id);
    window.setTimeout(() => setSavedFlash((cur) => (cur === field.id ? null : cur)), 1200);
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
    setMessage("Sessão validada.");
  }

  return (
    <div className="session">
      <section className="session-hero panel">
        <div className="session-hero-grid">
          <div className="progress-ring" style={{ ["--p" as string]: `${percent}` }}>
            <div className="progress-ring-inner">
              <strong>{percent}%</strong>
              <span>
                {filled}/{fields.length}
              </span>
            </div>
          </div>
          <div className="session-hero-copy">
            <div className="session-badges">
              <span className={status === "validado" ? "badge" : "badge badge-muted"}>{status}</span>
              {audioInfo?.partCount ? (
                <span className="badge badge-warn">
                  áudio · {audioInfo.partCount} parte(s)
                  {audioInfo.chunked ? " · dividido" : ""}
                </span>
              ) : null}
              <span className="badge badge-muted">{missing} lacunas</span>
            </div>
            <h2 className="display session-hero-title">Dashboard da sessão</h2>
            <p>
              Preencha o formulário seção a seção. Grave ou importe só quando quiser acelerar com IA. Cada campo salva
              sozinho.
            </p>
            <div className="session-hero-actions">
              <button
                type="button"
                className={`btn ${mode === "formulario" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setMode("formulario")}
              >
                Formulário
              </button>
              <button
                type="button"
                className={`btn ${mode === "gravar" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setMode("gravar")}
              >
                Gravar áudio
              </button>
              <button
                type="button"
                className={`btn ${mode === "importar" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setMode("importar")}
              >
                Importar / IA
              </button>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={validateAll}>
                Validar sessão
              </button>
            </div>
            {message ? <p className="session-msg">{message}</p> : null}
          </div>
        </div>

        <div className="section-progress-grid">
          {sectionStats.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`section-chip ${sectionKey === s.key ? "is-active" : ""}`}
              onClick={() => {
                setSectionKey(s.key);
                setMode("formulario");
              }}
            >
              <div className="section-chip-top">
                <strong>{s.title}</strong>
                <span>{s.percent}%</span>
              </div>
              <div className="mini-bar">
                <i style={{ width: `${s.percent}%` }} />
              </div>
              <span className="section-chip-meta">
                {s.filled}/{s.total} campos
              </span>
            </button>
          ))}
        </div>
      </section>

      {mode === "gravar" ? (
        <section className="panel session-panel">
          <h3 className="display panel-title">Gravação na plataforma</h3>
          <p className="panel-sub">Mesmo fluxo do Orbe: grave aqui, sem precisar de arquivo externo.</p>
          <SessionRecorder onRecordingReady={setRecordingFile} disabled={pending} />
          {recordingFile ? (
            <div className="recorder-send">
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() => void uploadAudio(recordingFile)}
              >
                {pending ? "Enviando…" : "Enviar gravação para a sessão"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {mode === "importar" ? (
        <section className="panel session-panel">
          <h3 className="display panel-title">Importar e completar com IA</h3>
          <p className="panel-sub">Opção secundária: upload, texto colado ou auto-completar lacunas.</p>
          <div className="field">
            <label htmlFor="audio">Upload de áudio</label>
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
            <label htmlFor="transcript">Transcrição / notas / texto</label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Cole a fala da reunião, notas ou transcrição…"
              style={{ minHeight: 140 }}
            />
          </div>
          <div className="session-hero-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending || !transcript.trim()}
              onClick={() => void runExtract({ onlyEmpty: true })}
            >
              IA: completar só lacunas
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={pending || !transcript.trim()}
              onClick={() => void runExtract({ onlyEmpty: false })}
            >
              IA: varrer e sugerir tudo
            </button>
          </div>
        </section>
      ) : null}

      <section className="session-body">
        <nav className="panel session-nav">
          <div className="session-nav-head">
            <strong>Seções</strong>
            <label className="gap-toggle">
              <input type="checkbox" checked={filterGaps} onChange={(e) => setFilterGaps(e.target.checked)} />
              Só lacunas
            </label>
          </div>
          {sectionStats.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`session-nav-item ${sectionKey === s.key ? "is-active" : ""}`}
              onClick={() => {
                setSectionKey(s.key);
                setMode("formulario");
              }}
            >
              <span>{s.title}</span>
              <em>
                {s.filled}/{s.total}
              </em>
              <div className="mini-bar">
                <i style={{ width: `${s.percent}%` }} />
              </div>
            </button>
          ))}
        </nav>

        <div className="session-form">
          <div className="session-form-head panel">
            <div>
              <h3 className="display panel-title">{currentSection?.title ?? "Seção"}</h3>
              {currentSection?.description ? <p className="panel-sub">{currentSection.description}</p> : null}
            </div>
            <span className="badge">
              {sectionStats.find((s) => s.key === sectionKey)?.filled ?? 0}/
              {sectionStats.find((s) => s.key === sectionKey)?.total ?? 0}
            </span>
          </div>

          {sectionFields.length === 0 ? (
            <div className="panel empty-section">Nada nesta visão. Desmarque “Só lacunas” ou mude de seção.</div>
          ) : (
            sectionFields.map((field) => {
              const type = fieldTypeMap.get(`${field.sectionKey}.${field.fieldKey}`) || "text";
              const schemaField = currentSection?.fields.find((f) => f.key === field.fieldKey);
              return (
                <DynamicFieldCard
                  key={field.id}
                  field={field}
                  type={type}
                  hint={schemaField?.hint}
                  defaultUf={schemaField?.defaultUf}
                  saved={savedFlash === field.id}
                  onSave={(value) => saveField(field, value)}
                />
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

function DynamicFieldCard({
  field,
  type,
  hint,
  defaultUf,
  saved,
  onSave,
}: {
  field: FieldAnswerView;
  type: FieldType;
  hint?: string;
  defaultUf?: string;
  saved: boolean;
  onSave: (value: FieldAnswerView["value"]) => Promise<void>;
}) {
  const munProg =
    type === "municipio_blocks" ? municipioBlocksProgress(parseMunicipioBlocks(field.value)) : null;
  const filled = munProg ? munProg.total > 0 && munProg.filled === munProg.total : isFilled(field.value);

  return (
    <article className={`field-card panel ${filled ? "is-filled" : "is-empty"} ${saved ? "is-saved" : ""}`}>
      <header className="field-card-head">
        <div>
          <strong>{field.label}</strong>
          {hint ? <p className="field-hint">{hint}</p> : null}
        </div>
        <div className="field-card-tags">
          <span className={filled ? "badge" : "badge badge-muted"}>
            {munProg ? `${munProg.filled}/${munProg.total}` : filled ? field.status : "lacuna"}
          </span>
          {saved ? <span className="badge">salvo</span> : null}
        </div>
      </header>

      {type === "municipio_blocks" ? (
        <MunicipalityBlocksField
          value={field.value}
          defaultUf={defaultUf || "AP"}
          onCommit={(blocks) => void onSave(blocks)}
        />
      ) : type === "contact" ? (
        <ContactFields
          value={(typeof field.value === "object" && field.value && !Array.isArray(field.value)
            ? field.value
            : {}) as ContactValue}
          onCommit={(value) => void onSave(value)}
        />
      ) : type === "boolean" ? (
        <BooleanField value={Boolean(field.value)} onCommit={(value) => void onSave(value)} />
      ) : type === "list" || type === "contact_list" ? (
        <ListField
          value={valueToText(field.value)}
          placeholder={type === "contact_list" ? "Uma pessoa por linha: NOME | TELEFONE | BASE" : "Um item por linha"}
          onCommit={(text) => void onSave(textToValue(text, type))}
        />
      ) : (
        <TextField
          multiline={type === "textarea" || type === "text"}
          value={valueToText(field.value)}
          placeholder="Digite e saia do campo para salvar"
          onCommit={(text) => void onSave(textToValue(text, type))}
        />
      )}

      {field.evidence ? (
        <p className="field-evidence">
          evidência: {field.evidence}
          {field.confidence ? ` · ${field.confidence}` : ""}
        </p>
      ) : null}
    </article>
  );
}

function TextField({
  value,
  multiline,
  placeholder,
  onCommit,
}: {
  value: string;
  multiline: boolean;
  placeholder: string;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  const last = useRef(value);
  useEffect(() => {
    setText(value);
    last.current = value;
  }, [value]);

  function commit() {
    if (text !== last.current) {
      last.current = text;
      onCommit(text);
    }
  }

  if (multiline) {
    return (
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        rows={4}
      />
    );
  }

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      placeholder={placeholder}
    />
  );
}

function ListField({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (text: string) => void;
}) {
  return <TextField value={value} multiline placeholder={placeholder} onCommit={onCommit} />;
}

function BooleanField({ value, onCommit }: { value: boolean; onCommit: (v: boolean) => void }) {
  return (
    <div className="bool-row">
      <button type="button" className={`btn ${value ? "btn-primary" : "btn-secondary"}`} onClick={() => onCommit(true)}>
        Sim / feito
      </button>
      <button
        type="button"
        className={`btn ${!value ? "btn-primary" : "btn-secondary"}`}
        onClick={() => onCommit(false)}
      >
        Não / pendente
      </button>
    </div>
  );
}

function ContactFields({
  value,
  onCommit,
}: {
  value: ContactValue;
  onCommit: (value: ContactValue) => void;
}) {
  const [nome, setNome] = useState(value.nome ?? "");
  const [telefone, setTelefone] = useState(value.telefone ?? "");
  const [base, setBase] = useState(value.base ?? "");

  useEffect(() => {
    setNome(value.nome ?? "");
    setTelefone(value.telefone ?? "");
    setBase(value.base ?? "");
  }, [value.nome, value.telefone, value.base]);

  function commit() {
    onCommit({ nome: nome.trim(), telefone: telefone.trim(), base: base.trim() });
  }

  return (
    <div className="contact-grid">
      <div className="field">
        <label>Nome</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} onBlur={commit} placeholder="Nome" />
      </div>
      <div className="field">
        <label>Telefone</label>
        <input value={telefone} onChange={(e) => setTelefone(e.target.value)} onBlur={commit} placeholder="(xx) …" />
      </div>
      <div className="field">
        <label>Base</label>
        <input value={base} onChange={(e) => setBase(e.target.value)} onBlur={commit} placeholder="Cidade / comitê" />
      </div>
    </div>
  );
}
