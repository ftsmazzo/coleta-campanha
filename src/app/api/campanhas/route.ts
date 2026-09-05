import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { nowDate } from "@/lib/paths";
import { ensureSeedData } from "@/lib/seed";

export async function GET() {
  await ensureSeedData();
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const stamp = nowDate();
  const row = {
    id: uuid(),
    name: String(body.name ?? "").trim() || "Campanha sem nome",
    state: String(body.state ?? "").trim().toUpperCase().slice(0, 2) || "XX",
    candidate: String(body.candidate ?? "").trim() || "A definir",
    year: Number(body.year) || new Date().getFullYear(),
    office: String(body.office ?? "governador").trim(),
    notes: body.notes ? String(body.notes) : null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await db.insert(campaigns).values(row);
  return NextResponse.json(row, { status: 201 });
}
