import { readFile } from "node:fs/promises";
import path from "node:path";
import { openRouterConfigured, openRouterTranscribe } from "@/lib/ai/openrouter";

export async function transcribeAudioParts(opts: {
  partPaths: string[];
  fallbackPath?: string | null;
  mime?: string | null;
}): Promise<{ transcript: string; engine: string }> {
  if (!openRouterConfigured()) {
    throw new Error("OPENROUTER_API_KEY ausente — não dá para transcrever o áudio.");
  }

  const paths = opts.partPaths.length ? opts.partPaths : opts.fallbackPath ? [opts.fallbackPath] : [];
  if (!paths.length) throw new Error("Nenhum arquivo de áudio para transcrever.");

  const chunks: string[] = [];
  for (let i = 0; i < paths.length; i += 1) {
    const filePath = paths[i];
    const bytes = await readFile(filePath);
    const text = await openRouterTranscribe({
      bytes,
      fileName: path.basename(filePath),
      mime: opts.mime || undefined,
      language: "pt",
    });
    if (text) {
      chunks.push(paths.length > 1 ? `[Parte ${i + 1}]\n${text}` : text);
    }
  }

  const transcript = chunks.join("\n\n").trim();
  if (!transcript) throw new Error("STT não retornou texto. Grave de novo com fala mais clara.");
  return { transcript, engine: "openrouter-whisper" };
}
