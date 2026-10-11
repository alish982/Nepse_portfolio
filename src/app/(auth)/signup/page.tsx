import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-2 text-3xl">Create your account</h1>
      <p className="mb-6 text-mute">You start with one portfolio, ready for your first transaction.</p>
      <SignupForm />
      <p className="mt-6 text-center text-sm text-mute">
        Already registered? <Link href="/login" className="text-gold underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </>
  );
}
