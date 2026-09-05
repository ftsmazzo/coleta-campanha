const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function openRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function openRouterModel(kind: "extract" | "schema" = "extract") {
  if (kind === "schema") {
    return (
      process.env.OPENROUTER_SCHEMA_MODEL?.trim() ||
      process.env.OPENROUTER_MODEL?.trim() ||
      "google/gemini-2.5-flash"
    );
  }
  return (
    process.env.OPENROUTER_EXTRACT_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    "anthropic/claude-sonnet-4"
  );
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
