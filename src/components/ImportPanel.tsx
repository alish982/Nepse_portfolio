"use client";

import { useRef, useState } from "react";
import { importHoldings, previewImport, type PreviewRow } from "@/app/(app)/actions";
import type { Skipped } from "@/lib/import/parse";
import { count, price } from "@/lib/format";
import { Notice } from "./ui";

interface Row extends PreviewRow {
  include: boolean;
  cost: string; // text so the user can type freely
}

type Stage = "idle" | "reading" | "preview" | "saving";

const COST_RE = /^\d+(\.\d{1,2})?$/;
const validCost = (s: string) => COST_RE.test(s) && Number(s) > 0;

export function ImportPanel({ portfolioId, today }: { portfolioId: string; today: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStage("idle");
    setRows([]);
    setSkipped([]);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setDone(null);
    setStage("reading");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("portfolioId", portfolioId);
    try {
      const res = await previewImport(fd);
      if (res.error || !res.rows) {
        setError(res.error ?? "Couldn't read that file.");
        setSkipped(res.skipped ?? []);
        setStage("idle");
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      setSkipped(res.skipped ?? []);
      setRows(
        res.rows.map((r) => ({
          ...r,
          include: r.known && r.heldQty === 0, // never double-count by default
          cost: r.price !== null ? String(r.price) : "",
        })),
      );
      setStage("preview");
    } catch {
      setError("Couldn't upload that file. Check your connection and try again.");
      setStage("idle");
    }
  }

  const patch = (symbol: string, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.symbol === symbol ? { ...r, ...change } : r)));

  const selected = rows.filter((r) => r.include && r.known);
  const missingCost = selected.filter((r) => !validCost(r.cost)).length;
  const canImport = selected.length > 0 && missingCost === 0 && stage === "preview";
  const fillable = rows.filter((r) => r.include && r.known && !validCost(r.cost) && r.ltp !== null).length;

  function fillWithMarketPrice() {
    setRows((rs) =>
      rs.map((r) => (r.include && r.known && !validCost(r.cost) && r.ltp !== null ? { ...r, cost: r.ltp.toFixed(2) } : r)),
    );
  }

  async function submit() {
    setError(null);
    setStage("saving");
    const res = await importHoldings({
      portfolioId,
      date,
      rows: selected.map((r) => ({ symbol: r.symbol, quantity: r.quantity, price: Number(r.cost) })),
    });
    if (res.error) {
      setError(res.error);
      setStage("preview");
      return;
    }
    setDone(`Imported ${res.count} holding${res.count === 1 ? "" : "s"} as purchases dated ${date}.`);
    reset();
  }

  return (
    <section aria-labelledby="import-h" className="panel p-5 sm:p-6">
      <h2 id="import-h" className="text-2xl">Import holdings</h2>
      <p className="mt-2 max-w-2xl text-mute">
        Upload your Demat <em className="not-italic text-ivory">My Shares</em> statement as a CSV or PDF. The file is read in memory and not stored, and only the symbols and quantities are used.
      </p>

      {done && <div className="mt-4"><Notice>{done}</Notice></div>}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      {stage !== "preview" && stage !== "saving" && (
        <div className="mt-5">
          <label htmlFor="import-file" className="btn btn-ghost cursor-pointer has-[:disabled]:opacity-60">
            {stage === "reading" ? "Reading file…" : "Choose CSV or PDF"}
          </label>
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept=".csv,.txt,.pdf,text/csv,application/pdf"
            className="sr-only"
            disabled={stage === "reading"}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
      )}

      {(stage === "preview" || stage === "saving") && (
        <div className="mt-6 space-y-5">
          <Notice tone="warn">
            A statement shows how many shares you hold, not what you paid. Enter your cost per share for each holding, or use today's price to start tracking from today (profit and loss then begins at zero).
          </Notice>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="import-date" className="label">Holding since</label>
              <input id="import-date" type="date" className="field" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button type="button" className="btn btn-ghost" onClick={fillWithMarketPrice} disabled={fillable === 0}>
              Use today's price for empty rows{fillable > 0 ? ` (${fillable})` : ""}
            </button>
          </div>

          <ul className="divide-y divide-gold-deep/40 border-y border-gold-deep/40">
            {rows.map((r) => {
              const invalid = r.include && r.known && !validCost(r.cost);
              return (
                <li key={r.symbol} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <label className="flex min-w-0 flex-1 basis-56 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-5 shrink-0 accent-[#c9a961]"
                      checked={r.include}
                      disabled={!r.known}
                      onChange={(e) => patch(r.symbol, { include: e.target.checked })}
                    />
                    <span className="min-w-0">
                      <span className="font-display text-lg">{r.symbol}</span>
                      <span className="block truncate text-sm text-mute">
                        {!r.known
                          ? "Not a listed NEPSE symbol, so it can't be imported"
                          : r.heldQty > 0
                            ? `${r.name ?? ""} · already holds ${count(r.heldQty)} here. Importing adds to it`
                            : r.name}
                      </span>
                    </span>
                  </label>
                  <span className="w-20 text-right">{count(r.quantity)} <span className="text-sm text-mute">sh</span></span>
                  <div className="w-36">
                    <label htmlFor={`cost-${r.symbol}`} className="sr-only">Cost per share for {r.symbol}</label>
                    <input
                      id={`cost-${r.symbol}`}
                      className="field min-h-10"
                      inputMode="decimal"
                      placeholder={r.ltp !== null ? `Cost (now ${price(r.ltp)})` : "Cost per share"}
                      disabled={!r.include || !r.known}
                      aria-invalid={invalid}
                      value={r.cost}
                      onChange={(e) => patch(r.symbol, { cost: e.target.value.replace(/[^\d.]/g, "") })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {skipped.length > 0 && (
            <details className="text-sm text-mute">
              <summary className="cursor-pointer">{skipped.length} line{skipped.length === 1 ? "" : "s"} skipped</summary>
              <ul className="mt-2 space-y-1">
                {skipped.map((s, i) => <li key={i}>{s.line}: {s.reason}</li>)}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled={!canImport} onClick={submit}>
              {stage === "saving" ? "Importing…" : `Import ${selected.length} holding${selected.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={stage === "saving"}>Cancel</button>
            {selected.length > 0 && missingCost > 0 && (
              <span className="text-sm text-gold">{missingCost} selected row{missingCost === 1 ? " needs" : "s need"} a cost per share.</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
