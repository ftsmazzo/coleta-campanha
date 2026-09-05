import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections } from "@/lib/db/schema";
import { extensionForAudioMime, prepareLongAudio } from "@/lib/audio/split-audio";
import { nowDate, tmpDir, uploadsDir } from "@/lib/paths";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection) return NextResponse.json({ error: "Coleta não encontrada." }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o arquivo em 'file'." }, { status: 400 });
  }

  await mkdir(uploadsDir(), { recursive: true });
  const mime = file.type || "application/octet-stream";
  const ext = extensionForAudioMime(mime);
  const audioPath = path.join(uploadsDir(), id, `original.${ext}`);
  await mkdir(path.dirname(audioPath), { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(audioPath, bytes);

  const stamp = nowDate();
  await db
    .update(collections)
    .set({
      sourceKind: "audio",
      status: "preparando_audio",
      audioPath,
      audioMime: mime,
      errorMessage: null,
      updatedAt: stamp,
    })
    .where(eq(collections.id, id));

  try {
    const partsDir = path.join(tmpDir(), id, "parts");
    const prep = await prepareLongAudio({
      inputPath: audioPath,
      sizeBytes: bytes.length,
      partsDir,
    });

    await db
      .update(collections)
      .set({
        status: "audio_pronto",
        audioPartsJson: JSON.stringify({
          chunked: prep.chunked,
          durationSeconds: prep.durationSeconds,
          partPaths: prep.partPaths,
          partCount: prep.partPaths.length,
          sizeBytes: prep.sizeBytes,
        }),
        updatedAt: nowDate(),
      })
      .where(eq(collections.id, id));

    return NextResponse.json({
      ok: true,
      chunked: prep.chunked,
      partCount: prep.partPaths.length,
      durationSeconds: prep.durationSeconds,
      sizeBytes: prep.sizeBytes,
      note: prep.chunked
        ? "Áudio longo dividido em partes para STT. Cole a transcrição ou conecte o webhook STT depois."
        : "Áudio pronto sem divisão.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao preparar áudio.";
    await db
      .update(collections)
      .set({ status: "erro", errorMessage: message, updatedAt: nowDate() })
      .where(eq(collections.id, id));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
