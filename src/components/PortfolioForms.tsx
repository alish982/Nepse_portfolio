"use client";

import { useActionState, useEffect, useRef } from "react";
import { createPortfolio, deletePortfolio, renamePortfolio, type ActionResult } from "@/app/(app)/actions";
import type { Portfolio } from "@/lib/data";
import { Notice } from "./ui";

const initial: ActionResult = {};

export function NewPortfolioForm() {
  const [state, action, pending] = useActionState(createPortfolio, initial);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <label htmlFor="new-pf" className="label">New portfolio</label>
      <div className="flex gap-2">
        <input id="new-pf" name="name" className="field min-h-10" maxLength={60} placeholder="Long Term, Trading, Dividend" required />
        <button type="submit" className="btn btn-sm shrink-0" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-garnet">{state.error}</p>}
    </form>
  );
}

/** Rename and delete for the active portfolio. */
export function ManagePortfolio({ portfolio, canDelete, txnCount }: { portfolio: Portfolio; canDelete: boolean; txnCount: number }) {
  const [renameState, rename, renaming] = useActionState(renamePortfolio, initial);
  const [deleteState, remove, deleting] = useActionState(deletePortfolio, initial);

  return (
    <div className="flex flex-wrap gap-3">
      <details className="relative">
        <summary className="btn btn-ghost btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">Rename</summary>
        <form action={rename} className="panel panel-quiet absolute left-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-3 p-4">
          <input type="hidden" name="id" value={portfolio.id} />
          <label htmlFor="rename-pf" className="label">Portfolio name</label>
          <input id="rename-pf" name="name" className="field" defaultValue={portfolio.name} maxLength={60} required />
          {renameState.error && <p role="alert" className="text-sm text-garnet">{renameState.error}</p>}
          <button type="submit" className="btn btn-sm w-full" disabled={renaming}>{renaming ? "Saving…" : "Save name"}</button>
        </form>
      </details>

      <details className="relative">
        <summary className={`btn btn-danger btn-sm list-none [&::-webkit-details-marker]:hidden ${canDelete ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`} onClick={(e) => { if (!canDelete) e.preventDefault(); }} aria-disabled={!canDelete} title={canDelete ? undefined : "You need at least one portfolio"}>
          Delete
        </summary>
        <form action={remove} className="panel panel-quiet absolute left-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-3 p-4">
          <input type="hidden" name="id" value={portfolio.id} />
          <p className="text-sm">
            Delete <strong className="font-medium">{portfolio.name}</strong>
            {txnCount > 0 ? ` and its ${txnCount} transaction${txnCount === 1 ? "" : "s"}` : ""}? This can't be undone.
          </p>
          {deleteState.error && <Notice tone="error">{deleteState.error}</Notice>}
          <button type="submit" className="btn btn-danger btn-sm w-full" disabled={deleting}>{deleting ? "Deleting…" : "Delete portfolio"}</button>
        </form>
      </details>
    </div>
  );
}
