// 载荷守卫（Task 15 §4）：研究空间只有在结构完整时才能进入 World。
// 数据缺失/响应错类型时必须走「无法建立 World」的出口，而不是让页面崩掉或静默渲染空空间。

import type { ResearchSpacePayload } from "@/components/observatory/theme"

export function isResearchSpace(payload: unknown): payload is ResearchSpacePayload {
  if (!payload || typeof payload !== "object") return false
  const p = payload as Partial<ResearchSpacePayload>
  return (
    Boolean(p.company?.stockCode) &&
    Array.isArray(p.dimensions) &&
    Array.isArray(p.claims) &&
    Array.isArray(p.evidence) &&
    Boolean(p.ai?.status)
  )
}
