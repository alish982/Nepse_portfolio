import { NextResponse, type NextRequest } from "next/server";
import { searchStocks } from "@/lib/nepse/service";

// Authentication is enforced in middleware for every /api/* path.
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  const results = q ? await searchStocks(q) : [];
  return NextResponse.json({ results }, { headers: { "Cache-Control": "private, max-age=30" } });
}
