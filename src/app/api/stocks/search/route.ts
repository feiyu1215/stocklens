import { NextResponse } from "next/server"

import { searchStocks } from "@/lib/data/stock-search"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  if (q.length === 0) {
    return NextResponse.json({ items: [], error: "missing q" }, { status: 400 })
  }
  if (q.length > 40) {
    return NextResponse.json({ items: [], error: "q too long" }, { status: 400 })
  }
  try {
    const items = await searchStocks(q)
    return NextResponse.json({ items })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const configMissing = message.includes("FUYAO_API_KEY")
    return NextResponse.json({ items: [], error: message }, { status: configMissing ? 503 : 502 })
  }
}
