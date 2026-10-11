"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_COOKIE, getPortfolios, loadTransactions, requireUser } from "@/lib/data";
import { replay, validate, OversellError, type Txn } from "@/lib/portfolio/calc";
import { MAX_ROWS, parseCsv, parsePdfText, type Skipped } from "@/lib/import/parse";
import { getCompanies, getSnapshot, SYMBOL_RE, todayNpt } from "@/lib/nepse/service";

export interface ActionResult {
  error?: string;
  ok?: boolean;
}

const refresh = () => revalidatePath("/", "layout");

async function setActive(id: string) {
  (await cookies()).set(ACTIVE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

const cleanName = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/\s+/g, " ");

function nameError(name: string): string | null {
  if (name.length < 1) return "Give the portfolio a name.";
  if (name.length > 60) return "Keep the name to 60 characters or fewer.";
  return null;
}

const isDuplicate = (e: { code?: string }) => e.code === "23505";

// ------------------------------------------------------------- portfolios

export async function switchPortfolio(formData: FormData): Promise<void> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  // Must be one of the caller's own portfolios (RLS also guarantees this).
  if ((await getPortfolios()).some((p) => p.id === id)) await setActive(id);
  refresh();
}

export async function createPortfolio(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = cleanName(formData.get("name"));
  const bad = nameError(name);
  if (bad) return { error: bad };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .insert({ user_id: user.id, name })
    .select("id")
    .single();
  if (error) return { error: isDuplicate(error) ? "You already have a portfolio with that name." : "Could not create the portfolio." };
  await setActive(data.id);
  refresh();
  return { ok: true };
}

export async function renamePortfolio(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const name = cleanName(formData.get("name"));
  const bad = nameError(name);
  if (bad) return { error: bad };

  const supabase = await createClient();
  const { error } = await supabase.from("portfolios").update({ name }).eq("id", id);
  if (error) return { error: isDuplicate(error) ? "You already have a portfolio with that name." : "Could not rename the portfolio." };
  refresh();
  return { ok: true };
}

export async function deletePortfolio(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const all = await getPortfolios();
  if (all.length <= 1) return { error: "You need at least one portfolio, so this one can't be deleted." };
  if (!all.some((p) => p.id === id)) return { error: "Portfolio not found." };

  const supabase = await createClient();
  const { error } = await supabase.from("portfolios").delete().eq("id", id);
  if (error) return { error: "Could not delete the portfolio." };
  const next = all.find((p) => p.id !== id);
  if (next) await setActive(next.id);
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------- transactions

export async function addTransaction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const portfolioId = String(formData.get("portfolioId") ?? "");
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const type = String(formData.get("type") ?? "");
  const quantity = Number(formData.get("quantity"));
  const price = Number(formData.get("price"));
  const feesRaw = String(formData.get("fees") ?? "").trim();
  const fees = feesRaw === "" ? 0 : Number(feesRaw);
  const date = String(formData.get("date") ?? "");

  if (!SYMBOL_RE.test(symbol)) return { error: "Choose a stock from the search results." };
  if (type !== "buy" && type !== "sell") return { error: "Choose Buy or Sell." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000_000) return { error: "Quantity must be a whole number of shares, at least 1." };
  if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) return { error: "Enter a price greater than zero." };
  if (Math.round(price * 100) / 100 !== price) return { error: "Price can have at most 2 decimal places." };
  if (!Number.isFinite(fees) || fees < 0 || fees > 1_000_000_000) return { error: "Fees can't be negative." };
  if (Math.round(fees * 100) / 100 !== fees) return { error: "Fees can have at most 2 decimal places." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: "Enter a valid date." };
  if (date > todayNpt()) return { error: "The date can't be in the future." };

  // The symbol must be a real listed security, never free text.
  const company = (await getCompanies()).find((c) => c.symbol === symbol);
  if (!company) {
    return { error: "Couldn't verify that symbol against NEPSE's list. Pick it from the search results, or try again shortly." };
  }

  if (!(await getPortfolios()).some((p) => p.id === portfolioId)) return { error: "Portfolio not found." };

  // Reject sequences that would sell shares you did not hold at that date.
  const existing = await loadTransactions(portfolioId);
  const candidate: Txn = {
    id: "new",
    symbol,
    type,
    quantity,
    price,
    fees,
    txnDate: date,
    createdAt: new Date().toISOString(),
  };
  const problem = validate([...existing, candidate]);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    portfolio_id: portfolioId,
    user_id: user.id,
    symbol,
    company_name: company.name,
    type,
    quantity,
    price,
    fees,
    txn_date: date,
  });
  if (error) return { error: "Could not save the transaction. Try again." };
  refresh();
  return { ok: true };
}

export async function deleteTransaction(portfolioId: string, id: string): Promise<ActionResult> {
  await requireUser();
  if (!(await getPortfolios()).some((p) => p.id === portfolioId)) return { error: "Portfolio not found." };

  const existing = await loadTransactions(portfolioId);
  const remaining = existing.filter((t) => t.id !== id);
  if (remaining.length === existing.length) return { error: "Transaction not found." };
  const problem = validate(remaining);
  if (problem) return { error: `Can't delete this: later sells would exceed your holdings. ${problem}` };

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("portfolio_id", portfolioId);
  if (error) return { error: "Could not delete the transaction." };
  refresh();
  return { ok: true };
}

// --------------------------------------------------------------- settings

