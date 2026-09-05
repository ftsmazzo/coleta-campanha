import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { db, ensureDb } from "@/lib/db";
import { fieldAnswers, fieldAttachments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nowDate, uploadsDir } from "@/lib/paths";
import { resolveShareContext } from "@/lib/share-resolve";

type Params = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: Params) {
  await ensureDb();
  const { token } = await params;
  const loaded = await resolveShareContext(token);
  if (!loaded) return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  if (loaded.collection.validated) {
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
  if (!fieldRow || fieldRow.collectionId !== loaded.collection.id) {
    return NextResponse.json({ error: "Campo inválido." }, { status: 404 });
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
      collectionId: loaded.collection.id,
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
    const dir = path.join(uploadsDir(), loaded.collection.id, "anexos", fieldAnswerId);
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${id}-${safeName}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, bytes);

    await db.insert(fieldAttachments).values({
      id,
      collectionId: loaded.collection.id,
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
