import type { Evidence } from "@/lib/evidence/types"
import { lookupIndustry } from "@/lib/data/industry-registry"
import type { CapabilityAvailability, CapabilityKey } from "./capability"

// Company Context（Task 12 §16）：公司身份 + 行业溯源 + 能力清单。
// 行业优先取离线注册表（5572 只股票、真实接口生成）；未命中回退 legacy verified 映射。

export interface CompanyContext {
  stockCode: string
  stockName: string

  industryName?: string
  industryIndexCode?: string
  industrySource?: string
  industryVerifiedAt?: string

  capabilities: CapabilityAvailability[]

  /** 便于 Framer 与 UI 使用（非 manifest 的一部分） */
  availableCapabilities: CapabilityKey[]
  partialCapabilities: CapabilityKey[]
  unavailableCapabilities: CapabilityKey[]
}

export function buildCompanyContext(input: {
  stockCode: string
  stockName: string
  capabilities: CapabilityAvailability[]
  legacyIndustry?: { industryName: string; industryIndexCode: string; source: string; verifiedAt: string } | null
}): CompanyContext {
  const registryEntry = lookupIndustry(input.stockCode)
  const industry = registryEntry
    ? {
        industryName: registryEntry.industryName,
        industryIndexCode: registryEntry.industryIndexCode,
        industrySource: registryEntry.source,
        industryVerifiedAt: registryEntry.verifiedAt,
      }
    : input.legacyIndustry
      ? {
          industryName: input.legacyIndustry.industryName,
          industryIndexCode: input.legacyIndustry.industryIndexCode,
          industrySource: input.legacyIndustry.source,
          industryVerifiedAt: input.legacyIndustry.verifiedAt,
        }
      : {}

  return {
    stockCode: input.stockCode,
    stockName: input.stockName,
    ...industry,
    capabilities: input.capabilities,
    availableCapabilities: input.capabilities.filter((c) => c.status === "ready").map((c) => c.key),
    partialCapabilities: input.capabilities.filter((c) => c.status === "partial").map((c) => c.key),
    unavailableCapabilities: input.capabilities.filter((c) => c.status === "unavailable").map((c) => c.key),
  }
}

/** 供 Framer 的轻量上下文（不包含任何金融数字，Task 12 §21–§22） */
export function companyContextForFramer(context: CompanyContext): {
  stockCode: string
  stockName: string
  industryName?: string
  capabilities: { key: CapabilityKey; status: string; description: string }[]
} {
  return {
    stockCode: context.stockCode,
    stockName: context.stockName,
    ...(context.industryName ? { industryName: context.industryName } : {}),
    capabilities: context.capabilities.map((c) => ({
      key: c.key,
      status: c.status,
      description: c.description,
    })),
  }
}

/** 某 capability 对应的证据维度（用于 Dynamic Dimension → Evidence Matching，Task 12 §29） */
export const CAPABILITY_EVIDENCE_DIMENSIONS: Record<CapabilityKey, string[]> = {
  financial_growth: ["growth"],
  profitability: ["profitability"],
  cashflow: ["cashflow"],
  valuation: ["valuation"],
  market_price: ["market"],
  market_benchmark: ["market"],
  industry_market: ["industry"],
  industry_valuation: ["valuation", "industry"],
  event: ["risk"],
  corporate_action: ["risk"],
  risk: ["risk"],
}

/** capabilityRefs → Evidence（确定性匹配，Task 12 §29–§30） */
export function matchEvidenceByCapabilities(
  evidence: Evidence[],
  capabilityRefs: CapabilityKey[],
): Evidence[] {
  const dimensions = new Set(capabilityRefs.flatMap((c) => CAPABILITY_EVIDENCE_DIMENSIONS[c] ?? []))
  return evidence.filter((e) => dimensions.has(e.dimension))
}
