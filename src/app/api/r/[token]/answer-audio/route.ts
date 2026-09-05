import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, ensureDb } from "@/lib/db";
import { collections, documentTypes, fieldAnswers, fieldAttachments } from "@/lib/db/schema";
import { listFieldViews } from "@/lib/extract";
import { isFilled } from "@/lib/field-utils";
import { nowDate, uploadsDir } from "@/lib/paths";
import type { DocumentSchema, FieldType } from "@/lib/schema-types";
import {
  buildOpenJourneySteps,
  isFieldLockedForIndirect,
  mergeMunicipioPatch,
  parseIndirectAnswer,
} from "@/lib/share";
import { openRouterConfigured, openRouterTranscribe } from "@/lib/ai/openrouter";

type Params = { params: Promise<{ token: string }> };

/** Resposta por áudio na jornada: STT → grava no campo (se ainda aberto). */
export async function POST(request: Request, { params }: Params) {
  await ensureDb();
  const { token } = await params;
  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.shareToken, token))
    .limit(1);
  if (!collection) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (collection.validated) {
    return NextResponse.json({ error: "Sessão validada — link bloqueado." }, { status: 403 });
  }
  if (!openRouterConfigured()) {
    return NextResponse.json({ error: "STT não configurado neste ambiente." }, { status: 503 });
  }

  const form = await request.formData();
  const stepId = String(form.get("stepId") || "");
  const respondent = String(form.get("respondentName") || "").trim().slice(0, 120) || null;
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Envie o áudio." }, { status: 400 });
  }

  const [docType] = await db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.id, collection.documentTypeId))
    .limit(1);
  if (!docType) return NextResponse.json({ error: "Tipo ausente." }, { status: 404 });
  const schema = JSON.parse(docType.schemaJson) as DocumentSchema;
  const fields = await listFieldViews(collection.id);
  const steps = buildOpenJourneySteps(schema, fields);
  const step = steps.find((s) => s.id === stepId);
  if (!step) {
    return NextResponse.json(
      { error: "Esta pergunta já foi respondida ou não está disponível." },
      { status: 409 },
    );
  }

  const current = fields.find((f) => f.id === step.fieldAnswerId);
  if (!current) return NextResponse.json({ error: "Campo não encontrado." }, { status: 404 });
  if (step.kind === "field" && isFieldLockedForIndirect(current.value, step.type)) {
    return NextResponse.json({ error: "Pergunta bloqueada." }, { status: 409 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const transcript = await openRouterTranscribe({
    bytes,
    fileName: file.name || "resposta.webm",
    mime: file.type,
    language: "pt",
  });
  if (!transcript.trim()) {
    return NextResponse.json({ error: "Não deu para transcrever. Tente de novo ou use texto." }, { status: 400 });
  }

  let nextValue = current.value;
  if (step.kind === "municipio" && step.municipioId) {
    const merged = mergeMunicipioPatch(current.value, step.municipioId, {
      text: transcript,
      classificacao: "em_implantacao",
      responsavelNome: "Ver áudio/transcrição",
    });
    if (!merged.ok) return NextResponse.json({ error: merged.error }, { status: 409 });
    nextValue = merged.value;
  } else if (step.type === "contact") {
    nextValue = { nome: transcript.slice(0, 200), telefone: "", base: "áudio" };
  } else if (step.type === "boolean") {
    nextValue = /sim|positivo|já|pronto|ok/i.test(transcript);
  } else {
    nextValue = parseIndirectAnswer({ type: step.type as FieldType, text: transcript });
  }

  if (step.kind === "field" && !isFilled(nextValue)) {
    return NextResponse.json({ error: "Transcrição vazia após processamento." }, { status: 400 });
  }

  const stamp = nowDate();
  await db
    .update(fieldAnswers)
    .set({
      valueJson: JSON.stringify(nextValue),
      status: "editado",
      evidence: respondent ? `coleta indireta · áudio · ${respondent}` : "coleta indireta · áudio",
      confidence: "media",
      updatedAt: stamp,
    })
    .where(eq(fieldAnswers.id, step.fieldAnswerId));

  // Guarda o áudio original como anexo
  const attachId = uuid();
  const dir = path.join(uploadsDir(), collection.id, "anexos", step.fieldAnswerId);
  await mkdir(dir, { recursive: true });
  const safeName = (file.name || "audio.webm").replace(/[^\w.\-()\s]/g, "_").slice(0, 120);
  const filePath = path.join(dir, `${attachId}-${safeName}`);
  await writeFile(filePath, bytes);
  await db.insert(fieldAttachments).values({
    id: attachId,
    collectionId: collection.id,
    fieldAnswerId: step.fieldAnswerId,
    kind: "documento",
    fileName: safeName,
    filePath,
    mime: file.type || "audio/webm",
    sizeBytes: bytes.byteLength,
    createdBy: respondent,
    createdAt: stamp,
  });

  await db
    .update(collections)
    .set({ status: "revisao", updatedAt: stamp })
    .where(eq(collections.id, collection.id));

  const refreshed = await listFieldViews(collection.id);
  const openSteps = buildOpenJourneySteps(schema, refreshed);

  return NextResponse.json({
    ok: true,
    transcript,
    fieldAnswerId: step.fieldAnswerId,
    openCount: openSteps.length,
    steps: openSteps,
  });
}
