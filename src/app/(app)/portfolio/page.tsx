import type { Metadata } from "next";
import { ImportPanel } from "@/components/ImportPanel";
import { HoldingsTable } from "@/components/HoldingsTable";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MarketStatus } from "@/components/MarketStatus";
import { ManagePortfolio } from "@/components/PortfolioForms";
import { TransactionsPanel } from "@/components/TransactionsPanel";
import { Delta, PageHeader, Stat, Notice } from "@/components/ui";
import { getActivePortfolio, loadPortfolioView } from "@/lib/data";
import { money, signedMoney } from "@/lib/format";
import { todayNpt } from "@/lib/nepse/service";

export const metadata: Metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const { active, all } = await getActivePortfolio();
  const view = await loadPortfolioView(active.id);
  const s = view.summary;

  return (
    <>
      <LiveRefresh />
      <PageHeader title={active.name}>
        <ManagePortfolio portfolio={active} canDelete={all.length > 1} txnCount={view.transactions.length} />
      </PageHeader>

      <div className="space-y-12">
        <section aria-label="Holdings" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl">Holdings</h2>
            <MarketStatus snapshot={view.book.snapshot} />
          </div>

          {s.holdingsCount === 0 ? (
            <p className="border border-dashed border-gold-deep/60 px-5 py-10 text-center text-mute">
              No open holdings. Add a purchase below to start tracking.
            </p>
          ) : (
            <>
              {s.unpricedCount > 0 && (
                <Notice tone="warn">
                  {s.unpricedCount === 1 ? "1 holding has" : `${s.unpricedCount} holdings have`} no price right now and {s.unpricedCount === 1 ? "is" : "are"} excluded from value and P/L.
                </Notice>
              )}
              <dl className="grid grid-cols-2 gap-6 border-y border-gold-deep/40 py-5 lg:grid-cols-4">
                <Stat label="Value">{money(s.unpricedCount === s.holdingsCount ? null : s.totalValue)}</Stat>
                <Stat label="Invested">{money(s.totalInvested)}</Stat>
                <Stat label="Unrealised P/L"><Delta value={s.unpricedCount === s.holdingsCount ? null : s.pl}>{signedMoney(s.unpricedCount === s.holdingsCount ? null : s.pl)}</Delta></Stat>
                <Stat label="Realised P/L" sub="From sells in this portfolio"><Delta value={s.realized}>{signedMoney(s.realized)}</Delta></Stat>
              </dl>
              <HoldingsTable holdings={view.holdings} names={view.names} prevClose={view.book.prices} showRange />
            </>
          )}
        </section>

        <ImportPanel portfolioId={active.id} today={todayNpt()} />

        <TransactionsPanel portfolioId={active.id} transactions={view.transactions} today={todayNpt()} />
      </div>
    </>
  );
}
