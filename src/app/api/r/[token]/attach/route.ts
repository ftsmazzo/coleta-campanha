import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, ensureDb } from "@/lib/db";
import { collections, fieldAnswers, fieldAttachments } from "@/lib/db/schema";
import { listFieldViews } from "@/lib/extract";
import { nowDate, uploadsDir } from "@/lib/paths";
import { buildOpenJourneySteps, isFieldLockedForIndirect } from "@/lib/share";
import type { DocumentSchema } from "@/lib/schema-types";
import { documentTypes } from "@/lib/db/schema";

type Params = { params: Promise<{ token: string }> };

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
    return NextResponse.json({ error: "Sessão validada — anexos bloqueados." }, { status: 403 });
  }

  const form = await request.formData();
  const fieldAnswerId = String(form.get("fieldAnswerId") || "");
  const kind = String(form.get("kind") || "");
  const respondent = String(form.get("respondentName") || "").trim().slice(0, 120) || null;

  if (!fieldAnswerId) {
    return NextResponse.json({ error: "fieldAnswerId obrigatório." }, { status: 400 });
  }

  const [fieldRow] = await db
    .select()
    .from(fieldAnswers)
    .where(eq(fieldAnswers.id, fieldAnswerId))
    .limit(1);
  if (!fieldRow || fieldRow.collectionId !== collection.id) {
    return NextResponse.json({ error: "Campo inválido." }, { status: 404 });
  }

  const [docType] = await db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.id, collection.documentTypeId))
    .limit(1);
  const schema = docType ? (JSON.parse(docType.schemaJson) as DocumentSchema) : { sections: [] };
  const fields = await listFieldViews(collection.id);
  const view = fields.find((f) => f.id === fieldAnswerId);
  const schemaField = schema.sections
    .flatMap((s) => s.fields.map((f) => ({ ...f, sectionKey: s.key })))
    .find((f) => f.sectionKey === fieldRow.sectionKey && f.key === fieldRow.fieldKey);

  // Permite anexo só se o passo ainda está aberto OU acabou de ser respondido nesta rodada
  // (anexo junto da resposta). Bloqueia se campo simples já estava filled antes.
  const open = buildOpenJourneySteps(schema, fields);
  const stillOpen = open.some((s) => s.fieldAnswerId === fieldAnswerId);
  if (
    schemaField &&
    schemaField.type !== "municipio_blocks" &&
    view &&
    isFieldLockedForIndirect(view.value, schemaField.type) &&
    !stillOpen
  ) {
    // Campo locked e não está nos steps abertos — ok se status editado recente via indireta
    // Ainda assim permitimos anexo se o cliente acabou de salvar (mesmo fieldAnswerId na mesma sessão UX).
    // Regra dura: se filled E evidence não é coleta indireta, bloqueia.
    if (!fieldRow.evidence?.includes("coleta indireta")) {
      return NextResponse.json({ error: "Campo bloqueado para alteração/anexo." }, { status: 409 });
    }
  }

  const stamp = nowDate();
  const id = uuid();

  if (kind === "contato") {
    const contact = {
      nome: String(form.get("nome") || "").trim(),
      telefone: String(form.get("telefone") || "").trim(),
      base: String(form.get("base") || "").trim(),
    };
    if (!contact.nome && !contact.telefone) {
      return NextResponse.json({ error: "Informe ao menos nome ou telefone do contato." }, { status: 400 });
    }
    await db.insert(fieldAttachments).values({
      id,
      collectionId: collection.id,
      fieldAnswerId,
      kind: "contato",
      contactJson: JSON.stringify(contact),
      createdBy: respondent,
      createdAt: stamp,
    });
    return NextResponse.json({ ok: true, id, kind: "contato" });
  }

  if (kind === "documento") {
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie o arquivo." }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo acima de 15 MB." }, { status: 400 });
    }
    const safeName = file.name.replace(/[^\w.\-()\s]/g, "_").slice(0, 120);
    const dir = path.join(uploadsDir(), collection.id, "anexos", fieldAnswerId);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${id}-${safeName}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, bytes);

    await db.insert(fieldAttachments).values({
      id,
      collectionId: collection.id,
      fieldAnswerId,
      kind: "documento",
      fileName: safeName,
      filePath,
      mime: file.type || "application/octet-stream",
      sizeBytes: bytes.byteLength,
      createdBy: respondent,
      createdAt: stamp,
    });
    return NextResponse.json({ ok: true, id, kind: "documento", fileName: safeName });
  }

  return NextResponse.json({ error: "kind deve ser documento ou contato." }, { status: 400 });
}
