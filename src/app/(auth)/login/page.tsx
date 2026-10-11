import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  const sp = await searchParams;
  const mode = sp.mode === "forgot" ? "forgot" : "signin";
  return (
    <>
      <h1 className="mb-6 text-3xl">{mode === "forgot" ? "Reset your password" : "Welcome back"}</h1>
      <LoginForm mode={mode} linkError={sp.error === "link"} />
      {mode === "signin" && (
        <p className="mt-6 text-center text-sm text-mute">
          New to Mohar? <Link href="/signup" className="text-gold underline-offset-4 hover:underline">Create an account</Link>
        </p>
      )}
    </>
  );
}
