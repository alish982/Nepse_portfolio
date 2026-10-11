"use client";

import { useActionState } from "react";
import { updateDisplayName, updatePassword, type ActionResult } from "@/app/(app)/actions";
import { Notice } from "./ui";

const initial: ActionResult = {};

export function DisplayNameForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState(updateDisplayName, initial);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="label">Display name</label>
        <input id="name" name="name" className="field" defaultValue={current} maxLength={60} autoComplete="name" />
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice>Name saved.</Notice>}
      <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save name"}</button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="password" className="label">New password</label>
        <input id="password" name="password" type="password" className="field" minLength={8} required autoComplete="new-password" />
      </div>
      <div>
        <label htmlFor="confirm" className="label">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" className="field" minLength={8} required autoComplete="new-password" />
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice>Password updated.</Notice>}
      <button className="btn" disabled={pending}>{pending ? "Updating…" : "Update password"}</button>
    </form>
  );
}
