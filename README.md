# Mohar: NEPSE portfolio tracker

Next.js 15 (App Router) + TypeScript (strict) + Tailwind CSS 4 + Supabase (Auth + Postgres) + [YONEPSE](https://shubhamnpk.github.io/yonepse/) (static JSON on GitHub Pages).

## Set up

1. **Supabase**: create a project. In *Authentication > Providers > Email*, turn **off "Confirm email"**. Run `supabase/migrations/0001_init.sql` in the SQL editor.
2. **Auth redirect**: in *Authentication > URL Configuration*, add `<your site>/auth/callback` to the redirect allow-list (password reset uses it).
3. `cp .env.example .env.local` and fill in the values.
4. `npm install && npm run dev`

Checks: `npm test` (calculation + market-service tests), `npm run typecheck`, `npm run build`.

## How it works

| Concern | Approach |
| --- | --- |
| Auth | Supabase email/password via `@supabase/ssr`. Middleware validates the session and protects `/dashboard /portfolio /market /settings` and `/api/*`. A DB trigger creates the profile and a "Main Portfolio" in the same transaction as signup. |
| Data security | RLS on `profiles`, `portfolios`, `transactions`: users touch only their own rows, and a transaction can only be written into a portfolio they own. The service-role key is used in exactly one server-only file (`lib/nepse/durable.ts`) and is optional. |
| Holdings math | `lib/portfolio/calc.ts`. Weighted-average cost in integer paisa. Buy fees go into cost; sell fees reduce proceeds. A partial sell removes a proportional share of cost basis (BigInt, no overflow) and books realised P/L. Sells that exceed holdings at that date are rejected on add and on delete. |
| Market data | `lib/nepse/service.ts`, server-side only. `nepse_data.json` (one file, every listed stock: price, change, volume, update time) powers prices, search and symbol validation. The 52-week range is computed from the last 13 monthly closing-price files (`ltp/monthly`), so it is a **closing-price** range and can differ slightly from NEPSE's intraday figure. |
| Caching | In-memory TTL (1 min while NEPSE is open, 10 min when closed; the 52-week ranges 12 h), in-flight de-duplication, React `cache()` per request, and an optional durable copy in Supabase. If the source fails the last good data is shown, labelled with its time. If there is none, the UI shows a dash. Nothing is estimated. |
| Updates | Server Components render everything. Client JS is limited to forms, the search box, the transactions list and a 45 s `router.refresh()` during market hours (the data itself updates about once a minute at best). The allocation chart is server-rendered SVG, so it ships no JS. |
| WebSockets | Deliberately not used. The upstream API is request/response, prices change four hours a day, and serverless hosts do not keep sockets open. Polling with a shared server cache is simpler and cheaper. |

## Importing holdings

Portfolio > *Import holdings* accepts a Demat "My Shares" statement as CSV or PDF (`lib/import/parse.ts`). The file is parsed in memory on the server and never stored; only scrip and Current Balance are used (the PDF's holder name, BOID and address are ignored). A statement has no purchase price or date, so you enter a cost per share per row, or use today's market price to start tracking from today. Rows are saved as Buy transactions in one all-or-nothing insert. Symbols already held are unchecked by default so a re-import doesn't double-count.

## Known limits

- YONEPSE is a community project updated by scheduled GitHub Actions and served through a CDN, so prices can lag NEPSE by several minutes and are never real-time. Its opening price is not published, so it is not shown.
- The 52-week range uses daily closing prices, not intraday highs and lows.
- Market hours are Sun-Thu 11:00-15:00 NPT. Public holidays are not modelled, so the status line may say "open" on a holiday.
- The portfolio's allocation and totals use priced holdings only; any holding without a price is flagged and counted separately.
