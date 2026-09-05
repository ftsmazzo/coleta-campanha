import type { FieldAnswerValue, FieldAnswerView } from "@/lib/schema-types";

export function valueToText(value: FieldAnswerView["value"]): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string")) return (value as string[]).join("\n");
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "object") {
    const o = value as { nome?: string; telefone?: string; base?: string; nota?: string };
    if ("nome" in o || "telefone" in o || "base" in o) {
      return [o.nome, o.telefone, o.base].filter(Boolean).join(" | ") + (o.nota ? `\n${o.nota}` : "");
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function isFilled(value: FieldAnswerView["value"]): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return Object.values(o).some((v) => String(v ?? "").trim().length > 0);
  }
  return false;
}

export function textToValue(text: string, type: string): FieldAnswerValue {
  const t = text.trim();
  if (!t) return null;
  if (type === "boolean") return /^(sim|true|1|yes)$/i.test(t);
  if (type === "list") return t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (type === "contact") {
    const [nome, telefone, base] = t.split("|").map((x) => x.trim());
    return { nome: nome || "", telefone: telefone || "", base: base || "" };
  }
  if (type === "contact_list") {
    return t.split(/\n+/).map((line) => {
      const [nome, telefone, base] = line.split("|").map((x) => x.trim());
      return { nome: nome || "", telefone: telefone || "", base: base || "" };
    });
  }
  return t;
}

export type ContactValue = { nome?: string; telefone?: string; base?: string; nota?: string };
