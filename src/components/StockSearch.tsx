"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SearchHit } from "@/lib/nepse/service";
import { price } from "@/lib/format";

// Shared by every instance on the page: a repeated query never hits the network twice.
const cache = new Map<string, SearchHit[]>();
const DEBOUNCE_MS = 250;

type Status = "idle" | "loading" | "done" | "error";

export function StockSearch({
  onSelect,
  placeholder = "Search by symbol or company name",
  label = "Stock",
  autoFocus = false,
}: {
  onSelect: (hit: SearchHit) => void;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const listId = `${uid}-list`;

  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (term === "") {
      setHits([]);
      setStatus("idle");
      return;
    }
    const cached = cache.get(term);
    if (cached) {
      setHits(cached);
      setStatus("done");
      setActive(0);
      return;
    }
    setStatus("loading");
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results: SearchHit[] };
        cache.set(term, body.results);
        setHits(body.results);
        setActive(0);
        setStatus("done");
      } catch {
        if (!ctrl.signal.aborted) setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  function pick(hit: SearchHit) {
    onSelect(hit);
    setQ("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && hits[active]) {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && q.trim() !== "";

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={`${uid}-input`} className="label">{label}</label>
      <input
        id={`${uid}-input`}
        className="field"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[active] ? `${uid}-opt-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <div className="absolute left-0 right-0 z-30 mt-1 border border-gold/50 bg-coal shadow-[0_18px_40px_-12px_rgb(0_0_0/.8)]">
          {status === "loading" && <p className="px-4 py-3 text-sm text-mute">Searching…</p>}
          {status === "error" && <p role="alert" className="px-4 py-3 text-sm text-garnet">Search is unavailable. Check your connection and try again.</p>}
          {status === "done" && hits.length === 0 && <p className="px-4 py-3 text-sm text-mute">No listed stock matches “{q.trim()}”.</p>}
          {hits.length > 0 && status !== "error" && (
            <ul id={listId} role="listbox" aria-label="Matching stocks" className="max-h-72 overflow-auto">
              {hits.map((h, i) => (
                <li
                  key={h.symbol}
                  id={`${uid}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(h)}
                  className={`flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5 ${i === active ? "bg-gold/15" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="font-display text-lg">{h.symbol}</span>
                    <span className="block truncate text-sm text-mute">{h.name}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm text-mute">
                    {h.ltp !== null ? `Rs ${price(h.ltp)}` : ""}
                    {h.sector && <span className="block text-xs text-faint">{h.sector}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
