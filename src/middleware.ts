import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/supabase/env";

const PROTECTED = ["/dashboard", "/portfolio", "/market", "/settings"];
const GUEST_ONLY = ["/login", "/signup"];

const matches = (path: string, bases: string[]) =>
  bases.some((b) => path === b || path.startsWith(`${b}/`));

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = supabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // Validates the JWT with Supabase and refreshes it when needed.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, request.url));
    // Carry over any refreshed auth cookies.
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (path.startsWith("/api/") && !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user && matches(path, PROTECTED)) return redirect("/login");
  if (user && matches(path, GUEST_ONLY)) return redirect("/dashboard");

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/portfolio/:path*",
    "/market/:path*",
    "/settings/:path*",
    "/login",
    "/signup",
    "/api/:path*",
  ],
};
