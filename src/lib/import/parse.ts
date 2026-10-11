/**
 * Parsers for holdings statements (Demat/MeroShare "My Shares") in CSV or PDF-text form.
 * Pure functions. A statement lists symbols and quantities only: it carries no purchase
 * price or date, so none is ever assumed here.
 */

export interface ParsedRow {
  symbol: string;
  quantity: number;
  /** Cost per share, only when the file itself has a price column. */
  price: number | null;
}

export interface Skipped {
  line: string;
  reason: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  skipped: Skipped[];
}

export const MAX_ROWS = 500;

const SYMBOL = /^[A-Z][A-Z0-9]{0,14}$/;
const NUMBER = /^\d[\d,]*(?:\.\d+)?$/;

const toNumber = (s: string): number | null => {
  const t = s.trim().replace(/,/g, "");
  return NUMBER.test(s.trim()) && Number.isFinite(Number(t)) ? Number(t) : null;
};

/** Merge repeated symbols by summing quantity; keep a price only if every duplicate agrees. */
function consolidate(rows: ParsedRow[]): ParsedRow[] {
  const map = new Map<string, ParsedRow>();
  for (const r of rows) {
    const prev = map.get(r.symbol);
    if (!prev) {
      map.set(r.symbol, { ...r });
    } else {
      prev.quantity += r.quantity;
      if (prev.price !== r.price) prev.price = null;
    }
  }
  return [...map.values()];
}

// ------------------------------------------------------------------ CSV

/** RFC-4180-ish parser: quoted fields, escaped quotes, CRLF, BOM. */
export function splitCsv(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) out.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) out.push(row);
  return out;
}

const SYMBOL_HEADERS = ["scrip", "symbol", "script", "stock", "security", "ticker"];
const QTY_HEADERS = ["current balance", "quantity", "qty", "balance", "units", "shares", "total shares"];
const PRICE_HEADERS = ["avg cost", "average cost", "wacc", "cost price", "buy price", "purchase price", "price", "rate", "cost"];

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, " ");

function findCol(header: string[], names: string[]): number {
  const h = header.map(norm);
  for (const n of names) {
    const i = h.indexOf(n);
    if (i !== -1) return i;
  }
  return -1;
}

export function parseCsv(text: string): ParseResult {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  ",");
  const table = splitCsv(text, delimiter);

  const headerIdx = table.findIndex((r) => findCol(r, SYMBOL_HEADERS) !== -1 && findCol(r, QTY_HEADERS) !== -1);
  if (headerIdx === -1) {
    throw new Error("Couldn't find a Scrip (or Symbol) column and a Current Balance (or Quantity) column in this CSV.");
  }
  const header = table[headerIdx] ?? [];
  const iSym = findCol(header, SYMBOL_HEADERS);
  const iQty = findCol(header, QTY_HEADERS);
  const iPrice = findCol(header, PRICE_HEADERS);

  const rows: ParsedRow[] = [];
  const skipped: Skipped[] = [];
  for (const r of table.slice(headerIdx + 1)) {
    const line = r.join(",").slice(0, 80);
    const symbol = (r[iSym] ?? "").trim().toUpperCase();
    if (symbol === "") continue;
    if (!SYMBOL.test(symbol)) {
      skipped.push({ line, reason: `"${symbol}" is not a valid symbol` });
      continue;
    }
    const q = toNumber(r[iQty] ?? "");
    if (q === null || !Number.isInteger(q) || q <= 0) {
      if (q === 0) continue; // zero balance: nothing to import
      skipped.push({ line, reason: "Quantity must be a whole number greater than zero" });
      continue;
    }
    const p = iPrice === -1 ? null : toNumber(r[iPrice] ?? "");
    rows.push({ symbol, quantity: q, price: p !== null && p > 0 ? p : null });
  }
  return { rows: consolidate(rows), skipped };
}

// ------------------------------------------------------------------ PDF

/**
 * Reads the text of a Demat "Summary Statement of Account". Each holding line looks like
 *   "7. NABIL 11.0 0.0 0.0 0.0 11.0 0.0"
 * i.e. S.N., scrip, then six balances: current, pledge, lockin, freeze, free, demat pending.
 * Only the scrip and the CURRENT balance are used. Holder name, BOID and address in the
 * header are never read.
 */
export function parsePdfText(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const skipped: Skipped[] = [];
  const num = String.raw`\d[\d,]*(?:\.\d+)?`;
  const re = new RegExp(String.raw`^\s*(\d{1,4})\.?\s+([A-Z][A-Z0-9]*)\s+(${num})(?:\s+${num}){5}(?:\s|$)`);

  for (const line of text.split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    const symbol = m[2] ?? "";
    const q = toNumber(m[3] ?? "");
    if (!SYMBOL.test(symbol)) {
      skipped.push({ line: line.trim().slice(0, 80), reason: `"${symbol}" is not a valid symbol` });
    } else if (q === null || !Number.isInteger(q)) {
      skipped.push({ line: line.trim().slice(0, 80), reason: "Quantity must be a whole number" });
    } else if (q > 0) {
      rows.push({ symbol, quantity: q, price: null });
    }
  }
  if (rows.length === 0 && skipped.length === 0) {
    throw new Error("No holdings found. This doesn't look like a Demat \"Summary Statement of Account\" PDF.");
  }
  return { rows: consolidate(rows), skipped };
}
