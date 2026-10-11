import { isMarketHours, todayNpt } from "@/lib/nepse/service";
import type { Snapshot } from "@/lib/nepse/service";
import { nptStamp, stampFromIso } from "@/lib/format";

/** One line telling the truth about how fresh the numbers are. */
export function MarketStatus({ snapshot }: { snapshot: Snapshot }) {
  const open = isMarketHours();
  // Prefer the provider's own timestamp; fall back to when we last fetched.
  const asOf = snapshot.asOf ? `${stampFromIso(snapshot.asOf)} NPT` : snapshot.fetchedAt ? `${nptStamp(snapshot.fetchedAt)} NPT` : null;
  let text: string;
  let warn = false;
  if (snapshot.unavailable) {
    text = "Market data is unavailable right now. Prices are not shown rather than guessed.";
    warn = true;
  } else if (snapshot.stale && asOf) {
    text = `Market data source unreachable. Showing the last saved prices, as of ${asOf}.`;
    warn = true;
  } else if (asOf && open && snapshot.asOf && snapshot.asOf.slice(0, 10) < todayNpt()) {
    // The market is open but the provider has not published today's prices yet.
    text = `Market open, but the data source hasn't published today's prices yet. Showing prices as of ${asOf}.`;
    warn = true;
  } else if (asOf) {
    text = `${open ? "Market open" : "Market closed"}. Prices as of ${asOf}, and may be delayed.`;
  } else {
    text = "Market data not loaded.";
    warn = true;
  }
  return (
    <p className={`flex items-center gap-2 text-sm ${warn ? "text-gold" : "text-mute"}`} role="status">
      <span aria-hidden className={`inline-block size-2 shrink-0 rotate-45 ${warn ? "bg-gold" : open ? "bg-emerald-lit" : "bg-faint"}`} />
      {text}
    </p>
  );
}
