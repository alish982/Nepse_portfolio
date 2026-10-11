import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { replay, value, type Txn, type Valuation } from "@/lib/portfolio/calc";
import { getPrices, type PriceBook } from "@/lib/nepse/service";

export const ACTIVE_COOKIE = "pf";

export interface Portfolio {
  id: string;
  name: string;
}

/** Current user, de-duplicated across layout and page in one request. Redirects if signed out. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
});

export const getPortfolios = cache(async (): Promise<Portfolio[]> => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .select("id, name")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load portfolios: ${error.message}`);
  if (data.length > 0) return data;

  // Safety net for accounts created before the signup trigger existed.
  const { data: created, error: insertError } = await supabase
    .from("portfolios")
    .insert({ user_id: user.id, name: "Main Portfolio" })
    .select("id, name")
    .single();
  if (insertError) throw new Error(`Could not create a portfolio: ${insertError.message}`);
  return [created];
});

export const getActivePortfolio = cache(async (): Promise<{ active: Portfolio; all: Portfolio[] }> => {
  const all = await getPortfolios();
  const wanted = (await cookies()).get(ACTIVE_COOKIE)?.value;
  const active = all.find((p) => p.id === wanted) ?? all[0];
  if (!active) throw new Error("No portfolio available");
  return { active, all };
});

interface TxnRow {
  id: string;
  symbol: string;
  company_name: string | null;
  type: "buy" | "sell";
  quantity: number;
  price: number | string;
  fees: number | string;
  txn_date: string;
  created_at: string;
}

export interface TxnView extends Txn {
  companyName: string | null;
}

export async function loadTransactions(portfolioId: string): Promise<TxnView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, symbol, company_name, type, quantity, price, fees, txn_date, created_at")
    .eq("portfolio_id", portfolioId)
    .order("txn_date", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<TxnRow[]>();
  if (error) throw new Error(`Could not load transactions: ${error.message}`);
  return data.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    companyName: r.company_name,
    type: r.type,
    quantity: r.quantity,
    price: Number(r.price), // numeric(14,2) arrives as number or string
    fees: Number(r.fees),
    txnDate: r.txn_date,
    createdAt: r.created_at,
  }));
}

export interface PortfolioView extends Valuation {
  transactions: TxnView[];
  names: Record<string, string>;
  book: PriceBook;
}

/** Everything a page needs to render one portfolio. Transactions and prices load in sequence only where needed. */
export const loadPortfolioView = cache(async (portfolioId: string): Promise<PortfolioView> => {
  const transactions = await loadTransactions(portfolioId);
  const rep = replay(transactions);
  const book = await getPrices(rep.positions.map((p) => p.symbol));
  const names: Record<string, string> = {};
  for (const t of transactions) if (t.companyName) names[t.symbol] = t.companyName;
  return { ...value(rep, book.prices), transactions, names, book };
});
