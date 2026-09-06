import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/lib/db";
import { fieldAnswers, fieldAttachments } from "@/lib/db/schema";
import { nowDate, uploadsDir } from "@/lib/paths";
import { resolveShareContext } from "@/lib/share-resolve";
import {
  formatBytes,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_TOTAL_BYTES,
} from "@/lib/upload-limits";

type Params = { params: Promise<{ token: string }> };

function collectFiles(form: FormData): File[] {
  const out: File[] = [];
  for (const key of ["file", "files"]) {
    for (const entry of form.getAll(key)) {
      if (entry instanceof File && entry.size >= 0 && entry.name) {
        out.push(entry);
      }
    }
  }
  // Dedup by name+size+lastModified when the same File was appended twice
  const seen = new Set<string>();
  return out.filter((f) => {
    const k = `${f.name}:${f.size}:${f.lastModified}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function saveDocumento(opts: {
  file: File;
  collectionId: string;
  fieldAnswerId: string;
  respondent: string | null;
  stamp: Date;
}) {
  const id = uuid();
  const safeName = opts.file.name.replace(/[^\w.\-()\s]/g, "_").slice(0, 120);
  const dir = path.join(uploadsDir(), opts.collectionId, "anexos", opts.fieldAnswerId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${id}-${safeName}`);
  const bytes = Buffer.from(await opts.file.arrayBuffer());
  await writeFile(filePath, bytes);

  await db.insert(fieldAttachments).values({
    id,
    collectionId: opts.collectionId,
    fieldAnswerId: opts.fieldAnswerId,
    kind: "documento",
    fileName: safeName,
    filePath,
    mime: opts.file.type || "application/octet-stream",
    sizeBytes: bytes.byteLength,
    createdBy: opts.respondent,
    createdAt: opts.stamp,
  });

  return { id, fileName: safeName, sizeBytes: bytes.byteLength };
}

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

  if (kind === "contato") {
    const id = uuid();
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
    const files = collectFiles(form);
    if (files.length === 0) {
      return NextResponse.json({ error: "Envie ao menos um arquivo." }, { status: 400 });
    }
    if (files.length > MAX_UPLOAD_FILES) {
      return NextResponse.json(
        { error: `No máximo ${MAX_UPLOAD_FILES} arquivos por envio.` },
        { status: 400 },
      );
    }

    let total = 0;
    for (const file of files) {
      if (file.size > MAX_UPLOAD_FILE_BYTES) {
        return NextResponse.json(
          {
            error: `"${file.name}" passa de ${formatBytes(MAX_UPLOAD_FILE_BYTES)} (máx. por arquivo).`,
          },
          { status: 400 },
        );
      }
      total += file.size;
    }
    if (total > MAX_UPLOAD_TOTAL_BYTES) {
      return NextResponse.json(
        { error: `O lote passa de ${formatBytes(MAX_UPLOAD_TOTAL_BYTES)} no total.` },
        { status: 400 },
      );
    }

    const saved = [];
    for (const file of files) {
      saved.push(
        await saveDocumento({
          file,
          collectionId: loaded.collection.id,
          fieldAnswerId,
          respondent,
          stamp,
        }),
      );
    }

    return NextResponse.json({
      ok: true,
      kind: "documento",
      count: saved.length,
      attachments: saved,
      // Compatível com clientes antigos (1 arquivo)
      id: saved[0]?.id,
      fileName: saved[0]?.fileName,
    });
  }

  return NextResponse.json({ error: "kind deve ser documento ou contato." }, { status: 400 });
}
