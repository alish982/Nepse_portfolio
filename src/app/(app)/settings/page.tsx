import type { Metadata } from "next";
import { signOut } from "@/app/(auth)/actions";
import { DisplayNameForm, PasswordForm } from "@/components/SettingsForms";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ recovery?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="max-w-2xl space-y-10">
        {sp.recovery === "1" && <Notice tone="warn">You're signed in from a reset link. Choose a new password below.</Notice>}

        <section aria-labelledby="acct" className="panel p-6 sm:p-8">
          <h2 id="acct" className="text-2xl">Account</h2>
          <p className="mt-2 text-mute">Signed in as <span className="text-ivory">{user.email}</span></p>
          <div className="mt-6"><DisplayNameForm current={profile?.display_name ?? ""} /></div>
        </section>

        <section aria-labelledby="pw" className="panel p-6 sm:p-8">
          <h2 id="pw" className="text-2xl">Password</h2>
          <div className="mt-6"><PasswordForm /></div>
        </section>

        <section aria-labelledby="data" className="panel panel-quiet p-6 sm:p-8">
          <h2 id="data" className="text-2xl">About the data</h2>
          <p className="mt-2 text-mute">
            Prices come from YONEPSE, a community-run source, and can lag the exchange by several minutes or be briefly unavailable. The 52-week range is based on daily closing prices. When it can't be reached, Mohar shows the last saved prices with their time, or a dash. It never estimates a price. This is a record-keeping tool, not investment advice.
          </p>
        </section>

        <form action={signOut}><button className="btn btn-ghost">Sign out</button></form>
      </div>
    </>
  );
}
