"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, signIn, signUp, type FormState } from "@/app/(auth)/actions";
import { Notice } from "./ui";

const initial: FormState = {};

function Field({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} name={id} className="field" required {...rest} />
    </div>
  );
}

export function LoginForm({ linkError, mode }: { linkError: boolean; mode: "signin" | "forgot" }) {
  const [state, action, pending] = useActionState(mode === "forgot" ? requestPasswordReset : signIn, initial);

  if (mode === "forgot") {
    return (
      <form action={action} className="space-y-5">
        <p className="text-mute">Enter your email and we'll send a link to set a new password.</p>
        <Field id="email" label="Email" type="email" autoComplete="email" inputMode="email" />
        {state.error && <Notice tone="error">{state.error}</Notice>}
        {state.notice && <Notice>{state.notice}</Notice>}
        <button className="btn w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
        <p className="text-center text-sm"><Link href="/login" className="text-gold underline-offset-4 hover:underline">Back to sign in</Link></p>
      </form>
    );
  }
  return (
    <form action={action} className="space-y-5">
      {linkError && <Notice tone="error">That reset link is invalid or has expired. Request a new one.</Notice>}
      <Field id="email" label="Email" type="email" autoComplete="email" inputMode="email" />
      <Field id="password" label="Password" type="password" autoComplete="current-password" />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <button className="btn w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-sm">
        <Link href="/login?mode=forgot" className="text-gold underline-offset-4 hover:underline">Forgot your password?</Link>
      </p>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  return (
    <form action={action} className="space-y-5">
      <Field id="email" label="Email" type="email" autoComplete="email" inputMode="email" />
      <Field id="password" label="Password" type="password" autoComplete="new-password" minLength={8} aria-describedby="pw-hint" />
      <p id="pw-hint" className="-mt-3 text-sm text-faint">At least 8 characters.</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <button className="btn w-full" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
    </form>
  );
}
