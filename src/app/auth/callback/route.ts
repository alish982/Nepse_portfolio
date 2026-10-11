import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Completes the password-reset link: swaps the one-time code for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/settings";
  // Only allow same-site relative redirects.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/settings";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const sep = safeNext.includes("?") ? "&" : "?";
      return NextResponse.redirect(`${origin}${safeNext}${sep}recovery=1`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
