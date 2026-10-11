import Link from "next/link";
import { Suspense } from "react";
import type { Holding } from "@/lib/portfolio/calc";
import { count, dash, money, pct, price, signedMoney } from "@/lib/format";
import { Delta } from "./ui";
import { Week52, Week52Skeleton } from "./Week52";

interface Props {
  holdings: Holding[];
  names: Record<string, string>;
  /** previous closes, to show today's % move under the latest price */
  prevClose: ReadonlyMap<string, { ltp: number; previousClose: number | null }>;
  showRange?: boolean;
}

function dayPct(ltp: number | null, prev: number | null | undefined): number | null {
  if (ltp === null || !prev || prev <= 0) return null;
  return ((ltp - prev) / prev) * 100;
}

export function HoldingsTable({ holdings, names, prevClose, showRange = false }: Props) {
  const sorted = [...holdings].sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

  return (
    <>
      {/* Phones: one stacked row per holding */}
      <ul className="divide-y divide-gold-deep/40 md:hidden">
        {sorted.map((h) => {
          const d = dayPct(h.price, prevClose.get(h.symbol)?.previousClose);
          return (
            <li key={h.symbol} className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link href={`/market?symbol=${h.symbol}`} className="font-display text-xl hover:text-gold">
                    {h.symbol}
                  </Link>
                  <p className="truncate text-sm text-mute">{names[h.symbol] ?? ""}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl">{money(h.value)}</p>
                  {h.pl !== null && (
                    <p className="text-sm">
                      <Delta value={h.pl}>{signedMoney(h.pl)}</Delta>{" "}
                      <Delta value={h.plPct} glyph={false}>({pct(h.plPct)})</Delta>
                    </p>
                  )}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-faint">Qty</dt><dd>{count(h.quantity)}</dd></div>
                <div><dt className="text-faint">Avg cost</dt><dd>{price(h.avgCost)}</dd></div>
                <div>
                  <dt className="text-faint">Latest</dt>
                  <dd>
                    {price(h.price)} {d !== null && <Delta value={d} glyph={false}><span className="text-xs">{pct(d)}</span></Delta>}
                  </dd>
                </div>
              </dl>
              {h.price === null && <p className="mt-2 text-sm text-gold">No price available for this stock right now.</p>}
              {showRange && (
                <p className="mt-2 text-sm"><span className="text-faint">52-week </span>
                  <Suspense fallback={<Week52Skeleton />}><Week52 symbol={h.symbol} ltp={h.price} /></Suspense>
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* Tablet and up: the full table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[44rem] text-left">
          <thead>
            <tr className="border-b border-gold-deep/60 text-sm text-mute">
              <th scope="col" className="py-3 pr-4 font-normal">Stock</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">Qty</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">Avg cost</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">Latest</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">Value</th>
              <th scope="col" className="px-3 py-3 text-right font-normal">P/L</th>
              <th scope="col" className={`py-3 pl-3 text-right font-normal ${showRange ? "pr-3" : ""}`}>P/L %</th>
              {showRange && <th scope="col" className="py-3 pl-3 font-normal">52-week range</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gold-deep/30">
            {sorted.map((h) => {
              const d = dayPct(h.price, prevClose.get(h.symbol)?.previousClose);
              return (
                <tr key={h.symbol} className="align-top hover:bg-gold/[.04]">
                  <th scope="row" className="py-4 pr-4 font-normal">
                    <Link href={`/market?symbol=${h.symbol}`} className="font-display text-lg hover:text-gold">{h.symbol}</Link>
                    <span className="block max-w-56 truncate text-sm text-mute">{names[h.symbol] ?? ""}</span>
                  </th>
                  <td className="whitespace-nowrap px-3 py-4 text-right">{count(h.quantity)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">{price(h.avgCost)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">
                    {h.price === null ? (
                      <span className="text-gold" title="No price available from the market data source">{dash}</span>
                    ) : (
                      <>
                        {price(h.price)}
                        {d !== null && <span className="block text-sm"><Delta value={d}>{pct(d)}</Delta></span>}
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-right">{money(h.value)}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-right"><Delta value={h.pl} glyph={false}>{signedMoney(h.pl)}</Delta></td>
                  <td className={`whitespace-nowrap py-4 pl-3 text-right ${showRange ? "pr-3" : ""}`}><Delta value={h.plPct}>{pct(h.plPct)}</Delta></td>
                  {showRange && (
                    <td className="py-4 pl-3">
                      <Suspense fallback={<Week52Skeleton />}><Week52 symbol={h.symbol} ltp={h.price} /></Suspense>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
