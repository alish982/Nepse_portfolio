import "server-only";
import { cache } from "react";
import { readDurable, writeDurable } from "./durable";

/**
 * Server-side market data layer over YONEPSE, a static JSON API published on GitHub Pages
 * (https://shubhamnpk.github.io/yonepse/). Files used:
 *
 *   data/nepse_data.json          every listed security: ltp, previous_close, change,
 *                                 percent_change, high, low, volume, last_updated
 *   data/ltp/manifest.json        which monthly price shards exist
 *   data/ltp/monthly/YYYY-MM.json daily closing price (ltp) per symbol, used to derive the
 *                                 52-week range
 *
 * The 52-week range is computed from daily CLOSING prices (YONEPSE has no intraday 52-week
 * field), so it can differ slightly from NEPSE's own figure. Prices are as fresh as the
 * provider's last update, never described as real-time.
 *
 * Caching, outermost to innermost:
 *   1. in-memory TTL cache per server instance
 *   2. in-flight request de-duplication (N concurrent callers -> 1 upstream request)
 *   3. optional durable copy in Supabase (service role, server only) so the last known data
 *      survives cold starts when the provider is unreachable
 * If upstream fails we return the last good value flagged `stale: true`. If there is none,
 * we return nothing. Values are never estimated.
 */

const BASE = (process.env.YONEPSE_BASE_URL ?? "https://shubhamnpk.github.io/yonepse/data").replace(/\/+$/, "");
const BULK_TIMEOUT_MS = 20_000;
/** After a failed refresh, don't hammer a struggling upstream (or make every page wait on it). */
const RETRY_AFTER_FAILURE_MS = 20_000;
const RANGE_MONTHS = 13; // enough shards to cover 365 days back from the latest date

export const SYMBOL_RE = /^[A-Z0-9]{1,15}$/;

export interface Quote {
  symbol: string;
  name: string;
  ltp: number;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  /** The provider does not publish the opening price, so this is always null. */
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  /** Provider's own timestamp, Nepal local time, e.g. "2026-10-06T14:59:41". */
  updatedAt: string | null;
}

export interface Company {
  symbol: string;
  name: string;
  sector: string | null;
}

export interface Market {
  quotes: Record<string, Quote>;
  /** Every listed security, including ones with no usable price. */
  companies: Company[];
  /** Newest provider timestamp among all rows. */
  asOf: string | null;
}

export interface Range52 {
  low: number;
  high: number;
}

export interface Details {
  symbol: string;
  ltp: number | null;
  previousClose: number | null;
  high52: number | null;
  low52: number | null;
  volume: number | null;
}

export interface Snapshot {
  quotes: Record<string, Quote>;
  /** epoch ms when the data was fetched from upstream */
  fetchedAt: number | null;
  /** provider's own "last updated" timestamp (Nepal time), if known */
  asOf: string | null;
  /** true when upstream failed and this is the last known data */
  stale: boolean;
  /** true when there is no data at all */
  unavailable: boolean;
}

// ---------------------------------------------------------------- helpers

/** Nepal time is UTC+05:45 with no DST. */
const NPT_OFFSET_MS = (5 * 60 + 45) * 60_000;

export function nptNow(now = Date.now()): Date {
  return new Date(now + NPT_OFFSET_MS);
}

export function todayNpt(now = Date.now()): string {
  return nptNow(now).toISOString().slice(0, 10);
}

