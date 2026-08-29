import { NextResponse } from "next/server";

/** Public liveness for Vercel. Does not expose infrastructure details. */
export async function GET() {
  return NextResponse.json({ ok: true, service: "clashiq" });
}
