"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CLASSIFICACAO_OPERACAO } from "@/lib/municipios";
import type { JourneyStep } from "@/lib/share";

type Progress = { total: number; filled: number; percent: number; missing: number };
type AnswerMode = "texto" | "audio" | "arquivo";
type Props = { token: string };

function formatMs(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function IndirectJourney({ token }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [closedMsg, setClosedMsg] = useState("");
  const [title, setTitle] = useState("");
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [steps, setSteps] = useState<JourneyStep[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [respondentName, setRespondentName] = useState("");
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<AnswerMode>("texto");

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
  const [file, setFile] = useState<File | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const step = steps[0] ?? null;
  const done = !loading && !closed && !error && steps.length === 0;
  const totalOpen = steps.length;

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
    setCampaignName(data.campaignName || null);
    setSteps(data.steps || []);
    setProgress(data.progress || null);
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
    setFile(null);
    setRecording(false);
    setElapsedMs(0);
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
        resetAnswer();
        setPending(false);
        return;
      }

      if (mode === "arquivo") {
        if (!file) {
          setError("Escolha um arquivo.");
          setPending(false);
          return;
        }
        const note = text.trim() || `Arquivo enviado: ${file.name}`;
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
          setError(data.error || "Falha ao salvar");
          if (res.status === 409) await load();
          setPending(false);
          return;
        }

        const fd = new FormData();
        fd.set("kind", "documento");
        fd.set("fieldAnswerId", data.fieldAnswerId);
        fd.set("file", file);
        if (respondentName) fd.set("respondentName", respondentName);
        await fetch(`/api/r/${token}/attach`, { method: "POST", body: fd });

        setSteps(data.steps || []);
        setProgress(data.progress || null);
        resetAnswer();
        setPending(false);
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
      resetAnswer();
      setPending(false);
    } catch {
      setPending(false);
      setError("Erro de rede. Tente de novo.");
    }
  }

  if (loading) {
    return <div className="journey-shell panel">Carregando jornada…</div>;
  }

  if (error && !step && !done) {
    return (
      <div className="journey-shell panel">
        <h1 className="display journey-title">Link indisponível</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (closed) {
    return (
      <div className="journey-shell panel">
        <p className="badge">encerrado</p>
        <h1 className="display journey-title">{title || "Onboarding"}</h1>
        <p>{closedMsg}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="journey-shell panel journey-done">
        <p className="badge">obrigado</p>
        <h1 className="display journey-title">Pronto por aqui</h1>
        <p>Não há mais perguntas abertas neste link. O que já estava respondido ficou bloqueado.</p>
        {progress ? (
          <p className="journey-meta">
            Sessão: {progress.filled}/{progress.total} · {progress.percent}%
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="journey-shell">
      <header className="journey-top">
        <p className="badge badge-muted">jornada</p>
        <h1 className="display journey-title">{title}</h1>
        {campaignName ? <p className="journey-meta">{campaignName}</p> : null}
        <div className="journey-bar">
          <div className="mini-bar">
            <i style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
          <span>
            {totalOpen} pergunta{totalOpen === 1 ? "" : "s"} aberta{totalOpen === 1 ? "" : "s"} · sessão{" "}
            {progress?.percent ?? 0}%
          </span>
        </div>
      </header>

      <div className="field journey-who">
        <label htmlFor="who">Seu nome (opcional)</label>
        <input
          id="who"
          value={respondentName}
          onChange={(e) => setRespondentName(e.target.value)}
          placeholder="Ex.: Ana — comunicação"
        />
      </div>

      {step ? (
        <article className="journey-card panel">
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
                      <input value={respTel} onChange={(e) => setRespTel(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Coordenador</label>
                      <input value={coordNome} onChange={(e) => setCoordNome(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Telefone</label>
                      <input value={coordTel} onChange={(e) => setCoordTel(e.target.value)} />
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
                  <button type="button" className="btn btn-record" disabled={pending} onClick={() => void startRecording()}>
                    {audioFile ? "Gravar de novo" : "Começar a gravar"}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={stopRecording}>
                    Parar
                  </button>
                )}
              </div>
              {audioFile ? <p className="journey-flash">Áudio pronto ({Math.round(audioFile.size / 1024)} KB)</p> : null}
            </div>
          ) : null}

          {mode === "arquivo" ? (
            <div className="journey-answer">
              <p className="journey-hint">Envie um documento nesta pergunta (PDF, foto, planilha…).</p>
              <div className="field">
                <label>Arquivo</label>
                <input type="file" disabled={pending} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <div className="field">
                <label>Nota opcional</label>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ex.: organograma enviado pelo Pedro"
                />
              </div>
            </div>
          ) : null}

          {error ? <p className="journey-error">{error}</p> : null}

          <div className="journey-actions journey-send">
            <button type="button" className="btn btn-primary btn-lg" disabled={pending} onClick={() => void send()}>
              {pending ? "Enviando…" : "Enviar · próxima pergunta"}
            </button>
          </div>
        </article>
      ) : null}
    </div>
  );
}
