"use client";

import { useRouter } from "next/navigation";
import { StockSearch } from "./StockSearch";

export function MarketSearch() {
  const router = useRouter();
  return (
    <div className="max-w-xl">
      <StockSearch label="Look up a stock" onSelect={(h) => router.push(`/market?symbol=${h.symbol}`)} />
    </div>
  );
}
