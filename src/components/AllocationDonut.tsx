import type { Holding } from "@/lib/portfolio/calc";
import { pct as fmtPct } from "@/lib/format";

// Gold, emerald, ivory, bronze, sage, clay, then a neutral for "Other".
const COLORS = ["#c9a961", "#2f9d7a", "#e9dfc6", "#8b6a37", "#5f8d86", "#a65e50"];
const OTHER = "#6a675c";
const R = 46;
const C = 2 * Math.PI * R;
const GAP = 1.2;

/** Server-rendered SVG: no chart library and no client JavaScript. */
export function AllocationDonut({ holdings }: { holdings: Holding[] }) {
  const priced = holdings.filter((h) => h.value !== null && h.value > 0 && h.weightPct !== null);
  if (priced.length === 0) return null;

  const sorted = [...priced].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const head = sorted.slice(0, COLORS.length);
  const tail = sorted.slice(COLORS.length);
  const slices = head.map((h, i) => ({ label: h.symbol, weight: h.weightPct ?? 0, color: COLORS[i] ?? OTHER }));
  if (tail.length > 0) {
    slices.push({ label: `Other (${tail.length})`, weight: tail.reduce((s, h) => s + (h.weightPct ?? 0), 0), color: OTHER });
  }

  let acc = 0;
  const arcs = slices.map((s) => {
    const len = Math.max(0, (s.weight / 100) * C - (slices.length > 1 ? GAP : 0));
    const arc = { ...s, len, offset: -acc };
    acc += (s.weight / 100) * C;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-6">
      <svg
        viewBox="0 0 120 120"
        className="size-44 shrink-0"
        role="img"
        aria-label={`Allocation by value: ${slices.map((s) => `${s.label} ${fmtPct(s.weight).replace("+", "")}`).join(", ")}`}
      >
        <circle cx="60" cy="60" r="55" fill="none" stroke="#8d7742" strokeOpacity=".5" strokeWidth=".6" />
        <circle cx="60" cy="60" r="37" fill="none" stroke="#8d7742" strokeOpacity=".5" strokeWidth=".6" />
        <g transform="rotate(-90 60 60)">
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx="60" cy="60" r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="14"
              strokeDasharray={`${a.len} ${C - a.len}`}
              strokeDashoffset={a.offset}
            />
          ))}
        </g>
        <text x="60" y="58" textAnchor="middle" className="fill-ivory" style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>
          {holdings.length}
        </text>
        <text x="60" y="73" textAnchor="middle" className="fill-mute" style={{ fontSize: 8 }}>
          {holdings.length === 1 ? "holding" : "holdings"}
        </text>
      </svg>
      <ul className="w-full min-w-0 space-y-2.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span aria-hidden className="size-3 shrink-0 rotate-45" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="text-mute">{fmtPct(s.weight).replace("+", "")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