/** NEPSE trades Sunday to Thursday, 11:00 to 15:00 NPT. Public holidays are not modelled. */
export function isMarketHours(now = Date.now()): boolean {
  const d = nptNow(now);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  if (day === 5 || day === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 11 * 60 && mins < 15 * 60;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const pos = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const round2 = (n: number) => Math.round(n * 100) / 100;

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${path}`, {
    cache: "no-store", // we cache ourselves so we can serve stale on failure
    signal: AbortSignal.timeout(BULK_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`YONEPSE ${path} responded ${res.status}`);
  return res.json();
}

// -------------------------------------------------------------- parsers

/** Parses data/nepse_data.json. */
export function parseMarket(raw: unknown): Market {
  if (!Array.isArray(raw)) throw new Error("nepse_data.json: expected an array");
  const quotes: Record<string, Quote> = {};
  const companies: Company[] = [];
  const seen = new Set<string>();
  let asOf: string | null = null;

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const symbol = str(item.symbol)?.toUpperCase();
    if (!symbol || !SYMBOL_RE.test(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    const name = str(item.name) ?? symbol;
    companies.push({ symbol, name, sector: null });

    const ltp = pos(item.ltp);
    if (ltp === null) continue; // listed, but no usable price: never invent one
    const previousClose = pos(item.previous_close);
    const updatedAt = str(item.last_updated);
    if (updatedAt && (asOf === null || updatedAt > asOf)) asOf = updatedAt;

    quotes[symbol] = {
      symbol,
      name,
      ltp,
      previousClose,
      change: num(item.change) ?? (previousClose !== null ? round2(ltp - previousClose) : null),
      changePct:
        num(item.percent_change) ??
        (previousClose !== null ? round2(((ltp - previousClose) / previousClose) * 100) : null),
      open: null,
      high: pos(item.high),
      low: pos(item.low),
      volume: num(item.volume),
      updatedAt,
    };
  }
  if (companies.length === 0) throw new Error("nepse_data.json: no usable rows");
  if (Object.keys(quotes).length === 0) throw new Error("nepse_data.json: no row has a usable price");
  return { quotes, companies, asOf };
}

/** Months to fetch, newest last, from data/ltp/manifest.json. */
export function parseManifest(raw: unknown): { months: string[]; latestDate: string } {
  if (!isRecord(raw) || !Array.isArray(raw.availableMonths)) throw new Error("ltp manifest: unexpected shape");
  const months = raw.availableMonths.filter((m): m is string => typeof m === "string" && /^\d{4}-\d{2}$/.test(m));
  const latestDate = str(raw.latestDate);
  if (months.length === 0 || !latestDate) throw new Error("ltp manifest: no months or latestDate");
  return { months: months.slice(-RANGE_MONTHS), latestDate };
}

function minusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Folds monthly shards into a per-symbol closing-price range over the last 365 days.
 * A shard looks like { dates: ["2026-09-01", ...], series: { NABIL: [[dateIndex, ltp, ...], ...] } }.
 */
export function buildRanges(shards: readonly unknown[], latestDate: string): Record<string, Range52> {
  const cutoff = minusDays(latestDate, 365);
  const out: Record<string, Range52> = {};
  for (const shard of shards) {
    if (!isRecord(shard) || !Array.isArray(shard.dates) || !isRecord(shard.series)) {
      throw new Error("ltp shard: unexpected shape");
    }
    const dates = shard.dates as unknown[];
    for (const [rawSymbol, rows] of Object.entries(shard.series)) {
      const symbol = rawSymbol.toUpperCase();
      if (!SYMBOL_RE.test(symbol) || !Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const date = typeof row[0] === "number" ? dates[row[0]] : undefined;
        const ltp = pos(row[1]);
        if (typeof date !== "string" || date < cutoff || ltp === null) continue;
        const cur = out[symbol];
        if (!cur) out[symbol] = { low: ltp, high: ltp };
        else {
          if (ltp < cur.low) cur.low = ltp;
          if (ltp > cur.high) cur.high = ltp;
        }
      }
    }
  }
  if (Object.keys(out).length === 0) throw new Error("ltp shards: no price history in range");
  return out;
}

// ------------------------------------------------------- generic cache

interface Entry<T> {
  value: T;
  at: number;
}

/**
 * Small TTL cache with in-flight de-duplication and stale-on-error.
 * `load` must throw on failure. `fallback` is consulted only when nothing is in memory.
 */
function makeCached<T>(opts: {
  ttl: () => number;
  load: () => Promise<T>;
  onFresh?: (value: T) => void;
  fallback?: () => Promise<Entry<T> | null>;
}) {
  let entry: Entry<T> | null = null;
  let failedAt = 0;
  let inflight: Promise<{ entry: Entry<T> | null; stale: boolean }> | null = null;

  return async function get(): Promise<{ entry: Entry<T> | null; stale: boolean }> {
    if (entry && Date.now() - entry.at < opts.ttl()) return { entry, stale: false };
    // Recently failed: serve what we have without waiting on upstream again.
    if (failedAt && Date.now() - failedAt < RETRY_AFTER_FAILURE_MS) return { entry, stale: entry !== null };
    inflight ??= (async () => {
      try {
        const value = await opts.load();
        entry = { value, at: Date.now() };
        failedAt = 0;
        opts.onFresh?.(value);
        return { entry, stale: false };
      } catch (err) {
        failedAt = Date.now();
        // warn, not error: an unreachable upstream is handled, not a crash (and error triggers the dev overlay)
        console.warn("[market] upstream unavailable, serving cached data if any:", err instanceof Error ? err.message : err);
        if (!entry && opts.fallback) entry = await opts.fallback().catch(() => null);
        return { entry, stale: entry !== null };
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };
}

// ------------------------------------------------------- live market

// The provider refreshes on a schedule; polling faster than this gains nothing.
const marketTtl = () => (isMarketHours() ? 60_000 : 10 * 60_000);

let lastPersist = 0;
const marketCache = makeCached<Market>({
  ttl: marketTtl,
  load: async () => parseMarket(await getJson("nepse_data.json")),
  onFresh: (market) => {
    if (Date.now() - lastPersist < 60_000) return;
    lastPersist = Date.now();
    void writeDurable("market", market);
  },
  fallback: async () => {
    const d = await readDurable<Market>("market");
    return d ? { value: d.payload, at: d.updatedAt } : null;
  },
});

/** Whole-market snapshot. Deduplicated per request via React cache(). */
export const getSnapshot = cache(async (): Promise<Snapshot> => {
  const { entry, stale } = await marketCache();
  if (!entry) return { quotes: {}, fetchedAt: null, asOf: null, stale: false, unavailable: true };
  return { quotes: entry.value.quotes, fetchedAt: entry.at, asOf: entry.value.asOf, stale, unavailable: false };
});

/** Every listed security, for search and symbol validation. */
export const getCompanies = cache(async (): Promise<Company[]> => {
  const { entry } = await marketCache();
  return entry?.value.companies ?? [];
});

// ------------------------------------------------------ 52-week ranges

let lastRangePersist = 0;
const rangeCache = makeCached<Record<string, Range52>>({
  ttl: () => 12 * 3_600_000, // history only changes once a day
  load: async () => {
    const { months, latestDate } = parseManifest(await getJson("ltp/manifest.json"));
    // All-or-nothing: a range built from a missing month would be wrong, so any failure fails the load.
    const shards = await Promise.all(months.map((m) => getJson(`ltp/monthly/${m}.json`)));
    return buildRanges(shards, latestDate);
  },
  onFresh: (ranges) => {
    if (Date.now() - lastRangePersist < 3_600_000) return;
    lastRangePersist = Date.now();
    void writeDurable("range52", ranges);
  },
  fallback: async () => {
    const d = await readDurable<Record<string, Range52>>("range52");
    return d ? { value: d.payload, at: d.updatedAt } : null;
  },
});

const getRanges = cache(async () => (await rangeCache()).entry?.value ?? null);

/** 52-week closing-price range plus latest quote for one symbol. Null when the symbol is unknown. */
export const getDetails = cache(async (symbol: string): Promise<Details | null> => {
  if (!SYMBOL_RE.test(symbol)) return null;
  const [snapshot, ranges] = await Promise.all([getSnapshot(), getRanges()]);
  const q = snapshot.quotes[symbol];
  const r = ranges?.[symbol];
  if (!q && !r) return null;
  return {
    symbol,
    ltp: q?.ltp ?? null,
    previousClose: q?.previousClose ?? null,
    high52: r?.high ?? null,
    low52: r?.low ?? null,
    volume: q?.volume ?? null,
  };
});

// ------------------------------------------------- price lookup for holdings

export interface PriceBook {
  prices: Map<string, { ltp: number; previousClose: number | null }>;
  snapshot: Snapshot;
}

/** Prices for a set of symbols. Symbols with no usable price are simply absent. */
export async function getPrices(symbols: readonly string[]): Promise<PriceBook> {
  const snapshot = await getSnapshot();
  const prices: PriceBook["prices"] = new Map();
  for (const s of symbols) {
    const q = snapshot.quotes[s];
    if (q) prices.set(s, { ltp: q.ltp, previousClose: q.previousClose });
  }
  return { prices, snapshot };
}

// ------------------------------------------------------------------ search

export interface SearchHit {
  symbol: string;
  name: string;
  sector: string | null;
  ltp: number | null;
}

export async function searchStocks(query: string, limit = 8): Promise<SearchHit[]> {
  const q = query.trim().toUpperCase();
  if (q.length === 0) return [];
  const [companies, snapshot] = await Promise.all([getCompanies(), getSnapshot()]);

  const scored: { hit: SearchHit; score: number }[] = [];
  for (const c of companies) {
    const name = c.name.toUpperCase();
    let score = 0;
    if (c.symbol === q) score = 100;
    else if (c.symbol.startsWith(q)) score = 80;
    else if (name.startsWith(q)) score = 60;
    else if (name.split(/\s+/).some((w) => w.startsWith(q))) score = 50;
    else if (c.symbol.includes(q) || name.includes(q)) score = 30;
    if (score > 0) {
      scored.push({
        score,
        hit: { symbol: c.symbol, name: c.name, sector: c.sector, ltp: snapshot.quotes[c.symbol]?.ltp ?? null },
      });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.hit.symbol.length - b.hit.symbol.length || a.hit.symbol.localeCompare(b.hit.symbol));
  return scored.slice(0, limit).map((s) => s.hit);
}
