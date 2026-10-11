import { switchPortfolio } from "@/app/(app)/actions";
import type { Portfolio } from "@/lib/data";
import { NewPortfolioForm } from "./PortfolioForms";

/** <details> keeps this dropdown free of client JavaScript; the actions are plain form posts. */
export function PortfolioSwitcher({ active, all }: { active: Portfolio; all: Portfolio[] }) {
  return (
    <details className="group relative">
      <summary className="flex min-h-10 max-w-[12rem] cursor-pointer list-none items-center gap-2 border border-gold/40 px-3 text-sm hover:border-gold sm:max-w-[16rem] [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Portfolio:</span>
        <span className="truncate">{active.name}</span>
        <svg aria-hidden width="10" height="6" viewBox="0 0 10 6" className="shrink-0 text-gold transition-transform group-open:rotate-180">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] border border-gold/50 bg-coal p-2 shadow-[0_20px_44px_-12px_rgb(0_0_0/.85)]">
        <ul>
          {all.map((p) => (
            <li key={p.id}>
              <form action={switchPortfolio}>
                <input type="hidden" name="id" value={p.id} />
                <button
                  type="submit"
                  aria-current={p.id === active.id ? "true" : undefined}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-gold/10 ${p.id === active.id ? "text-gold" : ""}`}
                >
                  <span className="truncate">{p.name}</span>
                  {p.id === active.id && <span aria-hidden className="size-1.5 rotate-45 bg-gold" />}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <div className="mt-2 border-t border-gold-deep/50 p-2 pt-3">
          <NewPortfolioForm />
        </div>
      </div>
    </details>
  );
}
