const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function openRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function openRouterModel(kind: "extract" | "schema" | "stt" = "extract") {
  if (kind === "schema") {
    return (
      process.env.OPENROUTER_SCHEMA_MODEL?.trim() ||
      process.env.OPENROUTER_MODEL?.trim() ||
      "google/gemini-2.5-flash"
    );
  }
  if (kind === "stt") {
    return process.env.OPENROUTER_STT_MODEL?.trim() || "openai/whisper-large-v3";
  }
  return (
    process.env.OPENROUTER_EXTRACT_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "anthropic/claude-sonnet-4"
  );
}

export async function openRouterTranscribe(opts: {
  bytes: Buffer;
  fileName: string;
  mime?: string;
  language?: string;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada.");

  const format = sttFormatFromName(opts.fileName, opts.mime);
  const body = {
    model: openRouterModel("stt"),
    language: opts.language || "pt",
    input_audio: {
      data: opts.bytes.toString("base64"),
      format,
    },
  };

  const res = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://coleta-campanha.local",
      "X-Title": "Coleta Campanha",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`STT OpenRouter ${res.status}: ${err.slice(0, 400)}`);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}

function sttFormatFromName(fileName: string, mime?: string) {
  const lower = `${fileName} ${mime || ""}`.toLowerCase();
  if (lower.includes("wav")) return "wav";
  if (lower.includes("mp3") || lower.includes("mpeg")) return "mp3";
  if (lower.includes("m4a") || lower.includes("mp4") || lower.includes("aac")) return "m4a";
  if (lower.includes("ogg")) return "ogg";
  if (lower.includes("flac")) return "flac";
  return "webm";
}

export async function openRouterChat(opts: {
  model: string;
  system?: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada.");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://coleta-campanha.local",
      "X-Title": "Coleta Campanha",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() || "";
}