export async function updateDisplayName(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = cleanName(formData.get("name"));
  if (name.length > 60) return { error: "Keep the name to 60 characters or fewer." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: name || null }).eq("id", user.id);
  if (error) return { error: "Could not save your name." };
  refresh();
  return { ok: true };
}

export async function updatePassword(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true };
}

// ----------------------------------------------------------------- import

export interface PreviewRow {
  symbol: string;
  name: string | null;
  quantity: number;
  /** Cost per share if the file had one; otherwise the user must supply it. */
  price: number | null;
  /** Latest market price, to offer "use today's price". Null if unavailable. */
  ltp: number | null;
  known: boolean;
  /** Shares of this symbol already in the portfolio. */
  heldQty: number;
}

export interface PreviewResult {
  error?: string;
  rows?: PreviewRow[];
  skipped?: Skipped[];
}

const MAX_FILE_BYTES = 1_000_000;

async function fileText(file: File): Promise<{ kind: "pdf" | "csv"; text: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = bytes.length > 4 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
  if (isPdf) {
    // Parsed in memory and discarded. Only scrip and quantity are read from the text.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    if (pdf.numPages > 20) throw new Error("This PDF has too many pages to be a holdings statement.");
    const { text } = await extractText(pdf, { mergePages: true });
    return { kind: "pdf", text };
  }
  if (!/\.(csv|txt)$/i.test(file.name)) throw new Error("Upload a .csv or .pdf file.");
  return { kind: "csv", text: new TextDecoder("utf-8").decode(bytes) };
}

/** Step 1: read the file and return a preview. Nothing is saved. */
export async function previewImport(formData: FormData): Promise<PreviewResult> {
  await requireUser();
  const portfolioId = String(formData.get("portfolioId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or PDF file." };
  if (file.size > MAX_FILE_BYTES) return { error: "That file is too large. Holdings statements are under 1 MB." };
  if (!(await getPortfolios()).some((p) => p.id === portfolioId)) return { error: "Portfolio not found." };

  let parsed;
  try {
    const { kind, text } = await fileText(file);
    parsed = kind === "pdf" ? parsePdfText(text) : parseCsv(text);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't read that file." };
  }
  if (parsed.rows.length === 0) return { error: "No holdings with a balance above zero were found in that file.", skipped: parsed.skipped };
  if (parsed.rows.length > MAX_ROWS) return { error: `That file has more than ${MAX_ROWS} holdings. Split it and import in parts.` };

  const [companies, snapshot, existing] = await Promise.all([getCompanies(), getSnapshot(), loadTransactions(portfolioId)]);
  if (companies.length === 0) {
    return { error: "Can't verify symbols right now because the NEPSE company list is unavailable. Try again shortly." };
  }
  const names = new Map(companies.map((c) => [c.symbol, c.name]));
  let held = new Map<string, number>();
  try {
    held = new Map(replay(existing).positions.map((p) => [p.symbol, p.quantity]));
  } catch (e) {
    if (!(e instanceof OversellError)) throw e;
  }

  return {
    skipped: parsed.skipped,
    rows: parsed.rows.map((r) => ({
      symbol: r.symbol,
      name: names.get(r.symbol) ?? null,
      quantity: r.quantity,
      price: r.price,
      ltp: snapshot.quotes[r.symbol]?.ltp ?? null,
      known: names.has(r.symbol),
      heldQty: held.get(r.symbol) ?? 0,
    })),
  };
}

export interface ImportInput {
  portfolioId: string;
  date: string;
  rows: { symbol: string; quantity: number; price: number }[];
}

/** Step 2: save the rows the user confirmed, as Buy transactions, in a single all-or-nothing insert. */
export async function importHoldings(input: ImportInput): Promise<ActionResult & { count?: number }> {
  const user = await requireUser();
  if (!(await getPortfolios()).some((p) => p.id === input.portfolioId)) return { error: "Portfolio not found." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) return { error: "Enter a valid date." };
  if (input.date > todayNpt()) return { error: "The date can't be in the future." };
  if (!Array.isArray(input.rows) || input.rows.length === 0) return { error: "Select at least one holding to import." };
  if (input.rows.length > MAX_ROWS) return { error: `Import at most ${MAX_ROWS} holdings at a time.` };

  const names = new Map((await getCompanies()).map((c) => [c.symbol, c.name]));
  if (names.size === 0) return { error: "Can't verify symbols right now. Try again shortly." };

  const seen = new Set<string>();
  const records = [];
  for (const r of input.rows) {
    const symbol = String(r.symbol ?? "").toUpperCase();
    if (!SYMBOL_RE.test(symbol) || !names.has(symbol)) return { error: `${symbol || "A row"} isn't a listed NEPSE symbol.` };
    if (seen.has(symbol)) return { error: `${symbol} appears twice.` };
    seen.add(symbol);
    if (!Number.isInteger(r.quantity) || r.quantity < 1 || r.quantity > 1_000_000_000) return { error: `${symbol}: quantity must be a whole number.` };
    if (!Number.isFinite(r.price) || r.price <= 0 || r.price > 10_000_000 || Math.round(r.price * 100) / 100 !== r.price) {
      return { error: `${symbol}: enter a cost per share greater than zero, with at most 2 decimals.` };
    }
    records.push({
      portfolio_id: input.portfolioId,
      user_id: user.id,
      symbol,
      company_name: names.get(symbol) ?? null,
      type: "buy" as const,
      quantity: r.quantity,
      price: r.price,
      fees: 0,
      txn_date: input.date,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert(records);
  if (error) return { error: "Could not save the import. Nothing was added. Try again." };
  refresh();
  return { ok: true, count: records.length };
}
