import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Field names below are the real ones from YONEPSE's data/nepse_data.json.
const market = [
  { symbol: "NABIL", name: "Nabil Bank Limited", ltp: 531, previous_close: 527.3, change: 3.7, percent_change: 0.7, high: 532, low: 528, volume: 53949, last_updated: "2026-10-06T14:59:41.692822" },
  { symbol: "NICA", name: "NIC Asia Bank Limited", ltp: 690, previous_close: 702, change: -12, percent_change: -1.71, high: 703, low: 688, volume: 9800, last_updated: "2026-10-06T14:58:00.000000" },
  { symbol: "NOPREV", name: "No prev close", ltp: 100, volume: 0, last_updated: "2026-10-06T14:00:00.000000" },
  { symbol: "NOPRICE", name: "Never traded", ltp: 0 },
  { symbol: "bad symbol!", name: "Junk", ltp: 10 },
  { symbol: "NABIL", name: "Duplicate row", ltp: 1 },
];
const manifest = { availableMonths: ["2025-09", "2025-10", "2026-09", "2026-10"], latestDate: "2026-10-06" };
// A shard: dates + per-symbol rows of [dateIndex, ltp, volume, turnover, trades]
const shards: Record<string, unknown> = {
  "2025-09": { dates: ["2025-09-15", "2025-09-20"], series: { NABIL: [[0, 300, 1, 1, 1], [1, 310, 1, 1, 1]] } }, // older than 365 days: ignored
  "2025-10": { dates: ["2025-10-05", "2025-10-20"], series: { NABIL: [[0, 487, 1, 1, 1], [1, 500, 1, 1, 1]] } }, // 2025-10-05 is 366 days back: ignored
  "2026-09": { dates: ["2026-09-01", "2026-09-02"], series: { NABIL: [[0, 569, 1, 1, 1], [1, 520, 1, 1, 1]], NICA: [[0, 700, 1, 1, 1]] } },
  "2026-10": { dates: ["2026-10-06"], series: { NABIL: [[0, 531, 1, 1, 1]] } },
};

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

