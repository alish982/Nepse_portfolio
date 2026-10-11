import type { ReactNode } from "react";
import { tone, type Tone } from "@/lib/format";

const TONE_CLASS: Record<Tone, string> = {
  gain: "text-emerald-lit",
  loss: "text-garnet",
  flat: "text-mute",
};
// Direction is also encoded as a glyph so colour is never the only signal.
const GLYPH: Record<Tone, string> = { gain: "▲", loss: "▼", flat: "◆" };

export function Delta({ value, children, glyph = true }: { value: number | null | undefined; children: ReactNode; glyph?: boolean }) {
  const t = value === null || value === undefined ? "flat" : tone(value);
  return (
    <span className={`${TONE_CLASS[t]} whitespace-nowrap`}>
      {glyph && value !== null && value !== undefined && (
        <span aria-hidden className="mr-1 text-[.65em] align-[.1em]">{GLYPH[t]}</span>
      )}
      {children}
    </span>
  );
}

export function Stat({
  label,
  children,
  sub,
  large = false,
}: {
  label: string;
  children: ReactNode;
  sub?: ReactNode;
  large?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className={`font-display mt-1 break-words ${large ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"}`}>{children}</dd>
      {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl sm:text-5xl">{title}</h1>
        {children}
      </div>
      <div className="rule mt-5" aria-hidden />
    </header>
  );
}

export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel panel-quiet px-6 py-12 text-center">
      <h2 className="text-2xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-mute">{children}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Notice({ tone: t = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const cls =
    t === "error"
      ? "border-garnet/60 bg-garnet-deep/40 text-ivory"
      : t === "warn"
        ? "border-gold/50 bg-gold/10 text-ivory"
        : "border-emerald-lit/40 bg-emerald/30 text-ivory";
  return (
    <p role={t === "error" ? "alert" : "status"} className={`border px-4 py-3 text-sm ${cls}`}>
      {children}
    </p>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display inline-flex items-center gap-2.5 text-2xl ${className}`}>
      <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden className="text-gold">
        <path d="M1 26V11a10 10 0 0 1 20 0v15M5 26V11a6 6 0 0 1 12 0v15" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M11 26V8" stroke="currentColor" strokeWidth="1.2" />
      </svg>
      Mohar
    </span>
  );
}
