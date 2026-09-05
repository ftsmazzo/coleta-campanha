import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { documentTypes } from "@/lib/db/schema";
import { nowDate } from "@/lib/paths";
import { buildSchemaFromText } from "@/lib/schema-from-text";
import { documentSchemaSchema } from "@/lib/schema-types";
import { ensureSeedData } from "@/lib/seed";

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export async function GET() {
  await ensureSeedData();
  const rows = await db.select().from(documentTypes).orderBy(desc(documentTypes.createdAt));
  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      schema: JSON.parse(r.schemaJson),
    })),
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const stamp = nowDate();
  const name = String(body.name ?? "").trim() || "Tipo sem nome";
  const slug = String(body.slug ?? slugify(name) || `tipo_${Date.now()}`);

  let schemaJson: string;
  let sourceText: string | null = body.sourceText ? String(body.sourceText) : null;
  let engine: string | null = null;

  if (body.sourceText && !body.schema) {
    const built = await buildSchemaFromText(String(body.sourceText), name);
    schemaJson = JSON.stringify(built.schema);
    engine = built.engine;
  } else if (body.schema) {
    schemaJson = JSON.stringify(documentSchemaSchema.parse(body.schema));
  } else {
    return NextResponse.json({ error: "Informe sourceText ou schema." }, { status: 400 });
  }

  const row = {
    id: uuid(),
    slug,
    name,
    description: body.description ? String(body.description) : null,
    version: 1,
    schemaJson,
    sourceText,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await db.insert(documentTypes).values(row);
  return NextResponse.json(
    { ...row, schema: JSON.parse(row.schemaJson), engine },
    { status: 201 },
  );
}
