import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { collections, documentTypes } from "@/lib/db/schema";
import { extensionForAudioMime, prepareLongAudio } from "@/lib/audio/split-audio";
import { applyExtractionToFields, extractAgainstSchema } from "@/lib/extract";
import { nowDate, tmpDir, uploadsDir } from "@/lib/paths";
import type { DocumentSchema } from "@/lib/schema-types";
import { transcribeAudioParts } from "@/lib/stt";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const [collection] = await db.select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!collection?.audioPath) {
    return NextResponse.json({ error: "Áudio não encontrado nesta sessão." }, { status: 404 });
  }

  try {
    const bytes = await readFile(collection.audioPath);
    const mime = collection.audioMime || "audio/webm";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `inline; filename="sessao-${id}${path.extname(collection.audioPath) || ".webm"}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo de áudio ausente no disco." }, { status: 404 });
  }
}

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
        status: "transcrevendo",
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

    const { transcript, engine: sttEngine } = await transcribeAudioParts({
      partPaths: prep.partPaths,
      fallbackPath: audioPath,
      mime,
    });

    await db
      .update(collections)
      .set({
        transcript,
        status: "extraindo",
        updatedAt: nowDate(),
      })
      .where(eq(collections.id, id));

    const [docType] = await db
      .select()
      .from(documentTypes)
      .where(eq(documentTypes.id, collection.documentTypeId))
      .limit(1);

    let fieldsSuggested = 0;
    let extractEngine = "none";
    if (docType) {
      const schema = JSON.parse(docType.schemaJson) as DocumentSchema;
      const extracted = await extractAgainstSchema({ schema, transcript });
      fieldsSuggested = await applyExtractionToFields(id, extracted, { onlyEmpty: true });
      extractEngine = "openrouter";
    }

    await db
      .update(collections)
      .set({
        status: "revisao",
        updatedAt: nowDate(),
      })
      .where(eq(collections.id, id));

    return NextResponse.json({
      ok: true,
      chunked: prep.chunked,
      partCount: prep.partPaths.length,
      durationSeconds: prep.durationSeconds,
      sizeBytes: prep.sizeBytes,
      transcript,
      fieldsSuggested,
      sttEngine,
      extractEngine,
      hasAudio: true,
      note:
        fieldsSuggested > 0
          ? `Áudio transcrito e IA sugeriu ${fieldsSuggested} campo(s). Revise no formulário.`
          : "Áudio transcrito. A IA não achou evidência explícita — revise a transcrição e complete manualmente.",
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
