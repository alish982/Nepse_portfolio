"use client";

import { useOptimistic, useState, useTransition } from "react";
import { addTransaction, deleteTransaction } from "@/app/(app)/actions";
import type { TxnView } from "@/lib/data";
import type { SearchHit } from "@/lib/nepse/service";
import { count, dateLabel, price } from "@/lib/format";
import { StockSearch } from "./StockSearch";
import { Notice } from "./ui";

type Row = TxnView & { pending?: boolean };
type Op = { kind: "add"; row: Row } | { kind: "del"; id: string };

const PAGE = 40;

export function TransactionsPanel({
  portfolioId,
  transactions,
  today,
}: {
  portfolioId: string;
  transactions: TxnView[];
  today: string;
}) {
  const [rows, mutate] = useOptimistic<Row[], Op>(transactions, (state, op) =>
    op.kind === "add" ? [...state, op.row] : state.filter((r) => r.id !== op.id),
  );

  const [type, setType] = useState<"buy" | "sell">("buy");
  const [stock, setStock] = useState<SearchHit | null>(null);
  const [quantity, setQuantity] = useState("");
  const [priceIn, setPriceIn] = useState("");
  const [date, setDate] = useState(today);
  const [fees, setFees] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [, startTransition] = useTransition();

  function choose(hit: SearchHit) {
    setStock(hit);
    setError(null);
    if (priceIn === "" && hit.ltp !== null) setPriceIn(String(hit.ltp));
  }

  async function submit(formData: FormData) {
    setError(null);
    if (!stock) {
      setError("Search for a stock and choose it from the list.");
      return;
    }
    formData.set("symbol", stock.symbol);
    formData.set("portfolioId", portfolioId);
    formData.set("type", type);

    mutate({
      kind: "add",
      row: {
        id: `pending-${Date.now()}`,
        symbol: stock.symbol,
        companyName: stock.name,
        type,
        quantity: Number(quantity) || 0,
        price: Number(priceIn) || 0,
        fees: Number(fees) || 0,
        txnDate: date,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    });

    const res = await addTransaction(formData);
    if (res.error) {
      setError(res.error); // the optimistic row rolls back automatically
      return;
    }
    setStock(null);
    setQuantity("");
    setPriceIn("");
    setFees("");
  }

  function remove(id: string) {
    setListError(null);
    startTransition(async () => {
      mutate({ kind: "del", id }); // optimistic; reverts if the action reports an error
      const res = await deleteTransaction(portfolioId, id);
      if (res.error) setListError(res.error);
    });
  }

  const ordered = [...rows].sort(
    (a, b) => b.txnDate.localeCompare(a.txnDate) || b.createdAt.localeCompare(a.createdAt),
  );
  const visible = showAll ? ordered : ordered.slice(0, PAGE);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <section aria-labelledby="add-txn" className="panel h-fit p-5 sm:p-6">
        <h2 id="add-txn" className="text-2xl">Add a transaction</h2>
        <form action={submit} className="mt-5 space-y-4">
          <fieldset>
            <legend className="label">Type</legend>
            <div className="grid grid-cols-2 border border-gold/40">
              {(["buy", "sell"] as const).map((t) => (
                <label
                  key={t}
                  className={`flex min-h-11 cursor-pointer items-center justify-center text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold ${
                    type === t ? (t === "buy" ? "bg-emerald text-ivory" : "bg-garnet-deep text-ivory") : "text-mute hover:text-ivory"
                  }`}
                >
                  <input type="radio" name="type-ui" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
                  {t === "buy" ? "Buy" : "Sell"}
                </label>
              ))}
            </div>
          </fieldset>

          {stock ? (
            <div>
              <span className="label">Stock</span>
              <div className="flex items-center justify-between gap-3 border border-gold/40 bg-coal-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="font-display text-lg">{stock.symbol}</span>
                  <span className="block truncate text-sm text-mute">{stock.name}</span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStock(null)}>Change</button>
              </div>
            </div>
          ) : (
            <StockSearch onSelect={choose} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="qty" className="label">Quantity</label>
              <input id="qty" name="quantity" className="field" inputMode="numeric" pattern="[0-9]*" required placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div>
              <label htmlFor="px" className="label">Price per share (Rs)</label>
              <input id="px" name="price" className="field" inputMode="decimal" required placeholder="0.00" value={priceIn} onChange={(e) => setPriceIn(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div>
              <label htmlFor="dt" className="label">Date</label>
              <input id="dt" name="date" type="date" className="field" required max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="fees" className="label">Fees (Rs, optional)</label>
              <input id="fees" name="fees" className="field" inputMode="decimal" placeholder="0.00" value={fees} onChange={(e) => setFees(e.target.value.replace(/[^\d.]/g, ""))} />
            </div>
          </div>

          {Number(quantity) > 0 && Number(priceIn) > 0 && (
            <p className="text-sm text-mute">
              {type === "buy" ? "Total cost" : "Proceeds"}: Rs{" "}
              {price(Number(quantity) * Number(priceIn) + (type === "buy" ? 1 : -1) * (Number(fees) || 0))}
            </p>
          )}

          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className="btn w-full">{type === "buy" ? "Add purchase" : "Add sale"}</button>
        </form>
      </section>

      <section aria-labelledby="txn-list" className="min-w-0">
        <h2 id="txn-list" className="text-2xl">Transactions <span className="text-mute">({rows.length})</span></h2>
        {listError && <div className="mt-4"><Notice tone="error">{listError}</Notice></div>}
        {rows.length === 0 ? (
          <p className="mt-4 border border-dashed border-gold-deep/60 px-5 py-10 text-center text-mute">
            No transactions in this portfolio yet. Add your first buy and your holdings appear here and on the dashboard.
          </p>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-gold-deep/40 border-y border-gold-deep/40">
              {visible.map((r) => (
                <li key={r.id} className={`flex items-center justify-between gap-4 py-3 ${r.pending ? "opacity-60" : ""}`}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-3">
                      <span className={`text-sm font-medium ${r.type === "buy" ? "text-emerald-lit" : "text-garnet"}`}>{r.type === "buy" ? "Bought" : "Sold"}</span>
                      <span className="font-display text-lg">{r.symbol}</span>
                      <span className="text-sm text-mute">{dateLabel(r.txnDate)}</span>
                    </p>
                    <p className="text-sm text-mute">
                      {count(r.quantity)} × Rs {price(r.price)}
                      {r.fees > 0 && <> · fees Rs {price(r.fees)}</>}
                      {r.pending && <> · Saving…</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={r.pending}
                    onClick={() => remove(r.id)}
                    className="btn btn-danger btn-sm shrink-0"
                    aria-label={`Delete ${r.type} of ${r.symbol} on ${dateLabel(r.txnDate)}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            {!showAll && ordered.length > PAGE && (
              <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={() => setShowAll(true)}>
                Show all {ordered.length}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
