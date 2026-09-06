"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CLASSIFICACAO_OPERACAO } from "@/lib/municipios";
import type { JourneyStep } from "@/lib/share";
import {
  formatBytes,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILES,
  validateUploadBatch,
} from "@/lib/upload-limits";

type Progress = { total: number; filled: number; percent: number; missing: number };
type AnswerMode = "texto" | "audio" | "arquivo";
type Props = { token: string };

function formatMs(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function BrandBar({ modeLabel }: { modeLabel: string }) {
  return (
    <div className="journey-brand-bar">
      <Image
        src="/brand/logo-horizontal.png"
        alt="Inteligência Eleitoral"
        width={180}
        height={48}
        priority
      />
      <span className="journey-brand-chip">{modeLabel}</span>
    </div>
  );
}

export function IndirectJourney({ token }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [closedMsg, setClosedMsg] = useState("");
  const [title, setTitle] = useState("");
  const [linkTitle, setLinkTitle] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState<"jornada" | "escolha">("jornada");
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [respondentName, setRespondentName] = useState("");
  const [introDone, setIntroDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<AnswerMode>("texto");
  /** No modo escolha: pergunta selecionada na lista. */
  const [pickedId, setPickedId] = useState<string | null>(null);
  /** Puladas só nesta pessoa/navegador — não trava para os outros. */
  const [skippedIds, setSkippedIds] = useState<string[]>([]);

  const storageKey = `coleta-r:${token}`;
  const chipRailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { name?: string; introDone?: boolean; skipped?: string[] };
      if (parsed.name) setRespondentName(parsed.name);
      if (parsed.introDone) setIntroDone(true);
      if (Array.isArray(parsed.skipped)) setSkippedIds(parsed.skipped);
    } catch {
      // ignore
    }
  }, [storageKey]);

  function persistSession(patch: { name?: string; introDone?: boolean; skipped?: string[] }) {
    try {
      const prev = sessionStorage.getItem(storageKey);
      const base = prev ? (JSON.parse(prev) as Record<string, unknown>) : {};
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          ...base,
          name: patch.name ?? respondentName,
          introDone: patch.introDone ?? introDone,
          skipped: patch.skipped ?? skippedIds,
        }),
      );
    } catch {
      // ignore
    }
  }

  const [text, setText] = useState("");
  const [boolVal, setBoolVal] = useState<boolean | null>(null);
  const [contact, setContact] = useState({ nome: "", telefone: "", base: "" });
  const [classificacao, setClassificacao] = useState("");
  const [respNome, setRespNome] = useState("");
  const [respTel, setRespTel] = useState("");
  const [coordNome, setCoordNome] = useState("");
  const [coordTel, setCoordTel] = useState("");

  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const openSteps = steps.filter((s) => !skippedIds.includes(s.id));
  const step =
    shareMode === "escolha"
      ? openSteps.find((s) => s.id === pickedId) ?? null
      : openSteps[0] ?? null;
  const showEscolhaLayout = shareMode === "escolha" && openSteps.length > 0;
  const openStepIds = openSteps.map((s) => s.id).join("|");
  const allCaughtUp =
    !loading && !closed && !error && introDone && openSteps.length === 0 && steps.length === 0;
  const onlySkippedLeft =
    !loading && !closed && !error && introDone && openSteps.length === 0 && steps.length > 0;
  const totalOpen = openSteps.length;
  const modeLabel = shareMode === "escolha" ? "modo coluna" : "modo jornada";

  useEffect(() => {
    if (shareMode !== "escolha") return;
    const first = openStepIds ? openStepIds.split("|")[0] : null;
    if (!pickedId && first) setPickedId(first);
    else if (pickedId && first && !openStepIds.split("|").includes(pickedId)) setPickedId(first);
    else if (pickedId && !first) setPickedId(null);
  }, [shareMode, openStepIds, pickedId]);

  useEffect(() => {
    if (!pickedId || !chipRailRef.current) return;
    const el = chipRailRef.current.querySelector<HTMLElement>(`[data-chip-id="${pickedId}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [pickedId]);

  function skipCurrent() {
    if (!step) return;
    const next = [...skippedIds, step.id];
    setSkippedIds(next);
    persistSession({ skipped: next });
    setPickedId(null);
    resetAnswer();
    setError(null);
  }

  function startIntro() {
    setIntroDone(true);
    persistSession({ name: respondentName.trim(), introDone: true });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/r/${token}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Link inválido");
      return;
    }
    if (data.closed) {
      setClosed(true);
      setClosedMsg(data.message || "Sessão encerrada.");
      setTitle(data.title || "");
      return;
    }
    setTitle(data.title || "");
    setLinkTitle(data.linkTitle || null);
    setShareMode(data.mode === "escolha" ? "escolha" : "jornada");
    setCampaignName(data.campaignName || null);
    setSteps(data.steps || []);
    setProgress(data.progress || null);
    setPickedId(null);
    resetAnswer();
  }, [token]);

  useEffect(() => {
    void load();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, [load]);

  function resetAnswer() {
    setMode("texto");
    setText("");
    setBoolVal(null);
    setContact({ nome: "", telefone: "", base: "" });
    setClassificacao("");
    setRespNome("");
    setRespTel("");
    setCoordNome("");
    setCoordTel("");
    setAudioFile(null);
    setFiles([]);
    setRecording(false);
    setElapsedMs(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function startRecording() {
    setError(null);
    setAudioFile(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (e) => {
        if (e.data?.size) chunksRef.current.push(e.data);
      });
      recorder.addEventListener("stop", () => {
        const type = (recorder.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach((t) => t.stop());
        if (!blob.size) {
          setError("Gravação vazia. Tente de novo.");
          return;
        }
        setAudioFile(new File([blob], `resposta-${Date.now()}.webm`, { type }));
      });
      try {
        recorder.start(500);
      } catch {
        recorder.start();
      }
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
    } catch {
      setError("Sem acesso ao microfone. Use texto ou arquivo.");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setRecording(false);
  }

  async function send() {
    if (!step) return;
    setPending(true);
    setError(null);

    try {
      if (mode === "audio") {
        if (!audioFile) {
          setError("Grave o áudio antes de enviar.");
          setPending(false);
          return;
        }
        const fd = new FormData();
        fd.set("stepId", step.id);
        fd.set("file", audioFile);
        if (respondentName) fd.set("respondentName", respondentName);
        const res = await fetch(`/api/r/${token}/answer-audio`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Falha no áudio");
          if (res.status === 409) await load();
          setPending(false);
          return;
        }
        setSteps(data.steps || []);
        setProgress(data.progress || null);
        setPickedId(null);
        resetAnswer();
        setPending(false);
        // Atualiza o que outros já fecharam
        void load();
        return;
      }

      if (mode === "arquivo") {
        const check = validateUploadBatch(files);
        if (!check.ok) {
          setError(check.error);
          setPending(false);
          return;
        }
        const names = files.map((f) => f.name).join(", ");
        const note =
          text.trim() ||
          (files.length === 1 ? `Arquivo enviado: ${names}` : `${files.length} arquivos enviados: ${names}`);

        // Anexa antes de fechar a pergunta — se o upload falhar, a pergunta continua aberta.
        const fd = new FormData();
        fd.set("kind", "documento");
        fd.set("fieldAnswerId", step.fieldAnswerId);
        for (const f of files) fd.append("file", f);
        if (respondentName) fd.set("respondentName", respondentName);
        const attachRes = await fetch(`/api/r/${token}/attach`, { method: "POST", body: fd });
        const attachData = await attachRes.json().catch(() => ({}));
        if (!attachRes.ok) {
          setError(attachData.error || "Falha ao enviar os arquivos. Tente de novo.");
          setPending(false);
          return;
        }

        const payload: Record<string, unknown> = {
          stepId: step.id,
          respondentName,
          text: note,
        };
        if (step.kind === "municipio") {
          payload.classificacao = classificacao || "em_implantacao";
          payload.responsavelNome = respNome || "Ver arquivo anexo";
          payload.text = note;
        } else if (step.type === "boolean") {
          payload.booleanValue = true;
          payload.text = note;
        } else if (step.type === "contact") {
          payload.contact = { nome: note, telefone: "", base: "arquivo" };
        }

        const res = await fetch(`/api/r/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(
            data.error ||
              "Arquivos enviados, mas a resposta não fechou. Tente enviar de novo (os arquivos já estão salvos).",
          );
          if (res.status === 409) await load();
          setPending(false);
          return;
        }

        setSteps(data.steps || []);
        setProgress(data.progress || null);
        setPickedId(null);
        resetAnswer();
        setPending(false);
        void load();
        return;
      }

      // modo texto
      const payload: Record<string, unknown> = { stepId: step.id, respondentName };
      if (step.kind === "municipio") {
        if (!classificacao && !respNome && !coordNome && !text.trim()) {
          setError("Preencha ao menos classificação, um nome ou a observação.");
          setPending(false);
          return;
        }
        payload.text = text;
        payload.classificacao = classificacao;
        payload.responsavelNome = respNome;
        payload.responsavelTelefone = respTel;
        payload.coordenadorNome = coordNome;
        payload.coordenadorTelefone = coordTel;
      } else if (step.type === "boolean") {
        if (boolVal == null) {
          setError("Escolha sim ou não.");
          setPending(false);
          return;
        }
        payload.booleanValue = boolVal;
      } else if (step.type === "contact") {
        if (!contact.nome.trim() && !contact.telefone.trim()) {
          setError("Informe nome ou telefone.");
          setPending(false);
          return;
        }
        payload.contact = contact;
      } else if (!text.trim()) {
        setError("Escreva a resposta ou use áudio/arquivo.");
        setPending(false);
        return;
      } else {
        payload.text = text;
      }

      const res = await fetch(`/api/r/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao salvar");
        if (res.status === 409) await load();
        setPending(false);
        return;
      }
      setSteps(data.steps || []);
      setProgress(data.progress || null);
      setPickedId(null);
      resetAnswer();
      setPending(false);
      void load();
    } catch {
      setPending(false);
      setError("Erro de rede. Tente de novo.");
    }
  }

  if (loading) {
    return (
      <>
        <BrandBar modeLabel="carregando" />
        <div className="journey-shell">
          <div className="journey-card panel">Carregando jornada…</div>
        </div>
      </>
    );
  }

  if (error && !step && !allCaughtUp && !onlySkippedLeft && introDone) {
    return (
      <>
        <BrandBar modeLabel="indisponível" />
        <div className="journey-shell">
          <div className="journey-card panel">
            <h1 className="display journey-title">Link indisponível</h1>
            <p className="journey-hint">{error}</p>
          </div>
        </div>
      </>
    );
  }

  if (closed) {
    return (
      <>
        <BrandBar modeLabel="encerrado" />
        <div className="journey-shell">
          <div className="journey-card panel journey-done">
            <p className="badge">encerrado</p>
            <h1 className="display journey-title">{title || "Onboarding"}</h1>
            <p className="journey-hint">{closedMsg}</p>
          </div>
        </div>
      </>
    );
  }

  if (!introDone && !loading && !error) {
    return (
      <>
        <BrandBar modeLabel={modeLabel} />
        <div className="journey-shell">
          <div className="journey-intro-hero">
            <div className="journey-intro-hero-inner">
              <Image
                src="/brand/logo-horizontal.png"
                alt="Inteligência Eleitoral"
                width={160}
                height={44}
              />
              <p className="badge badge-muted">começar</p>
              <h1 className="display journey-title">{linkTitle || title}</h1>
              {campaignName ? <p className="journey-meta">{campaignName}</p> : null}
            </div>
          </div>
          <article className="journey-card panel">
            <h2 className="display journey-question">Antes de começar</h2>
            <p className="journey-hint">
              Seu nome aparece só uma vez. Nas perguntas você pode responder ou pular o que não for com você. O que
              outra pessoa já preencheu fica fechado para todos.
            </p>
            <div className="field">
              <label htmlFor="who">Seu nome</label>
              <input
                id="who"
                value={respondentName}
                onChange={(e) => setRespondentName(e.target.value)}
                placeholder="Ex.: Ana — comunicação"
                autoFocus
                autoComplete="name"
              />
            </div>
            <div className="journey-actions journey-send">
              <button type="button" className="btn btn-primary btn-lg" onClick={startIntro}>
                Continuar
              </button>
            </div>
          </article>
        </div>
      </>
    );
  }

  if (allCaughtUp) {
    return (
      <>
        <BrandBar modeLabel="concluído" />
        <div className="journey-shell">
          <div className="journey-card panel journey-done">
            <p className="badge">obrigado</p>
            <h1 className="display journey-title">Pronto por aqui</h1>
            <p className="journey-hint">
              Não há mais perguntas abertas neste link. O que já foi respondido ficou fechado para todos.
            </p>
            {progress ? (
              <p className="journey-meta">
                Sessão: {progress.filled}/{progress.total} · {progress.percent}%
              </p>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  if (onlySkippedLeft) {
    return (
      <>
        <BrandBar modeLabel={modeLabel} />
        <div className="journey-shell">
          <div className="journey-card panel journey-done">
            <p className="badge badge-warn">quase</p>
            <h1 className="display journey-title">Você pulou o restante</h1>
            <p className="journey-hint">
              As perguntas que você pulou continuam abertas para outras pessoas. Se quiser, pode revisitar as puladas.
            </p>
            <div className="journey-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => {
                  setSkippedIds([]);
                  persistSession({ skipped: [] });
                }}
              >
                Ver perguntas que pulei
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  function pickStep(id: string) {
    setPickedId(id);
    resetAnswer();
    setError(null);
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of incoming) {
        const dup = merged.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified);
        if (!dup) merged.push(f);
      }
      if (merged.length > MAX_UPLOAD_FILES) {
        setError(`No máximo ${MAX_UPLOAD_FILES} arquivos por envio.`);
        return merged.slice(0, MAX_UPLOAD_FILES);
      }
      const check = validateUploadBatch(merged);
      if (!check.ok) setError(check.error);
      else setError(null);
      return merged.slice(0, MAX_UPLOAD_FILES);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length) {
        const check = validateUploadBatch(next);
        if (!check.ok) setError(check.error);
        else setError(null);
      } else setError(null);
      return next;
    });
  }

  const questionCard = step ? (
        <article className="journey-card panel" key={step.id}>
          <p className="journey-section">{step.sectionTitle}</p>
          <h2 className="display journey-question">{step.question}</h2>

          <div className="journey-modes" role="tablist">
            {(
              [
                ["texto", "Texto"],
                ["audio", "Áudio"],
                ["arquivo", "Arquivo"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                className={`journey-mode ${mode === key ? "is-active" : ""}`}
                onClick={() => setMode(key)}
                disabled={pending}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "texto" ? (
            <div className="journey-answer">
              {step.kind === "municipio" ? (
                <div className="journey-fields">
                  <div className="field">
                    <label>Classificação</label>
                    <select value={classificacao} onChange={(e) => setClassificacao(e.target.value)}>
                      <option value="">Selecionar…</option>
                      {CLASSIFICACAO_OPERACAO.map((c) => (
                        <option key={c} value={c}>
                          {c.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="contact-grid">
                    <div className="field">
                      <label>Responsável político</label>
                      <input value={respNome} onChange={(e) => setRespNome(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Telefone</label>
                      <input value={respTel} onChange={(e) => setRespTel(e.target.value)} inputMode="tel" />
                    </div>
                    <div className="field">
                      <label>Coordenador</label>
                      <input value={coordNome} onChange={(e) => setCoordNome(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Telefone</label>
                      <input value={coordTel} onChange={(e) => setCoordTel(e.target.value)} inputMode="tel" />
                    </div>
                  </div>
                  <div className="field">
                    <label>Observações</label>
                    <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
                  </div>
                </div>
              ) : step.type === "boolean" ? (
                <div className="journey-bool">
                  <button
                    type="button"
                    className={`btn ${boolVal === true ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setBoolVal(true)}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    className={`btn ${boolVal === false ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setBoolVal(false)}
                  >
                    Não
                  </button>
                </div>
              ) : step.type === "contact" ? (
                <div className="contact-grid">
                  <div className="field">
                    <label>Nome</label>
                    <input
                      value={contact.nome}
                      onChange={(e) => setContact((c) => ({ ...c, nome: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Telefone</label>
                    <input
                      value={contact.telefone}
                      onChange={(e) => setContact((c) => ({ ...c, telefone: e.target.value }))}
                      inputMode="tel"
                    />
                  </div>
                  <div className="field">
                    <label>Base</label>
                    <input
                      value={contact.base}
                      onChange={(e) => setContact((c) => ({ ...c, base: e.target.value }))}
                    />
                  </div>
                </div>
              ) : (
                <div className="field">
                  <label>Sua resposta</label>
                  <textarea
                    rows={5}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Escreva com suas palavras…"
                    autoFocus
                  />
                </div>
              )}
            </div>
          ) : null}

          {mode === "audio" ? (
            <div className="journey-answer journey-audio">
              <p className="journey-hint">Fale a resposta. Ao enviar, transcrevemos e gravamos nesta pergunta.</p>
              <p className={`recorder-timer ${recording ? "is-live" : ""}`}>{formatMs(elapsedMs)}</p>
              <div className="journey-actions">
                {!recording ? (
                  <button type="button" className="btn btn-record btn-lg" disabled={pending} onClick={() => void startRecording()}>
                    {audioFile ? "Gravar de novo" : "Começar a gravar"}
                  </button>
                ) : (
                  <button type="button" className="btn btn-mint btn-lg" onClick={stopRecording}>
                    Parar
                  </button>
                )}
              </div>
              {audioFile ? <p className="journey-flash">Áudio pronto ({Math.round(audioFile.size / 1024)} KB)</p> : null}
            </div>
          ) : null}

          {mode === "arquivo" ? (
            <div className="journey-answer">
              <p className="journey-hint">
                Envie um ou vários documentos nesta pergunta (PDF, foto, planilha…). Até {MAX_UPLOAD_FILES} arquivos ·{" "}
                {formatBytes(MAX_UPLOAD_FILE_BYTES)} cada.
              </p>
              <div className="field">
                <label htmlFor="journey-files">Arquivos</label>
                <input
                  id="journey-files"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  disabled={pending}
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>
              {files.length > 0 ? (
                <ul className="journey-file-list">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="journey-file-item">
                      <span>
                        <strong>{f.name}</strong>
                        <em>{formatBytes(f.size)}</em>
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={pending}
                        onClick={() => removeFile(i)}
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="field">
                <label>Nota opcional</label>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ex.: organogramas e atas do núcleo"
                />
              </div>
            </div>
          ) : null}

          {error ? <p className="journey-error">{error}</p> : null}

          <div className="journey-sticky-actions">
            <button type="button" className="btn btn-primary btn-lg" disabled={pending} onClick={() => void send()}>
              {pending ? "Enviando…" : shareMode === "escolha" ? "Enviar resposta" : "Enviar · próxima"}
            </button>
            <button type="button" className="btn btn-secondary btn-lg" disabled={pending} onClick={skipCurrent}>
              Pular · não é comigo
            </button>
            <p className="journey-hint">
              Pular só tira da sua fila. A pergunta continua aberta para outra pessoa. Já respondidas ficam fechadas
              para todos.
            </p>
          </div>
        </article>
      ) : null;

  return (
    <>
      <BrandBar modeLabel={modeLabel} />
      <div className={`journey-shell ${showEscolhaLayout ? "journey-shell-split" : ""}`}>
        <header className="journey-top">
          <p className="badge badge-muted">
            {shareMode === "escolha" ? "escolha a pergunta" : "jornada"}
          </p>
          <h1 className="display journey-title">{linkTitle || title}</h1>
          {linkTitle && linkTitle !== title ? <p className="journey-meta">{title}</p> : null}
          {campaignName ? <p className="journey-meta">{campaignName}</p> : null}
          {respondentName.trim() ? (
            <p className="journey-meta">Respondendo como {respondentName.trim()}</p>
          ) : null}
          <div className="journey-bar">
            <div className="mini-bar">
              <i style={{ width: `${progress?.percent ?? 0}%` }} />
            </div>
            <span>
              {totalOpen} pergunta{totalOpen === 1 ? "" : "s"} pra você · sessão {progress?.percent ?? 0}%
            </span>
          </div>
        </header>

        {showEscolhaLayout ? (
          <div className="journey-split">
            <aside className="journey-sidebar panel">
              <h2 className="journey-sidebar-title">Perguntas abertas</h2>
              <p className="journey-hint">
                Toque na lista para responder. Se não for com você, use Pular no painel.
              </p>
              <div className="journey-sidebar-list">
                {openSteps.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`share-pick-item ${pickedId === s.id ? "is-active" : ""}`}
                    onClick={() => pickStep(s.id)}
                  >
                    <strong>{s.sectionTitle}</strong>
                    <span>{s.question}</span>
                  </button>
                ))}
              </div>
            </aside>
            <div className="journey-main">
              <div className="journey-mobile-rail">
                <p className="journey-mobile-rail-label">Deslize e escolha a pergunta</p>
                <div className="journey-chips" ref={chipRailRef}>
                  {openSteps.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      data-chip-id={s.id}
                      className={`journey-chip ${pickedId === s.id ? "is-active" : ""}`}
                      onClick={() => pickStep(s.id)}
                    >
                      <strong>{s.sectionTitle}</strong>
                      <span>{s.question}</span>
                    </button>
                  ))}
                </div>
              </div>
              {questionCard}
            </div>
          </div>
        ) : (
          questionCard
        )}
      </div>
    </>
  );
}