/** Routes fetches like the real provider's file layout. */
function provider(over: { down?: boolean } = {}) {
  return vi.fn((url: string) => {
    if (over.down) return json({}, 503);
    const u = String(url);
    if (u.endsWith("/nepse_data.json")) return json(market);
    if (u.endsWith("/ltp/manifest.json")) return json(manifest);
    const m = /\/ltp\/monthly\/(\d{4}-\d{2})\.json$/.exec(u);
    if (m?.[1] && shards[m[1]]) return json(shards[m[1]]);
    return json({}, 404);
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("parseMarket", () => {
  it("keeps real prices, lists every valid company, and never invents missing values", async () => {
    const { parseMarket } = await import("./service");
    const m = parseMarket(market);
    expect(Object.keys(m.quotes).sort()).toEqual(["NABIL", "NICA", "NOPREV"]);
    expect(m.companies.map((c) => c.symbol).sort()).toEqual(["NABIL", "NICA", "NOPREV", "NOPRICE"]);
    expect(m.quotes.NABIL).toMatchObject({ ltp: 531, previousClose: 527.3, change: 3.7, changePct: 0.7, high: 532, low: 528, volume: 53949, open: null });
    expect(m.quotes.NOPREV).toMatchObject({ previousClose: null, change: null, changePct: null, high: null, volume: 0 });
    expect(m.asOf).toBe("2026-10-06T14:59:41.692822");
  });

  it("rejects unusable payloads so the cache can fall back", async () => {
    const { parseMarket } = await import("./service");
    expect(() => parseMarket({})).toThrow();
    expect(() => parseMarket([])).toThrow();
    expect(() => parseMarket([{ symbol: "X", name: "x", ltp: 0 }])).toThrow(/usable price/);
  });
});

describe("52-week range", () => {
  it("uses only closing prices from the last 365 days", async () => {
    const { buildRanges, parseManifest } = await import("./service");
    const { months, latestDate } = parseManifest(manifest);
    const r = buildRanges(months.map((m) => shards[m]), latestDate);
    expect(r.NABIL).toEqual({ low: 500, high: 569 }); // 300, 310 and 487 fall outside the window
    expect(r.NICA).toEqual({ low: 700, high: 700 });
  });

  it("rejects malformed shards instead of producing a partial range", async () => {
    const { buildRanges } = await import("./service");
    expect(() => buildRanges([{ nope: 1 }], "2026-10-06")).toThrow();
    expect(() => buildRanges([{ dates: [], series: {} }], "2026-10-06")).toThrow(/no price history/);
  });

  it("is served through getDetails together with the latest quote", async () => {
    vi.stubGlobal("fetch", provider());
    const { getDetails } = await import("./service");
    expect(await getDetails("NABIL")).toEqual({ symbol: "NABIL", ltp: 531, previousClose: 527.3, high52: 569, low52: 500, volume: 53949 });
    expect(await getDetails("NOPE")).toBeNull();
  });

  it("returns a quote with no range (never a partial range) if any shard is missing", async () => {
    const f = vi.fn((url: string) => (String(url).includes("2025-10") ? json({}, 404) : provider()(url)));
    vi.stubGlobal("fetch", f);
    const { getDetails } = await import("./service");
    const d = await getDetails("NABIL");
    expect(d).toMatchObject({ ltp: 531, high52: null, low52: null });
  });
});

describe("snapshot caching", () => {
  it("de-duplicates concurrent requests and serves from memory", async () => {
    const f = provider();
    vi.stubGlobal("fetch", f);
    const { getSnapshot } = await import("./service");
    await Promise.all([getSnapshot(), getSnapshot(), getSnapshot()]);
    await getSnapshot();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("serves the last good data, flagged stale, when upstream fails", async () => {
    vi.useFakeTimers();
    let down = false;
    const ok = provider();
    vi.stubGlobal("fetch", vi.fn((u: string) => (down ? json({}, 500) : ok(u))));
    const { getSnapshot } = await import("./service");
    const first = await getSnapshot();
    expect(first.stale).toBe(false);
    down = true;
    vi.advanceTimersByTime(30 * 60_000);
    const second = await getSnapshot();
    expect(second.stale).toBe(true);
    expect(second.unavailable).toBe(false);
    expect(second.quotes.NABIL?.ltp).toBe(531);
  });

  it("does not retry a failing upstream on every call, then recovers", async () => {
    vi.useFakeTimers();
    let down = true;
    const ok = provider();
    const f = vi.fn((u: string) => (down ? json({}, 503) : ok(u)));
    vi.stubGlobal("fetch", f);
    const { getSnapshot } = await import("./service");
    await getSnapshot();
    await getSnapshot();
    await getSnapshot();
    expect(f).toHaveBeenCalledTimes(1);
    down = false;
    vi.advanceTimersByTime(25_000);
    expect((await getSnapshot()).unavailable).toBe(false);
  });

  it("reports unavailable (no fabricated data) when upstream fails with nothing cached", async () => {
    vi.stubGlobal("fetch", provider({ down: true }));
    const { getSnapshot, getCompanies } = await import("./service");
    const s = await getSnapshot();
    expect(s.unavailable).toBe(true);
    expect(s.quotes).toEqual({});
    expect(await getCompanies()).toEqual([]);
  });
});

describe("search and prices", () => {
  it("ranks symbol matches before name matches and attaches prices", async () => {
    vi.stubGlobal("fetch", provider());
    const { searchStocks } = await import("./service");
    expect((await searchStocks("nab"))[0]).toMatchObject({ symbol: "NABIL", ltp: 531 });
    expect((await searchStocks("asia")).map((h) => h.symbol)).toEqual(["NICA"]);
    expect((await searchStocks("never"))[0]).toMatchObject({ symbol: "NOPRICE", ltp: null });
    expect(await searchStocks("   ")).toEqual([]);
  });

  it("returns prices only for symbols that have one", async () => {
    vi.stubGlobal("fetch", provider());
    const { getPrices } = await import("./service");
    const { prices } = await getPrices(["NABIL", "NOPRICE", "ZZZ"]);
    expect(prices.get("NABIL")).toEqual({ ltp: 531, previousClose: 527.3 });
    expect(prices.has("NOPRICE")).toBe(false);
    expect(prices.has("ZZZ")).toBe(false);
  });
});

describe("market hours", () => {
  it("is open Sunday to Thursday 11:00 to 15:00 Nepal time only", async () => {
    const { isMarketHours } = await import("./service");
    expect(isMarketHours(Date.UTC(2026, 9, 8, 5, 15))).toBe(true); // Thu 11:00 NPT
    expect(isMarketHours(Date.UTC(2026, 9, 8, 9, 14))).toBe(true); // 14:59
    expect(isMarketHours(Date.UTC(2026, 9, 8, 9, 15))).toBe(false); // 15:00
    expect(isMarketHours(Date.UTC(2026, 9, 8, 5, 14))).toBe(false); // 10:59
    expect(isMarketHours(Date.UTC(2026, 9, 9, 6, 0))).toBe(false); // Friday
  });
});
