import { getDetails } from "@/lib/nepse/service";
import { dash, price } from "@/lib/format";

export function Week52Skeleton() {
  return <span className="skeleton inline-block h-4 w-28 align-middle" aria-label="Loading 52-week range" />;
}

/** 52-week low/high with a marker for where the latest price sits. Streams in; shows a dash when the source has no data. */
export async function Week52({ symbol, ltp }: { symbol: string; ltp: number | null }) {
  const d = await getDetails(symbol);
  const lo = d?.low52 ?? null;
  const hi = d?.high52 ?? null;
  if (lo === null || hi === null || hi <= lo) {
    if (lo === null && hi === null) return <span className="text-faint">{dash}</span>;
    return (
      <span className="text-mute">
        {price(lo)} to {price(hi)}
      </span>
    );
  }
  const pos = ltp === null ? null : Math.min(1, Math.max(0, (ltp - lo) / (hi - lo)));
  return (
    <span className="inline-flex flex-col gap-1.5" title="Lowest and highest daily closing price over the last 365 days">
      <span className="text-sm">
        {price(lo)} <span className="text-faint">to</span> {price(hi)}
      </span>
      {pos !== null && (
        <span className="relative block h-px w-full min-w-28 bg-gold-deep" role="img" aria-label={`Latest price is ${Math.round(pos * 100)}% of the way from the 52-week low to the high`}>
          <span className="absolute top-1/2 block size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-gold" style={{ left: `${pos * 100}%` }} />
        </span>
      )}
    </span>
  );
}
