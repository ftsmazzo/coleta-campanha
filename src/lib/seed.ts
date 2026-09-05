import { v4 as uuid } from "uuid";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/lib/db";
import { campaigns, documentTypes } from "@/lib/db/schema";
import { buildOnboardingAmapaSchema } from "@/lib/onboarding-amapa";
import { nowDate } from "@/lib/paths";

export async function ensureSeedData() {
  await ensureDb();
  const stamp = nowDate();

  const [existingType] = await db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.slug, "onboarding_campanha"))
    .limit(1);

  if (!existingType) {
    await db.insert(documentTypes).values({
      id: uuid(),
      slug: "onboarding_campanha",
      name: "Onboarding de campanha",
      description: "Checklist operacional para Coordenação Geral — visão integrada da operação.",
      version: 1,
      schemaJson: JSON.stringify(buildOnboardingAmapaSchema()),
      sourceText: "Seed Amapá 2026 / Inteligência Eleitoral Onboarding V4.2",
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  const [existingCampaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.state, "AP"))
    .limit(1);

  if (!existingCampaign) {
    await db.insert(campaigns).values({
      id: uuid(),
      name: "Campanha Amapá 2026",
      state: "AP",
      candidate: "A definir",
      year: 2026,
      office: "governador",
      notes: "Campanha piloto para o módulo Coleta Campanha.",
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
}
