import { describe, expect, it } from "vitest";
import { OversellError, replay, validate, value, type Txn } from "./calc";

let n = 0;
const tx = (
  type: "buy" | "sell",
  symbol: string,
  quantity: number,
  price: number,
  txnDate: string,
  fees = 0,
): Txn => ({
  id: `t${++n}`,
  symbol,
  type,
  quantity,
  price,
  fees,
  txnDate,
  createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
});

describe("replay: weighted-average cost", () => {
  it("averages two buys", () => {
    const r = replay([tx("buy", "NABIL", 10, 100, "2026-01-01"), tx("buy", "NABIL", 30, 200, "2026-01-02")]);
    const p = r.positions[0]!;
    expect(p.quantity).toBe(40);
    expect(p.costPaisa).toBe((10 * 100 + 30 * 200) * 100); // Rs 7,000
    expect(p.costPaisa / 100 / p.quantity).toBe(175);
  });

  it("includes buy fees in cost", () => {
    const r = replay([tx("buy", "NABIL", 10, 100, "2026-01-01", 5.5)]);
    expect(r.positions[0]!.costPaisa).toBe(100550);
  });

  it("keeps average cost after a partial sell and realises P/L on the sold part", () => {
    const r = replay([
      tx("buy", "NABIL", 10, 100, "2026-01-01"),
      tx("buy", "NABIL", 10, 200, "2026-01-02"), // avg 150, qty 20, cost 3000
      tx("sell", "NABIL", 5, 300, "2026-01-03"), // removes 750 cost, proceeds 1500
    ]);
    const p = r.positions[0]!;
    expect(p.quantity).toBe(15);
    expect(p.costPaisa).toBe(225000); // Rs 2,250 => still avg 150
    expect(r.realizedPaisa).toBe(75000); // Rs 750
  });

  it("subtracts sell fees from proceeds, not from remaining cost", () => {
    const r = replay([tx("buy", "A", 10, 100, "2026-01-01"), tx("sell", "A", 4, 150, "2026-01-02", 10)]);
    expect(r.positions[0]!.costPaisa).toBe(60000);
    expect(r.realizedPaisa).toBe((4 * 150 - 10 - 400) * 100); // 190
  });

  it("closes a position fully with exactly zero residual cost", () => {
    const r = replay([
      tx("buy", "A", 3, 33.33, "2026-01-01"),
      tx("buy", "A", 4, 41.17, "2026-01-02"),
      tx("sell", "A", 2, 50, "2026-01-03"),
      tx("sell", "A", 5, 50, "2026-01-04"),
    ]);
    expect(r.positions).toHaveLength(0);
    // total cost 3*33.33 + 4*41.17 = 264.67; proceeds 350
    expect(r.realizedPaisa).toBe(35000 - 26467);
  });

  it("reopens a position at a fresh cost after it was closed", () => {
    const r = replay([
      tx("buy", "A", 10, 100, "2026-01-01"),
      tx("sell", "A", 10, 120, "2026-01-02"),
      tx("buy", "A", 5, 80, "2026-01-03"),
    ]);
    expect(r.positions[0]).toEqual({ symbol: "A", quantity: 5, costPaisa: 40000 });
  });

  it("orders by date then insertion, regardless of input order", () => {
    const buy = tx("buy", "A", 10, 100, "2026-01-01");
    const sell = tx("sell", "A", 10, 100, "2026-01-02");
    expect(() => replay([sell, buy])).not.toThrow();
  });

  it("rejects selling more than held at that date", () => {
    const sell = tx("sell", "A", 5, 100, "2026-01-01");
    const buy = tx("buy", "A", 10, 100, "2026-01-02"); // bought AFTER the sell
    expect(() => replay([buy, sell])).toThrow(OversellError);
    expect(validate([buy, sell])).toMatch(/only 0 held/);
  });

  it("tracks symbols independently", () => {
    const r = replay([tx("buy", "A", 1, 10, "2026-01-01"), tx("buy", "B", 2, 20, "2026-01-01")]);
    expect(r.positions.map((p) => p.symbol)).toEqual(["A", "B"]);
  });

  it("does not overflow on very large positions", () => {
    const r = replay([
      tx("buy", "A", 2_000_000, 9_999.99, "2026-01-01"),
      tx("sell", "A", 1_000_000, 10_000, "2026-01-02"),
    ]);
    expect(r.positions[0]!.quantity).toBe(1_000_000);
    expect(r.positions[0]!.costPaisa).toBe(999_999_000_000);
  });
});

describe("value", () => {
  const rep = replay([
    tx("buy", "A", 10, 100, "2026-01-01"),
    tx("buy", "B", 20, 50, "2026-01-01"),
    tx("buy", "C", 5, 10, "2026-01-01"),
  ]);

  it("computes holdings and portfolio totals", () => {
    const v = value(rep, {
      A: { ltp: 120, previousClose: 110 },
      B: { ltp: 45, previousClose: 50 },
      C: { ltp: 10, previousClose: null },
    });
    const a = v.holdings.find((h) => h.symbol === "A")!;
    expect(a.value).toBe(1200);
    expect(a.pl).toBe(200);
    expect(a.plPct).toBe(20);
    expect(a.dayChange).toBe(100);
    expect(a.avgCost).toBe(100);

    expect(v.summary.totalValue).toBe(1200 + 900 + 50);
    expect(v.summary.totalInvested).toBe(1000 + 1000 + 50);
    expect(v.summary.pl).toBe(200 - 100 + 0);
    // C has no previous close, so it is excluded from today's change
    expect(v.summary.dayChange).toBe(100 - 100);
    expect(v.summary.holdingsCount).toBe(3);
    expect(v.summary.unpricedCount).toBe(0);
  });

  it("never invents a price: unpriced holdings are excluded and counted", () => {
    const v = value(rep, { A: { ltp: 120, previousClose: 100 } });
    const b = v.holdings.find((h) => h.symbol === "B")!;
    expect(b.price).toBeNull();
    expect(b.value).toBeNull();
    expect(b.pl).toBeNull();
    expect(v.summary.unpricedCount).toBe(2);
    expect(v.summary.totalValue).toBe(1200);
    expect(v.summary.totalInvested).toBe(2050);
    expect(v.summary.investedPriced).toBe(1000);
    expect(v.summary.pl).toBe(200);
  });

  it("returns null percentages for an empty portfolio instead of NaN", () => {
    const v = value(replay([]), {});
    expect(v.summary.plPct).toBeNull();
    expect(v.summary.dayChangePct).toBeNull();
    expect(v.summary.totalValue).toBe(0);
  });

  it("weights sum to ~100", () => {
    const v = value(rep, {
      A: { ltp: 120, previousClose: 110 },
      B: { ltp: 45, previousClose: 50 },
      C: { ltp: 10, previousClose: null },
    });
    const total = v.holdings.reduce((s, h) => s + (h.weightPct ?? 0), 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it("treats zero or invalid prices as missing", () => {
    const v = value(rep, { A: { ltp: 0, previousClose: 1 }, B: { ltp: NaN, previousClose: 1 } });
    expect(v.summary.unpricedCount).toBe(3);
  });
});
