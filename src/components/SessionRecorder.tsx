"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onRecordingReady: (file: File | null) => void;
  disabled?: boolean;
};

function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = isIos()
    ? ["audio/mp4", "audio/aac", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function formatMs(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function SessionRecorder({ onRecordingReady, disabled }: Props) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [readyLabel, setReadyLabel] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined",
    );
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function setPreview(url: string | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }

  async function start() {
    setError("");
    setReadyLabel("");
    onRecordingReady(null);
    setPreview(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      });

      recorder.addEventListener("error", () => {
        setError("Falha no gravador. Tente de novo ou envie um arquivo.");
        setRecording(false);
      });

      recorder.addEventListener("stop", () => {
        try {
          const type = (recorder.mimeType || mimeType || "audio/mp4").split(";")[0];
          const blob = new Blob(chunksRef.current, { type });
          if (!blob.size) {
            setError("Gravação vazia. Fale alguns segundos e pare de novo.");
            onRecordingReady(null);
            setReadyLabel("");
            return;
          }

          const ext =
            type.includes("mp4") || type.includes("aac") || type.includes("m4a")
              ? "m4a"
              : type.includes("ogg")
                ? "ogg"
                : "webm";
          const file = new File([blob], `sessao-coleta-${Date.now()}.${ext}`, {
            type: type || "audio/mp4",
          });
          setPreview(URL.createObjectURL(blob));
          onRecordingReady(file);
          setReadyLabel(`Áudio pronto (${Math.max(1, Math.round(blob.size / 1024))} KB). Ouça e envie.`);
        } finally {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      });

      try {
        recorder.start(1000);
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
      setError("Sem acesso ao microfone. Permita o mic e use HTTPS.");
    }
  }

  function stop() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setRecording(false);
      return;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      if (typeof recorder.requestData === "function" && recorder.state === "recording") {
        recorder.requestData();
      }
    } catch {
      // ignore
    }
    recorder.stop();
    setRecording(false);
  }

  function clearRecording() {
    setPreview(null);
    onRecordingReady(null);
    setElapsedMs(0);
    setReadyLabel("");
  }

  if (!supported) {
    return (
      <p className="recorder-fallback">
        Este navegador não grava áudio. Use upload de arquivo ou cole a transcrição.
      </p>
    );
  }

  return (
    <div className="recorder">
      <div className="recorder-head">
        <div>
          <p className="recorder-title">Gravar sessão</p>
          <p className="recorder-hint">1) Iniciar · 2) Parar · 3) Ouvir · 4) Enviar</p>
        </div>
        <p className={`recorder-timer ${recording ? "is-live" : ""}`}>{formatMs(elapsedMs)}</p>
      </div>

      <div className="recorder-actions">
        {!recording ? (
          <button type="button" className="btn btn-record" disabled={disabled} onClick={start}>
            Iniciar gravação
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={stop}>
            Parar e usar áudio
          </button>
        )}
        {previewUrl ? (
          <button type="button" className="btn btn-secondary" onClick={clearRecording}>
            Descartar
          </button>
        ) : null}
      </div>

      {recording ? (
        <p className="recorder-live">
          <span className="recorder-dot" />
          Gravando… fale e toque em Parar.
        </p>
      ) : null}

      {recording && elapsedMs >= 40 * 60_000 ? (
        <p className="recorder-note">
          Sessão longa: o áudio será quebrado automaticamente para transcrição.
        </p>
      ) : null}

      {readyLabel ? <p className="recorder-ready">{readyLabel}</p> : null}

      {previewUrl ? (
        <audio key={previewUrl} controls playsInline preload="metadata" src={previewUrl} className="recorder-audio" />
      ) : null}

      {error ? <p className="recorder-error">{error}</p> : null}
    </div>
  );
}
