import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/lib/db";
import { collections, fieldAnswers } from "@/lib/db/schema";
import { listFieldViews } from "@/lib/extract";
import { isFilled } from "@/lib/field-utils";
import { nowDate } from "@/lib/paths";
import { computeCollectionProgress } from "@/lib/progress";
import type { FieldType } from "@/lib/schema-types";
import { resolveShareContext } from "@/lib/share-resolve";
import {
  buildOpenJourneySteps,
  isFieldLockedForIndirect,
  mergeMunicipioPatch,
  parseIndirectAnswer,
} from "@/lib/share";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  await ensureDb();
  const { token } = await params;
  const loaded = await resolveShareContext(token);
  if (!loaded) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  const { collection, campaign, schema, fields, mode, scope, linkTitle } = loaded;
  if (collection.validated) {
    return NextResponse.json({
      closed: true,
      title: collection.title,
      message: "Esta sessão já foi validada. Novas respostas pelo link estão encerradas.",
    });
  }

  const steps = buildOpenJourneySteps(schema, fields, scope);
  const progress = computeCollectionProgress(schema, fields);

  return NextResponse.json({
    closed: false,
    title: collection.title,
    linkTitle,
    mode,
    campaignName: campaign ? `${campaign.name} · ${campaign.state} ${campaign.year}` : null,
    progress,
    openCount: steps.length,
    steps,
  });
}

export async function POST(request: Request, { params }: Params) {
  await ensureDb();
  const { token } = await params;
  const loaded = await resolveShareContext(token);
  if (!loaded) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  const { collection, schema, fields, scope } = loaded;
  if (collection.validated) {
    return NextResponse.json({ error: "Sessão validada — link bloqueado." }, { status: 403 });
  }

  const body = await request.json();
  const stepId = String(body.stepId || "");
  const respondent = String(body.respondentName || "").trim().slice(0, 120) || null;

  const steps = buildOpenJourneySteps(schema, fields, scope);
  const step = steps.find((s) => s.id === stepId);
  if (!step) {
    return NextResponse.json(
      { error: "Esta pergunta já foi respondida por outra pessoa ou não está disponível neste link." },
      { status: 409 },
    );
  }

  const current = fields.find((f) => f.id === step.fieldAnswerId);
  if (!current) return NextResponse.json({ error: "Campo não encontrado." }, { status: 404 });

  if (step.kind === "field" && isFieldLockedForIndirect(current.value, step.type)) {
    return NextResponse.json(
      { error: "Esta pergunta já foi respondida e está bloqueada." },
      { status: 409 },
    );
  }

  let nextValue = current.value;
  if (step.kind === "municipio") {
    if (!step.municipioId) {
      return NextResponse.json({ error: "Município inválido." }, { status: 400 });
    }
    const merged = mergeMunicipioPatch(current.value, step.municipioId, {
      text: body.text,
      classificacao: body.classificacao,
      responsavelNome: body.responsavelNome,
      responsavelTelefone: body.responsavelTelefone,
      coordenadorNome: body.coordenadorNome,
      coordenadorTelefone: body.coordenadorTelefone,
    });
    if (!merged.ok) {
      return NextResponse.json({ error: merged.error }, { status: 409 });
    }
    nextValue = merged.value;
  } else {
    nextValue = parseIndirectAnswer({
      type: step.type as FieldType,
      text: body.text,
      booleanValue: body.booleanValue,
      contact: body.contact,
    });
    if (!isFilled(nextValue)) {
      return NextResponse.json({ error: "Resposta vazia." }, { status: 400 });
    }
  }

  const stamp = nowDate();
  await db
    .update(fieldAnswers)
    .set({
      valueJson: JSON.stringify(nextValue),
      status: "editado",
      evidence: respondent ? `coleta indireta · ${respondent}` : "coleta indireta",
      confidence: "alta",
      updatedAt: stamp,
    })
    .where(eq(fieldAnswers.id, step.fieldAnswerId));

  await db
    .update(collections)
    .set({ status: "revisao", updatedAt: stamp })
    .where(eq(collections.id, collection.id));

  const refreshed = await listFieldViews(collection.id);
  const openSteps = buildOpenJourneySteps(schema, refreshed, scope);
  const progress = computeCollectionProgress(schema, refreshed);

  return NextResponse.json({
    ok: true,
    fieldAnswerId: step.fieldAnswerId,
    openCount: openSteps.length,
    progress,
    steps: openSteps,
  });
}
