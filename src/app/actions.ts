"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import { collections, documentTypes } from "@/lib/db/schema";
import { ensureFieldRows } from "@/lib/extract";
import { nowDate } from "@/lib/paths";
import type { DocumentSchema } from "@/lib/schema-types";

export async function startOnboardingCollection(campaignId: string, documentTypeId: string) {
  const [docType] = await db.select().from(documentTypes).where(eq(documentTypes.id, documentTypeId)).limit(1);
  if (!docType) throw new Error("Tipo não encontrado");

  const stamp = nowDate();
  const id = uuid();
  await db.insert(collections).values({
    id,
    campaignId,
    documentTypeId,
    title: "Onboarding Amapá 2026",
    sourceKind: "texto",
    status: "rascunho",
    audioPath: null,
    audioMime: null,
    audioPartsJson: null,
    transcript: null,
    payloadJson: null,
    errorMessage: null,
    validated: false,
    validatedAt: null,
    createdAt: stamp,
    updatedAt: stamp,
  });
  await ensureFieldRows(id, JSON.parse(docType.schemaJson) as DocumentSchema);
  redirect(`/coletas/${id}`);
}
