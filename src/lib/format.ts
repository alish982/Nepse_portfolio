// Indian/Nepali digit grouping (12,34,567.00) via the en-IN locale.
const two = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const dash = "—";

export const money = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? dash : `Rs ${two.format(n)}`;

export const price = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? dash : two.format(n);

export const count = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? dash : whole.format(n);

export const signed = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? dash : `${n > 0 ? "+" : n < 0 ? "−" : ""}${two.format(Math.abs(n))}`;

export const signedMoney = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? dash : `${n > 0 ? "+" : n < 0 ? "−" : ""}Rs ${two.format(Math.abs(n))}`;

export const pct = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? dash : `${n > 0 ? "+" : n < 0 ? "−" : ""}${two.format(Math.abs(n))}%`;

export type Tone = "gain" | "loss" | "flat";
export const tone = (n: number | null | undefined): Tone =>
  n === null || n === undefined || Math.abs(n) < 0.005 ? "flat" : n > 0 ? "gain" : "loss";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** YYYY-MM-DD -> "8 Oct 2026" without any timezone conversion. */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  return y && m && d && month ? `${Number(d)} ${month} ${y}` : iso;
}

const nptTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kathmandu",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  day: "numeric",
  month: "short",
});
export const nptStamp = (ms: number): string => nptTime.format(new Date(ms));

/** Provider timestamp (already Nepal local time, e.g. "2026-10-06T14:59:41") -> "6 Oct, 2:59 pm". No timezone maths. */
export function stampFromIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, , mo, d, hh, mm] = m;
  const month = MONTHS[Number(mo) - 1];
  const h = Number(hh);
  if (!month || h > 23) return iso;
  return `${Number(d)} ${month}, ${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? "am" : "pm"}`;
}
