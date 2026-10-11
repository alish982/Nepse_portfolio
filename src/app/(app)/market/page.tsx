import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MarketSearch } from "@/components/MarketSearch";
import { MarketStatus } from "@/components/MarketStatus";
import { Delta, Empty, PageHeader } from "@/components/ui";
import { Week52, Week52Skeleton } from "@/components/Week52";
import { requireUser } from "@/lib/data";
import { count, dash, pct, price, signed, stampFromIso } from "@/lib/format";
import { getCompanies, getDetails, getSnapshot, SYMBOL_RE, type Quote } from "@/lib/nepse/service";

export const metadata: Metadata = { title: "Market" };

function Movers({ title, rows, metric }: { title: string; rows: Quote[]; metric: "pct" | "volume" }) {
  return (
    <section className="panel panel-quiet p-5" aria-label={title}>
      <h2 className="text-xl">{title}</h2>
      <ol className="mt-3 divide-y divide-gold-deep/30">
        {rows.map((q) => (
          <li key={q.symbol} className="flex items-center justify-between gap-3 py-2.5">
            <Link href={`/market?symbol=${q.symbol}`} className="min-w-0 hover:text-gold">
              <span className="font-display text-lg">{q.symbol}</span>
              <span className="block truncate text-sm text-mute">{q.name}</span>
            </Link>
            <span className="shrink-0 text-right text-sm">
              {price(q.ltp)}
              <span className="block">
                {metric === "pct" ? <Delta value={q.changePct}>{pct(q.changePct)}</Delta> : <span className="text-mute">{count(q.volume)} shares</span>}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-mute">{label}</dt>
      <dd className="mt-0.5 text-lg">{children}</dd>
    </div>
  );
}

async function StockCard({ symbol }: { symbol: string }) {
  const [snapshot, companies, details] = await Promise.all([getSnapshot(), getCompanies(), getDetails(symbol)]);
  const q = snapshot.quotes[symbol];
  const company = companies.find((c) => c.symbol === symbol);
  const name = q?.name ?? company?.name;

  if (!q && !company && !details) {
    return <Empty title={`No stock found for “${symbol}”`}>Check the symbol, or use the search above.</Empty>;
  }

  // If it hasn't traded today the bulk feed omits it; fall back to its own details.
  const ltp = q?.ltp ?? details?.ltp ?? null;
  const prev = q?.previousClose ?? details?.previousClose ?? null;
  const change = q?.change ?? (ltp !== null && prev !== null ? Math.round((ltp - prev) * 100) / 100 : null);
  const changePct = q?.changePct ?? (change !== null && prev ? Math.round((change / prev) * 10000) / 100 : null);
  const volume = q?.volume ?? details?.volume ?? null;

  return (
    <section className="panel p-6 sm:p-8" aria-label={`${symbol} quote`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-4xl">{symbol}</h2>
          <p className="mt-1 text-mute">{name ?? dash}{company?.sector ? ` · ${company.sector}` : ""}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-4xl sm:text-5xl">{ltp === null ? dash : `Rs ${price(ltp)}`}</p>
          <p className="mt-1">
            <Delta value={change}>{signed(change)}</Delta>{" "}
            <Delta value={changePct} glyph={false}>({pct(changePct)})</Delta>
          </p>
        </div>
      </div>
      {ltp === null && <p className="mt-4 text-gold">No price is available for this stock right now.</p>}
      <div className="rule my-6" aria-hidden />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
        <Fact label="Previous close">{price(prev)}</Fact>
        <Fact label="Day high">{price(q?.high)}</Fact>
        <Fact label="Day low">{price(q?.low)}</Fact>
        <Fact label="Volume">{count(volume)}</Fact>
        <Fact label="52-week range (closing prices)">
          <Suspense fallback={<Week52Skeleton />}><Week52 symbol={symbol} ltp={ltp} /></Suspense>
        </Fact>
        <Fact label="Last update">{q?.updatedAt ? `${stampFromIso(q.updatedAt)} NPT` : dash}</Fact>
      </dl>
    </section>
  );
}

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ symbol?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const symbol = (sp.symbol ?? "").trim().toUpperCase();
  const snapshot = await getSnapshot();

  const traded = Object.values(snapshot.quotes).filter((q) => q.volume !== null && q.volume > 0);
  const withPct = traded.filter((q) => q.changePct !== null);
  const gainers = [...withPct].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).filter((q) => (q.changePct ?? 0) > 0).slice(0, 5);
  const losers = [...withPct].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).filter((q) => (q.changePct ?? 0) < 0).slice(0, 5);
  const active = [...traded].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 5);

  return (
    <>
      <LiveRefresh />
      <PageHeader title="Market">
        <MarketStatus snapshot={snapshot} />
      </PageHeader>

      <div className="space-y-8">
        <MarketSearch />

        {SYMBOL_RE.test(symbol) && <StockCard symbol={symbol} />}

        {snapshot.unavailable ? (
          <Empty title="Market data is unavailable">
            The NEPSE data source isn't responding and nothing has been saved yet. Try again in a minute.
          </Empty>
        ) : traded.length === 0 ? (
          <Empty title="No trades to show">The data source returned no traded stocks for the latest session.</Empty>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <Movers title="Top gainers" rows={gainers} metric="pct" />
            <Movers title="Top losers" rows={losers} metric="pct" />
            <Movers title="Most active" rows={active} metric="volume" />
          </div>
        )}
      </div>
    </>
  );
}
