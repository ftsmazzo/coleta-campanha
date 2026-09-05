import { NextResponse } from "next/server";
import { buildSchemaFromText } from "@/lib/schema-from-text";

/** Preview: cola texto → schema sem persistir. */
export async function POST(request: Request) {
  const body = await request.json();
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Texto vazio." }, { status: 400 });
  const built = await buildSchemaFromText(text, body.name ? String(body.name) : "documento");
  return NextResponse.json(built);
}
