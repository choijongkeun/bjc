function toCsvScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function shouldPreventFormulaInjection(text: string): boolean {
  if (!text) {
    return false;
  }
  if (!/^[=+\-@]/.test(text)) {
    return false;
  }
  return !/^[+-]?\d+(\.\d+)?$/.test(text);
}

export function escapeCsvCell(value: unknown): string {
  const scalar = toCsvScalar(value);
  const text = shouldPreventFormulaInjection(scalar) ? `'${scalar}` : scalar;
  if (text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) {
    return "";
  }
  const firstRow = rows[0];
  if (!firstRow) {
    return "";
  }
  const headers = Object.keys(firstRow);
  const lines = [
    headers.map((header) => escapeCsvCell(header)).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];
  return lines.join("\n");
}
