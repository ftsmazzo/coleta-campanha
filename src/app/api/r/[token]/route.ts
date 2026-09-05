import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/lib/db";
import { campaigns, collections, documentTypes, fieldAnswers } from "@/lib/db/schema";
import { ensureFieldRows, listFieldViews } from "@/lib/extract";
import { isFilled } from "@/lib/field-utils";
import { nowDate } from "@/lib/paths";
import { computeCollectionProgress } from "@/lib/progress";
import type { DocumentSchema, FieldType } from "@/lib/schema-types";
import {
  buildOpenJourneySteps,
  isFieldLockedForIndirect,
  mergeMunicipioPatch,
  parseIndirectAnswer,
} from "@/lib/share";

type Params = { params: Promise<{ token: string }> };

async function loadByToken(token: string) {
  await ensureDb();
  const [collection] = await db
    .select()
    .from(collections)
    .where(eq(collections.shareToken, token))
    .limit(1);
  if (!collection) return null;

  const [docType] = await db
    .select()
    .from(documentTypes)
    .where(eq(documentTypes.id, collection.documentTypeId))
    .limit(1);
  if (!docType) return null;

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, collection.campaignId))
    .limit(1);

  const schema = JSON.parse(docType.schemaJson) as DocumentSchema;
  await ensureFieldRows(collection.id, schema);
  const fields = await listFieldViews(collection.id);
  return { collection, docType, campaign, schema, fields };
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const loaded = await loadByToken(token);
  if (!loaded) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  const { collection, campaign, schema, fields } = loaded;
  if (collection.validated) {
    return NextResponse.json({
      closed: true,
      title: collection.title,
      message: "Esta sessão já foi validada. Novas respostas pelo link estão encerradas.",
    });
  }

  const steps = buildOpenJourneySteps(schema, fields);
  const progress = computeCollectionProgress(schema, fields);

  return NextResponse.json({
    closed: false,
    title: collection.title,
    campaignName: campaign ? `${campaign.name} · ${campaign.state} ${campaign.year}` : null,
    progress,
    openCount: steps.length,
    steps,
  });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const loaded = await loadByToken(token);
  if (!loaded) return NextResponse.json({ error: "Link inválido ou expirado." }, { status: 404 });

  const { collection, schema, fields } = loaded;
  if (collection.validated) {
    return NextResponse.json({ error: "Sessão validada — link bloqueado." }, { status: 403 });
  }

  const body = await request.json();
  const stepId = String(body.stepId || "");
  const respondent = String(body.respondentName || "").trim().slice(0, 120) || null;

  const steps = buildOpenJourneySteps(schema, fields);
  const step = steps.find((s) => s.id === stepId);
  if (!step) {
    return NextResponse.json(
      { error: "Esta pergunta já foi respondida por outra pessoa ou não está disponível." },
      { status: 409 },
    );
  }

  const [row] = await db.select().from(fieldAnswers).where(eq(fieldAnswers.id, step.fieldAnswerId)).limit(1);
  if (!row) return NextResponse.json({ error: "Campo não encontrado." }, { status: 404 });

  const currentFields = await listFieldViews(collection.id);
  const current = currentFields.find((f) => f.id === step.fieldAnswerId);
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
  const openSteps = buildOpenJourneySteps(schema, refreshed);
  const progress = computeCollectionProgress(schema, refreshed);

  return NextResponse.json({
    ok: true,
    fieldAnswerId: step.fieldAnswerId,
    openCount: openSteps.length,
    progress,
    steps: openSteps,
  });
}
