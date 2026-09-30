import { readFile } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const ALLOWED = new Set([
  "midea-overview",
  "midea-valuation",
  "one-other-industry",
  "unknown-dimension",
  // Task 15.2 art-direction 原型：midea-overview + 真实 unknown 维度响应形态（见 index.json note）
  "midea-artdirection",
])

/**
 * 前端开发用的 canonical fixture（Task 12 §51–§54）：
 * 直接读取 tests/fixtures/observatory/*.json（来自真实 API 响应，仅 redact 了 id/时间戳），
 * 保证 Observatory 视觉/交互开发不依赖实时 LLM。生产 UI 默认走 /api/research/init。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get("name") ?? ""
  if (!ALLOWED.has(name)) {
    return NextResponse.json({ error: `unknown fixture: ${name}` }, { status: 404 })
  }
  try {
    const file = path.join(process.cwd(), "tests", "fixtures", "observatory", `${name}.json`)
    const raw = await readFile(file, "utf-8")
    return new NextResponse(raw, { headers: { "Content-Type": "application/json" } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 404 })
  }
}
