export type CsvCell = string | number | boolean | null | undefined;

/** Escape a single CSV cell per RFC 4180 (quote when needed, double quotes). */
function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Build a CSV document from a header row and data rows.
 * Prepends a UTF-8 BOM so Excel opens non-ASCII (e.g. Rupiah, nama toko) correctly.
 */
export function rowsToCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
}
