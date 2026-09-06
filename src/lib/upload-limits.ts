/** Limites de upload de documentos na coleta indireta e anexos. */
export const MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024; // 50 MB por arquivo
export const MAX_UPLOAD_FILES = 20;
export const MAX_UPLOAD_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB no lote

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateUploadBatch(files: File[]) {
  if (files.length === 0) {
    return { ok: false as const, error: "Escolha ao menos um arquivo." };
  }
  if (files.length > MAX_UPLOAD_FILES) {
    return {
      ok: false as const,
      error: `No máximo ${MAX_UPLOAD_FILES} arquivos por envio.`,
    };
  }
  let total = 0;
  for (const file of files) {
    if (file.size > MAX_UPLOAD_FILE_BYTES) {
      return {
        ok: false as const,
        error: `"${file.name}" passa de ${formatBytes(MAX_UPLOAD_FILE_BYTES)} (máx. por arquivo).`,
      };
    }
    total += file.size;
  }
  if (total > MAX_UPLOAD_TOTAL_BYTES) {
    return {
      ok: false as const,
      error: `O lote passa de ${formatBytes(MAX_UPLOAD_TOTAL_BYTES)} no total.`,
    };
  }
  return { ok: true as const, total };
}
