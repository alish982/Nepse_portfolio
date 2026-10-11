import type { Metadata } from "next";
import Link from "next/link";
import { AllocationDonut } from "@/components/AllocationDonut";
import { HoldingsTable } from "@/components/HoldingsTable";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MarketStatus } from "@/components/MarketStatus";
import { Delta, Empty, Notice, PageHeader, Stat } from "@/components/ui";
import { getActivePortfolio, loadPortfolioView } from "@/lib/data";
import { count, money, pct, signedMoney } from "@/lib/format";
import { isMarketHours } from "@/lib/nepse/service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { active } = await getActivePortfolio();
  const view = await loadPortfolioView(active.id);
  const s = view.summary;
  const open = isMarketHours();
  const noPrices = s.unpricedCount === s.holdingsCount; // nothing priced: show dashes, not zeros

  return (
    <>
      <LiveRefresh />
      <PageHeader title={active.name}>
        <MarketStatus snapshot={view.book.snapshot} />
      </PageHeader>

      {s.holdingsCount === 0 ? (
        <Empty
          title="This portfolio is empty"
          action={<Link href="/portfolio" className="btn">Add your first transaction</Link>}
        >
          Record a purchase and your value, profit and loss and allocation will appear here.
        </Empty>
      ) : (
        <div className="space-y-8">
          {s.unpricedCount > 0 && (
            <Notice tone="warn">
              {s.unpricedCount === 1 ? "1 holding has" : `${s.unpricedCount} holdings have`} no price from the market data source right now. {s.unpricedCount === 1 ? "It is" : "They are"} left out of value, P/L and today's change, but still counted in total invested.
            </Notice>
          )}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <section aria-label="Portfolio summary" className="panel p-6 sm:p-8">
              <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Stat label="Total portfolio value" large>{money(noPrices ? null : s.totalValue)}</Stat>
                </div>
                <Stat label="Total invested">{money(s.totalInvested)}</Stat>
                <Stat label="Total profit / loss">
                  <Delta value={noPrices ? null : s.pl}>{signedMoney(noPrices ? null : s.pl)}</Delta>
                </Stat>
                <Stat label="Return">
                  <Delta value={s.plPct}>{pct(s.plPct)}</Delta>
                </Stat>
                <Stat label="Today's change" sub={open ? undefined : "Change in the last session"}>
                  <Delta value={s.dayChangePct === null ? null : s.dayChange}>{signedMoney(s.dayChangePct === null ? null : s.dayChange)}</Delta>
                  <span className="ml-2 text-lg"><Delta value={s.dayChangePct} glyph={false}>{pct(s.dayChangePct)}</Delta></span>
                </Stat>
                <Stat label="Holdings">{count(s.holdingsCount)}</Stat>
              </dl>
            </section>
            <section aria-labelledby="alloc-h" className="panel p-6">
              <h2 id="alloc-h" className="mb-5 text-2xl">Allocation</h2>
              {noPrices ? <p className="text-mute">Allocation appears once prices are available.</p> : <AllocationDonut holdings={view.holdings} />}
            </section>
          </div>

          <section aria-labelledby="holdings-h" className="min-w-0">
            <h2 id="holdings-h" className="mb-3 text-2xl">Holdings</h2>
            <HoldingsTable holdings={view.holdings} names={view.names} prevClose={view.book.prices} />
          </section>
        </div>
      )}
    </>
  );
}
