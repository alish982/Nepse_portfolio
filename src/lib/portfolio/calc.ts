/**
 * Portfolio math. Pure functions, no I/O.
 *
 * Money is held as integer paisa (1 NPR = 100 paisa) so sums never drift.
 * Method: weighted-average cost.
 *  - Buy: cost basis grows by qty*price + fees (fees are part of cost).
 *  - Sell: the cost basis removed is proportional to the share of the position
 *    sold; realised P/L = (qty*price - fees) - removed cost.
 *  - Average cost is derived (basis / qty), never stored, so partial sells
 *    leave it unchanged apart from rounding to the nearest paisa of basis.
 */

export type TxnType = "buy" | "sell";

export interface Txn {
  id: string;
  symbol: string;
  type: TxnType;
  quantity: number; // whole shares
  price: number; // NPR per share
  fees: number; // NPR, total for this transaction
  txnDate: string; // YYYY-MM-DD
  createdAt: string; // ISO timestamp, tie-breaker within a day
}

export interface Position {
  symbol: string;
  quantity: number;
  /** Total cost basis of the shares still held, in paisa. */
  costPaisa: number;
}

export interface Replay {
  positions: Position[]; // only open positions (quantity > 0), sorted by symbol
  realizedPaisa: number;
}

export class OversellError extends Error {
  constructor(
    public readonly symbol: string,
    public readonly date: string,
    public readonly held: number,
    public readonly attempted: number,
  ) {
    super(
      `Cannot sell ${attempted} ${symbol} on ${date}: only ${held} held at that point.`,
    );
    this.name = "OversellError";
  }
}

export const toPaisa = (npr: number): number => Math.round(npr * 100);
export const fromPaisa = (paisa: number): number => paisa / 100;

/** Chronological order: date, then insertion time, then id (stable). */
export function sortTxns(txns: readonly Txn[]): Txn[] {
  return [...txns].sort(
    (a, b) =>
      a.txnDate.localeCompare(b.txnDate) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

/** round(a * b / c) using BigInt so large positions cannot overflow 2^53. */
function mulDivRound(a: number, b: number, c: number): number {
  const num = BigInt(a) * BigInt(b);
  const den = BigInt(c);
  return Number((num * 2n + den) / (den * 2n));
}

/** Replays transactions in order. Throws OversellError if a sell exceeds holdings. */
export function replay(txns: readonly Txn[]): Replay {
  const book = new Map<string, { qty: number; cost: number }>();
  let realized = 0;

  for (const t of sortTxns(txns)) {
    const pos = book.get(t.symbol) ?? { qty: 0, cost: 0 };
    const gross = t.quantity * toPaisa(t.price);
    const fees = toPaisa(t.fees);

    if (t.type === "buy") {
      pos.qty += t.quantity;
      pos.cost += gross + fees;
    } else {
      if (t.quantity > pos.qty) {
        throw new OversellError(t.symbol, t.txnDate, pos.qty, t.quantity);
      }
      const removed =
        t.quantity === pos.qty ? pos.cost : mulDivRound(pos.cost, t.quantity, pos.qty);
      realized += gross - fees - removed;
      pos.qty -= t.quantity;
      pos.cost -= removed;
    }
    book.set(t.symbol, pos);
  }

  const positions: Position[] = [];
  for (const [symbol, p] of book) {
    if (p.qty > 0) positions.push({ symbol, quantity: p.qty, costPaisa: p.cost });
  }
  positions.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { positions, realizedPaisa: realized };
}

/** Returns an error message if the sequence is invalid, otherwise null. */
export function validate(txns: readonly Txn[]): string | null {
  try {
    replay(txns);
    return null;
  } catch (e) {
    if (e instanceof OversellError) return e.message;
    throw e;
  }
}

// ------------------------------------------------------------- valuation

export interface PriceInput {
  /** Last traded price, NPR. */
  ltp: number;
  /** Previous close, NPR, when the source provides it. */
  previousClose: number | null;
}

export interface Holding {
  symbol: string;
  quantity: number;
  avgCost: number; // NPR per share
  invested: number; // NPR, cost basis of remaining shares
  /** Null when no price could be obtained. Never estimated. */
  price: number | null;
  value: number | null;
  pl: number | null;
  plPct: number | null;
  /** Today's change in NPR for this holding; null without a previous close. */
  dayChange: number | null;
  weightPct: number | null; // share of priced portfolio value
}

export interface Summary {
  totalValue: number; // value of priced holdings
  totalInvested: number; // cost basis of ALL open holdings
  investedPriced: number; // cost basis of priced holdings (basis for P/L)
  pl: number; // unrealised: totalValue - investedPriced
  plPct: number | null;
  dayChange: number;
  dayChangePct: number | null;
  holdingsCount: number;
  unpricedCount: number; // holdings excluded from value and P/L
  realized: number; // realised P/L from sells, NPR
}

export interface Valuation {
  holdings: Holding[];
  summary: Summary;
}

export function value(
  rep: Replay,
  prices: ReadonlyMap<string, PriceInput> | Record<string, PriceInput | undefined>,
): Valuation {
  const lookup = (s: string): PriceInput | undefined =>
    prices instanceof Map ? prices.get(s) : (prices as Record<string, PriceInput | undefined>)[s];

  let valueP = 0;
  let investedAllP = 0;
  let investedPricedP = 0;
  let dayP = 0;
  let dayBaseP = 0;
  let unpriced = 0;

  const rows = rep.positions.map((p) => {
    const q = lookup(p.symbol);
    const priceOk = q !== undefined && Number.isFinite(q.ltp) && q.ltp > 0;
    investedAllP += p.costPaisa;

    let valueRow: number | null = null;
    let dayRow: number | null = null;
    if (priceOk) {
      valueRow = p.quantity * toPaisa(q.ltp);
      valueP += valueRow;
      investedPricedP += p.costPaisa;
      if (q.previousClose !== null && q.previousClose > 0) {
        const base = p.quantity * toPaisa(q.previousClose);
        dayRow = valueRow - base;
        dayP += dayRow;
        dayBaseP += base;
      }
    } else {
      unpriced += 1;
    }

    return { p, price: priceOk ? q.ltp : null, valueRow, dayRow };
  });

  const holdings: Holding[] = rows.map(({ p, price, valueRow, dayRow }) => {
    const pl = valueRow === null ? null : valueRow - p.costPaisa;
    return {
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: fromPaisa(p.costPaisa) / p.quantity,
      invested: fromPaisa(p.costPaisa),
      price,
      value: valueRow === null ? null : fromPaisa(valueRow),
      pl: pl === null ? null : fromPaisa(pl),
      plPct: pl === null || p.costPaisa <= 0 ? null : (pl / p.costPaisa) * 100,
      dayChange: dayRow === null ? null : fromPaisa(dayRow),
      weightPct: valueRow === null || valueP <= 0 ? null : (valueRow / valueP) * 100,
    };
  });

  const plP = valueP - investedPricedP;
  return {
    holdings,
    summary: {
      totalValue: fromPaisa(valueP),
      totalInvested: fromPaisa(investedAllP),
      investedPriced: fromPaisa(investedPricedP),
      pl: fromPaisa(plP),
      plPct: investedPricedP > 0 ? (plP / investedPricedP) * 100 : null,
      dayChange: fromPaisa(dayP),
      dayChangePct: dayBaseP > 0 ? (dayP / dayBaseP) * 100 : null,
      holdingsCount: holdings.length,
      unpricedCount: unpriced,
      realized: fromPaisa(rep.realizedPaisa),
    },
  };
}
