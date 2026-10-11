import Link from "next/link";
import { Wordmark } from "@/components/ui";

function Arches() {
  // Concentric stepped arches: the page's one memorable ornament.
  const arches = Array.from({ length: 6 }, (_, i) => {
    const inset = i * 20;
    const r = (400 - inset * 2) / 2;
    return `M${inset} 520V${r + inset}A${r} ${r} 0 0 1 ${400 - inset} ${r + inset}V520`;
  });
  return (
    <svg viewBox="0 0 400 520" className="mx-auto h-auto w-full max-w-md" aria-hidden>
      <defs>
        <clipPath id="inner"><path d="M120 520V320A80 80 0 0 1 280 320V520Z" /></clipPath>
      </defs>
      <path d="M120 520V320A80 80 0 0 1 280 320V520Z" fill="#0f5a46" />
      <g clipPath="url(#inner)" stroke="#c9a961" strokeOpacity=".55" strokeWidth=".8">
        {Array.from({ length: 13 }, (_, i) => {
          const a = (Math.PI * (i + 0.5)) / 13; // fan across the upper half
          return <line key={i} x1="200" y1="520" x2={200 - Math.cos(a) * 260} y2={520 - Math.sin(a) * 260} />;
        })}
      </g>
      <g className="arch-draw" fill="none" stroke="#c9a961" strokeWidth="1.2">
        {arches.map((d, i) => (
          <path key={d} d={d} pathLength={1} strokeOpacity={1 - i * 0.12} />
        ))}
      </g>
      <path d="M200 120l9 9-9 9-9-9z" fill="#c9a961" />
    </svg>
  );
}

const POINTS = [
  { title: "Average cost that holds up", body: "Buys, partial sells and fees are replayed in date order, so your cost basis matches what you actually paid." },
  { title: "One account, many portfolios", body: "Keep Long Term, Trading and Dividend holdings apart and switch between them in one click." },
  { title: "Prices that are never invented", body: "Quotes come from NEPSE data. If the source is down you see the last saved price with its time, or a dash." },
];

export default function Landing() {
  return (
    <div className="relative isolate overflow-hidden">
      <div className="sunburst pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[70vh] opacity-60" aria-hidden />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <Wordmark />
        <nav aria-label="Account" className="flex items-center gap-3">
          <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
          <Link href="/signup" className="btn btn-sm hidden sm:inline-flex">Create account</Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:pt-16">
          <div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl">Know what your NEPSE shares are really worth.</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-mute">
              Record your buys and sells. Mohar works out your average cost, profit and loss and allocation from NEPSE prices, and tells you plainly when a price isn't available.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link href="/signup" className="btn">Create a free account</Link>
              <Link href="/login" className="btn btn-ghost">Sign in</Link>
            </div>
          </div>
          <Arches />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6" aria-label="What Mohar does">
          <div className="rule" aria-hidden />
          <ul className="mt-10 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-gold-deep/50">
            {POINTS.map((p) => (
              <li key={p.title} className="md:px-8 md:first:pl-0 md:last:pr-0">
                <h2 className="text-2xl">{p.title}</h2>
                <p className="mt-3 text-mute">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-gold-deep/40 px-4 py-8 text-center text-sm text-faint">
        Market data comes from YONEPSE, a community-run source, and may be delayed. Mohar is a record-keeping tool, not investment advice.
      </footer>
    </div>
  );
}
