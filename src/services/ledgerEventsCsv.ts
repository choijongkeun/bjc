import { validationError } from "../domain/errors.js";

import type { LedgerEventInput } from "../../shared/bjc-types.js";

export type ImportedLedgerEvent = LedgerEventInput & {
  row_number: number;
};

const requiredHeaders = [
  "reference_id",
  "account_id",
  "product_id",
  "event_time",
  "event_type",
  "amount_base",
  "decimals",
  "symbol"
] as const;

function normalizeHeader(name: string): string {
  if (name === "policy_id") return "policy_version_id";
  return name;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    const next = text[i + 1] ?? "";

    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (inQuotes) {
    throw validationError("invalid csv format", { reason: "unterminated quoted field" });
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((current) => current.some((value) => value.trim() !== ""));
}

function requireField(record: Record<string, string>, field: string, rowNumber: number): string {
  const value = record[field]?.trim() ?? "";
  if (!value) {
    throw validationError("missing required csv field", { field, row_number: rowNumber });
  }
  return value;
}

export function findDuplicateReferenceIds(referenceIds: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const referenceId of referenceIds) {
    if (seen.has(referenceId)) {
      duplicates.add(referenceId);
      continue;
    }
    seen.add(referenceId);
  }

  return Array.from(duplicates);
}

export function parseLedgerEventsCsv(text: string): ImportedLedgerEvent[] {
  const rows = parseCsv(text.trim());
  if (!rows.length) {
    throw validationError("csv file is empty");
  }

  const headerRow = rows[0] ?? [];
  const headers = headerRow.map((header) => normalizeHeader(header.trim()));
  const missingHeaders = [...requiredHeaders, "policy_version_id"].filter((header) => !headers.includes(header));

  if (missingHeaders.length) {
    throw validationError("missing required csv headers", { missing_headers: missingHeaders });
  }

  const dataRows = rows.slice(1);
  return dataRows.map((row, index) => {
    const rowNumber = index + 2;
    const record: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      record[header] = row[columnIndex]?.trim() ?? "";
    });

    const metaRaw = record.meta_json?.trim() ?? "";
    let meta: Record<string, unknown> = {};
    if (metaRaw) {
      try {
        const parsed = JSON.parse(metaRaw) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("meta_json must be an object");
        }
        meta = parsed as Record<string, unknown>;
      } catch (err) {
        throw validationError("invalid meta_json", {
          row_number: rowNumber,
          reason: err instanceof Error ? err.message : String(err)
        });
      }
    }

    const decimalsValue = requireField(record, "decimals", rowNumber);
    if (!/^\d+$/.test(decimalsValue)) {
      throw validationError("invalid decimals", { row_number: rowNumber, decimals: decimalsValue });
    }

    return {
      row_number: rowNumber,
      reference_id: requireField(record, "reference_id", rowNumber),
      account_id: requireField(record, "account_id", rowNumber),
      product_id: requireField(record, "product_id", rowNumber),
      policy_version_id: requireField(record, "policy_version_id", rowNumber),
      calc_run_id: record.calc_run_id?.trim() ? record.calc_run_id.trim() : null,
      event_time: requireField(record, "event_time", rowNumber),
      event_type: requireField(record, "event_type", rowNumber) as LedgerEventInput["event_type"],
      amount_base: requireField(record, "amount_base", rowNumber),
      decimals: Number(decimalsValue),
      symbol: requireField(record, "symbol", rowNumber),
      related_account_id: record.related_account_id?.trim() ? record.related_account_id.trim() : null,
      meta
    };
  });
}
