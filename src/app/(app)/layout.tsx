import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { AppNav } from "@/components/AppNav";
import { PortfolioSwitcher } from "@/components/PortfolioSwitcher";
import { Wordmark } from "@/components/ui";
import { getActivePortfolio, requireUser } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const { active, all } = await getActivePortfolio();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 sm:px-6 md:pb-16">
      <header className="pt-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/dashboard" aria-label="Mohar dashboard"><Wordmark /></Link>
          <div className="flex items-center gap-3">
            <PortfolioSwitcher active={active} all={all} />
            <form action={signOut}>
              <button className="btn btn-ghost btn-sm">Sign out</button>
            </form>
          </div>
        </div>
        <div className="mt-3 border-b border-gold-deep/50">
          <AppNav />
        </div>
      </header>
      <main className="pt-10">{children}</main>
    </div>
  );
}
