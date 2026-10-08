import { NextResponse } from "next/server"

import { reorganizeDimension } from "@/lib/research/reorganize-dimension"
import { rateLimitResponse } from "@/lib/http/rate-limit"
import { CAPABILITY_KEYS, type CapabilityKey } from "@/lib/research/capability"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

/** 服务端规范化维度：只信任确定需要字段，origin/priority 等由服务端语义决定 */
function normalizeDimension(raw: unknown):
  | { ok: true; dimension: Parameters<typeof reorganizeDimension>[0]["dimension"] }
  | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "dimension 必须是对象" }
  const d = raw as Record<string, unknown>
  const dimensionId = typeof d.dimensionId === "string" ? d.dimensionId.trim() : ""
  const label = typeof d.label === "string" ? d.label.trim() : ""
  const researchQuestion = typeof d.researchQuestion === "string" ? d.researchQuestion.trim() : ""
  const rationale = typeof d.rationale === "string" ? d.rationale.trim() : ""
  const refs = Array.isArray(d.capabilityRefs)
    ? d.capabilityRefs.filter((x): x is CapabilityKey => typeof x === "string" && CAPABILITY_KEYS.includes(x as CapabilityKey))
    : []
  if (!dimensionId || dimensionId.length > 80) return { ok: false, error: "无效的 dimensionId" }
  if (!label || label.length > 24) return { ok: false, error: "无效的 dimension.label" }
  if (!researchQuestion || researchQuestion.length > 120) return { ok: false, error: "无效的 dimension.researchQuestion" }
  if (!rationale || rationale.length > 300) return { ok: false, error: "无效的 dimension.rationale" }
  const status = d.status === "ready" || d.status === "partial" || d.status === "unknown" ? d.status : "partial"
  const origin = d.origin === "user" ? "user" : "ai_initial"
  const missingInformation = Array.isArray(d.missingInformation)
    ? d.missingInformation.filter((x): x is string => typeof x === "string").slice(0, 10)
    : undefined
  return {
    ok: true,
    dimension: {
      dimensionId,
      label,
      researchQuestion,
      ...(typeof d.description === "string" && d.description.trim() ? { description: d.description.trim().slice(0, 200) } : {}),
      origin,
      capabilityRefs: refs,
      status,
      rationale,
      priority: typeof d.priority === "number" ? d.priority : 99,
      evidenceIds: [],
      claimIds: [],
      ...(missingInformation ? { missingInformation } : {}),
    },
  }
}

export async function POST(request: Request) {
  const limited = rateLimitResponse(request, { scope: "research-reorganize", limit: 15 })
  if (limited) return limited
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 })
  }
  const { stockCode, dimension } = (body ?? {}) as Record<string, unknown>
  if (typeof stockCode !== "string" || !STOCK_CODE_PATTERN.test(stockCode.trim().toUpperCase())) {
    return NextResponse.json({ error: "无效的 stockCode" }, { status: 400 })
  }
  const normalized = normalizeDimension(dimension)
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 })
  }

  try {
    const resp = await reorganizeDimension({
      stockCode: stockCode.trim().toUpperCase(),
      dimension: normalized.dimension,
    })
    return NextResponse.json({ mode: "reorganize", ...resp })
  } catch (err) {
    return NextResponse.json(
      { error: `重新组织失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
}
