import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

/** ~12 min a 48 kbps mono fica abaixo do teto típico de 24 MB do Whisper. */
export const STT_CHUNK_SECONDS = 12 * 60;
export const STT_SPLIT_DURATION_SECONDS = 16 * 60;
export const STT_SPLIT_SIZE_BYTES = 18 * 1024 * 1024;

const FFMPEG_TIMEOUT_MS = 240_000;
const MIN_PART_BYTES = 2048;

function resolveFfmpegBin() {
  if (process.env.FFMPEG_BIN && existsSync(process.env.FFMPEG_BIN)) return process.env.FFMPEG_BIN;
  if (typeof ffmpegPath === "string" && existsSync(ffmpegPath)) return ffmpegPath;
  return "ffmpeg";
}

export function shouldSplitAudio(sizeBytes: number, durationSeconds: number | null) {
  if (durationSeconds != null && durationSeconds > STT_SPLIT_DURATION_SECONDS) return true;
  return sizeBytes > STT_SPLIT_SIZE_BYTES;
}

function runFfmpeg(args: string[], ignoreExit = false): Promise<string> {
  const bin = resolveFfmpegBin();

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg excedeu o tempo limite ao preparar o áudio."));
    }, FFMPEG_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (ignoreExit || code === 0) {
        resolve(stderr);
        return;
      }
      reject(new Error(`ffmpeg saiu com código ${code}: ${stderr.slice(-800)}`));
    });
  });
}

export async function probeDurationSeconds(inputPath: string): Promise<number | null> {
  try {
    const stderr = await runFfmpeg(["-hide_banner", "-i", inputPath], true);
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return null;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  } catch {
    return null;
  }
}

export async function splitAudioToMp3Chunks(inputPath: string, outDir: string): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const pattern = path.join(outDir, "part-%03d.mp3");
  await runFfmpeg([
    "-hide_banner",
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "48k",
    "-f",
    "segment",
    "-segment_time",
    String(STT_CHUNK_SECONDS),
    "-reset_timestamps",
    "1",
    pattern,
  ]);

  const names = (await readdir(outDir))
    .filter((name) => name.startsWith("part-") && name.endsWith(".mp3"))
    .sort();

  const kept: string[] = [];
  for (const name of names) {
    const full = path.join(outDir, name);
    const info = await stat(full);
    if (info.size >= MIN_PART_BYTES) kept.push(full);
  }
  return kept;
}

export function extensionForAudioMime(mime: string | null | undefined) {
  const m = (mime || "").toLowerCase().split(";")[0].trim();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg") || m.includes("oga")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m === "audio/mpeg" || m === "audio/mp3" || m.includes("mpga")) return "mp3";
  if (m.includes("flac")) return "flac";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  return "webm";
}

export type AudioPrepResult = {
  chunked: boolean;
  durationSeconds: number | null;
  partPaths: string[];
  sizeBytes: number;
};

/** Prepara áudio longo: probe + split quando necessário. */
export async function prepareLongAudio(opts: {
  inputPath: string;
  sizeBytes: number;
  partsDir: string;
}): Promise<AudioPrepResult> {
  const durationSeconds = await probeDurationSeconds(opts.inputPath);
  const needsSplit = shouldSplitAudio(opts.sizeBytes, durationSeconds);

  if (!needsSplit) {
    return {
      chunked: false,
      durationSeconds,
      partPaths: [opts.inputPath],
      sizeBytes: opts.sizeBytes,
    };
  }

  const partPaths = await splitAudioToMp3Chunks(opts.inputPath, opts.partsDir);
  if (!partPaths.length) {
    throw new Error("Não foi possível quebrar o áudio em partes.");
  }

  return {
    chunked: partPaths.length > 1,
    durationSeconds,
    partPaths,
    sizeBytes: opts.sizeBytes,
  };
}
