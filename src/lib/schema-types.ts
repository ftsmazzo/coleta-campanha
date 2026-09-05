import { z } from "zod";

export const fieldTypeSchema = z.enum([
  "text",
  "textarea",
  "list",
  "contact",
  "contact_list",
  "boolean",
  "date",
  "select",
]);

export const schemaFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: fieldTypeSchema.default("text"),
  required: z.boolean().default(false),
  hint: z.string().optional(),
  options: z.array(z.string()).optional(),
});

export const schemaSectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(schemaFieldSchema).min(1),
});

export const documentSchemaSchema = z.object({
  sections: z.array(schemaSectionSchema).min(1),
});

export type FieldType = z.infer<typeof fieldTypeSchema>;
export type SchemaField = z.infer<typeof schemaFieldSchema>;
export type SchemaSection = z.infer<typeof schemaSectionSchema>;
export type DocumentSchema = z.infer<typeof documentSchemaSchema>;

export type Confidence = "alta" | "media" | "baixa" | null;

export type FieldAnswerValue =
  | string
  | string[]
  | boolean
  | null
  | { nome?: string; telefone?: string; base?: string; [k: string]: unknown }
  | { nome?: string; telefone?: string; base?: string; [k: string]: unknown }[];

export type FieldAnswerView = {
  id: string;
  sectionKey: string;
  fieldKey: string;
  label: string;
  value: FieldAnswerValue;
  confidence: Confidence;
  evidence: string | null;
  status: "vazio" | "sugerido" | "aceito" | "editado" | "pendente";
};
