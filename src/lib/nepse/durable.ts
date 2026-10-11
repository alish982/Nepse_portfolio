import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Optional durable market-data cache in Supabase.
 * Uses the service-role key, which exists only in server environment variables and
 * is imported only from server-only modules. If the variables are not set this is
 * a silent no-op and the app relies on the in-memory cache alone.
 */

let client: SupabaseClient | null | undefined;

function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client =
    url && key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return client;
}

export async function readDurable<T>(key: string): Promise<{ payload: T; updatedAt: number } | null> {
  const c = db();
  if (!c) return null;
  const { data, error } = await c.from("market_cache").select("payload, updated_at").eq("key", key).maybeSingle();
  if (error || !data) return null;
  return { payload: data.payload as T, updatedAt: new Date(data.updated_at as string).getTime() };
}

export async function writeDurable(key: string, payload: unknown): Promise<void> {
  const c = db();
  if (!c) return;
  const { error } = await c
    .from("market_cache")
    .upsert({ key, payload, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) console.error("[nepse] durable cache write failed:", error.message);
}
