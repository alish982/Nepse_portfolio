"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 45_000;

/** NEPSE trades Sun-Thu 11:00-15:00 NPT (UTC+5:45). Refresh server data only then, and only while visible. */
function marketOpenNow(): boolean {
  const d = new Date(Date.now() + (5 * 60 + 45) * 60_000);
  const day = d.getUTCDay();
  if (day === 5 || day === 6) return false;
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return mins >= 11 * 60 && mins < 15 * 60;
}

/**
 * Polling is deliberate. The upstream API is request/response and data only
 * changes during four hours a day, so a persistent WebSocket would add a
 * long-lived connection (which serverless hosts do not keep) for no gain.
 * router.refresh() re-renders server components; the server cache de-duplicates.
 */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible" && marketOpenNow()) router.refresh();
    }, EVERY_MS);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
