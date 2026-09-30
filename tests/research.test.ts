import { describe, expect, it } from "vitest"

import { computeCapabilityManifest, capabilityManifestSummary } from "@/lib/research/capability"
import { buildCompanyContext, matchEvidenceByCapabilities } from "@/lib/research/company-context"
import { validateResearchFrame } from "@/lib/research/framer"
import { makeDimensionId, DIMENSION_LIMITS, type ResearchDimension } from "@/lib/research/dimension-schema"
import { validateDimensionClaims } from "@/lib/research/claims"
import { applyTotalBudget, buildDimensionPack, parseComposerShape } from "@/lib/research/composer"
import { lookupIndustry, INDUSTRY_REGISTRY_SIZE } from "@/lib/data/industry-registry"
import {
  CONSTELLATION,
  computeAddNodeLayout,
  computeDimensionLayout,
  computeFieldNodes,
  computeSuggestionLayout,
  selectFieldEvidence,
  stableHashUnit,
  verifyLayoutConstraints,
} from "@/lib/presentation/constellation-layout"
import type { Evidence, EvidenceDimension, EvidenceSignal, EvidenceType } from "@/lib/evidence/types"
import { m } from "./evidence/helpers"

let seq = 0
function e(type: EvidenceType, signal: EvidenceSignal, dimension: EvidenceDimension = "growth", id?: string): Evidence {
  seq += 1
  return {
    evidenceId: id ?? `EV_${dimension}_${type}_${seq}`,
    dimension,
    title: `t${seq}`,
    statement: `s${seq}`,
    type,
    signal,
    confidence: type === "unknown" ? "low" : type === "inference" ? "medium" : "high",
    metricIds: [],
    basedOn: [],
    sourceFields: dimension === "risk" ? [{ source: "fuyao", domain: "prices", field: "ep" }] : [],
    verifyStatus: type === "unknown" ? "unverified" : "verified",
    confidenceReason: "-",
  }
}

describe("Industry Registry（§9–§11）", () => {
  it("真实注册表：000333.SZ → 白色家电；规模覆盖全 A 股主要标的", () => {
    const entry = lookupIndustry("000333.SZ")!
    expect(entry.industryName).toBe("白色家电")
    expect(entry.industryIndexCode).toBe("881131.TI")
    expect(entry.source).toBe("fuyao")
    expect(entry.verifiedAt).toBeTruthy()
    expect(INDUSTRY_REGISTRY_SIZE).toBeGreaterThan(4000)
  })

  it("未知代码返回 null（不猜测行业）", () => {
    expect(lookupIndustry("999999.SZ")).toBeNull()
  })
})

describe("Capability Availability（§13–§15）", () => {
  const metricIds = [
    "FIN_REVENUE_YOY_YTD", "FIN_NET_PROFIT_YOY_YTD", "FIN_REVENUE_YOY_QUARTER",
    "FIN_GROSS_MARGIN", "FIN_NET_MARGIN", "FIN_ROE",
    "FIN_OCF_YOY_YTD", "FIN_CFO_TO_NET_PROFIT_YTD",
    "VAL_PE_TTM", "VAL_PB_MRQ",
    "MKT_RETURN_20D", "MKT_VOLATILITY_20D", "MKT_MAX_DRAWDOWN_120D",
    "MKT_RELATIVE_CSI300_20D", "MKT_CSI300_RETURN_20D",
  ]

  it("全部指标可用 → 对应能力 ready；行业未解析 → 行业能力 unavailable", () => {
    const manifest = computeCapabilityManifest({
      metrics: metricIds.map((id) => m(id, 1)),
      evidence: [],
      events: null,
      industryResolved: false,
      industryValuationAvailable: false,
    })
    const summary = capabilityManifestSummary(manifest)
    expect(summary.available).toContain("financial_growth")
    expect(summary.available).toContain("profitability")
    expect(summary.available).toContain("valuation")
    expect(summary.unavailable).toContain("industry_market")
    expect(summary.unavailable).toContain("industry_valuation")
    // 银行也不会被模板化为「盈利可用」：完全由指标真假决定
    expect(summary.available).not.toContain("event")
  })

  it("部分指标不可用 → partial；全缺 → unavailable", () => {
    const manifest = computeCapabilityManifest({
      metrics: [m("FIN_REVENUE_YOY_YTD", 1), m("FIN_NET_PROFIT_YOY_YTD", null)],
      evidence: [],
      events: null,
      industryResolved: false,
      industryValuationAvailable: false,
    })
    const growth = manifest.find((c) => c.key === "financial_growth")!
    expect(growth.status).toBe("partial")
    const cashflow = manifest.find((c) => c.key === "cashflow")!
    expect(cashflow.status).toBe("unavailable")
  })

  it("事件域由真实 coverage 决定", () => {
    const manifest = computeCapabilityManifest({
      metrics: [],
      evidence: [],
      events: {
        events: [],
        coverage: { anomaly: "no_records", attention: "records", corporateAction: "records", newsDisclosure: "unavailable" },
        errors: [],
      },
      industryResolved: true,
      industryValuationAvailable: false,
    })
    expect(manifest.find((c) => c.key === "event")!.status).toBe("ready")
    expect(manifest.find((c) => c.key === "corporate_action")!.status).toBe("ready")
  })
})

describe("Research Framer 校验（§93–§94）", () => {
  const context = buildCompanyContext({
    stockCode: "000333.SZ",
    stockName: "美的集团",
    capabilities: computeCapabilityManifest({
      metrics: [m("FIN_REVENUE_YOY_YTD", 1), m("VAL_PE_TTM", 1)],
      evidence: [],
      events: null,
      industryResolved: true,
      industryValuationAvailable: true,
    }),
    legacyIndustry: null,
  })

  const validDraft = {
    label: "增长韧性",
    researchQuestion: "增长是否稳健？",
    capabilityRefs: ["financial_growth"],
    rationale: "关注收入的持续性",
  }
  const makeFrame = (over: Record<string, unknown> = {}) => ({
    intent: "open_exploration",
    dimensions: [validDraft, { ...validDraft, label: "估值定位", capabilityRefs: ["valuation"] }, { ...validDraft, label: "盈利质量", capabilityRefs: ["valuation"] }, { ...validDraft, label: "现金转化", capabilityRefs: ["valuation"] }],
    suggestedDimensions: [{ ...validDraft, label: "海外业务", capabilityRefs: ["event"] }],
    framingReason: "按公司特点组织",
    ...over,
  })

  it("合法 frame 通过", () => {
    const result = validateResearchFrame(makeFrame(), context)
    expect(result.ok).toBe(true)
    expect(result.frame?.dimensions).toHaveLength(4)
  })

  it("引用不存在的能力 → 拒绝（AI 不能创造数据能力）", () => {
    const frame = makeFrame()
    frame.dimensions[0] = { ...validDraft, capabilityRefs: ["made_up_capability"] }
    const result = validateResearchFrame(frame, context)
    expect(result.ok).toBe(false)
    expect(result.issues.join(" ")).toContain("made_up_capability")
  })

  it("label 直接使用 capability key → 拒绝", () => {
    const frame = makeFrame()
    frame.dimensions[0] = { ...validDraft, label: "financial_growth" }
    expect(validateResearchFrame(frame, context).ok).toBe(false)
  })

  it("维度数量超限（>6）与 rationale 含数字 → 拒绝", () => {
    const tooMany = makeFrame({
      dimensions: Array.from({ length: 7 }, (_, i) => ({ ...validDraft, label: `维度${i}` })),
    })
    expect(validateResearchFrame(tooMany, context).ok).toBe(false)
    const withNumber = makeFrame()
    withNumber.dimensions[0] = { ...validDraft, rationale: "收入增长 3.5% 值得关注" }
    expect(validateResearchFrame(withNumber, context).ok).toBe(false)
  })

  it("重复 label → 拒绝", () => {
    const frame = makeFrame()
    frame.dimensions[1] = { ...validDraft, label: "增长韧性", capabilityRefs: ["valuation"] }
    // 现在有 3 个相同 label（含原维度）→ 重复
    expect(validateResearchFrame(frame, context).ok).toBe(false)
  })
})

describe("Claim Grounding（§35–§38）", () => {
  const fact = e("fact", "positive", "growth", "EV_F1")
  const inference = e("inference", "conflict", "growth", "EV_I1")
  const unknown = e("unknown", "unknown", "growth", "EV_U1")
  const pack = [fact, inference, unknown]
  const dimension = { dimensionId: "D1", status: "ready" as const, evidenceIds: ["EV_F1", "EV_I1", "EV_U1"] }

  it("合理绑定通过", () => {
    const result = validateDimensionClaims(
      [
        { text: "收入增长", type: "fact", signal: "positive", evidenceIds: ["EV_F1"] },
        { text: "增长与利润背离", type: "inference", signal: "conflict", evidenceIds: ["EV_I1", "EV_F1"] },
        { text: "历史位置不可验证", type: "unknown", signal: "unknown", evidenceIds: ["EV_U1"] },
      ],
      dimension,
      pack,
    )
    expect(result.ok).toBe(true)
    expect(result.claims).toHaveLength(3)
  })

  it("引用包外证据 → 拒绝（grounding）", () => {
    const result = validateDimensionClaims(
      [{ text: "x", type: "fact", signal: "positive", evidenceIds: ["EV_NOT_IN_PACK"] }],
      dimension,
      pack,
    )
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.rule === "evidence-binding")).toBe(true)
  })

  it("fact claim 引用 inference → 拒绝", () => {
    const result = validateDimensionClaims(
      [{ text: "x", type: "fact", signal: "positive", evidenceIds: ["EV_I1"] }],
      dimension,
      pack,
    )
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.rule === "fact-type")).toBe(true)
  })

  it("inference claim 无 inference 证据 → 拒绝", () => {
    const result = validateDimensionClaims(
      [{ text: "x", type: "inference", signal: "neutral", evidenceIds: ["EV_F1"] }],
      dimension,
      pack,
    )
    expect(result.ok).toBe(false)
    expect(result.issues.some((i) => i.rule === "inference-type")).toBe(true)
  })

  it("unknown claim 引用 fact → 拒绝；unknown dimension 允许无证据", () => {
    const bad = validateDimensionClaims(
      [{ text: "x", type: "unknown", signal: "unknown", evidenceIds: ["EV_F1"] }],
      dimension,
      pack,
    )
    expect(bad.ok).toBe(false)
    const unknownDim = { dimensionId: "D2", status: "unknown" as const, evidenceIds: [] }
    const ok = validateDimensionClaims(
      [{ text: "当前证据不足", type: "unknown", signal: "unknown", evidenceIds: [] }],
      unknownDim,
      [],
    )
    expect(ok.ok).toBe(true)
  })
})

describe("Dimension Packing 预算（§30/§34）", () => {
  it("单维度打包上限（4–8），总预算裁剪保留每维度至少 MIN 条", () => {
    const dim: ResearchDimension = {
      dimensionId: "D1",
      label: "x",
      researchQuestion: "q",
      origin: "ai_initial",
      capabilityRefs: ["financial_growth"],
      status: "ready",
      rationale: "r",
      priority: 1,
      evidenceIds: [],
      claimIds: [],
    }
    const many = Array.from({ length: 20 }, (_, i) => e("fact", "positive", "growth", `EV_${i}`))
    const pack = buildDimensionPack(dim, many)
    expect(pack.evidence.length).toBe(8)

    const packs = Array.from({ length: 8 }, (_, i) => ({
      dimension: { ...dim, dimensionId: `D${i}` },
      evidence: Array.from({ length: 8 }, (_, j) => e("fact", "positive", "growth", `EV_${i}_${j}`)),
    }))
    const trimmed = applyTotalBudget(packs, 32)
    const total = trimmed.reduce((sum, p) => sum + p.evidence.length, 0)
    expect(total).toBeLessThanOrEqual(32)
    expect(trimmed.every((p) => p.evidence.length >= 4)).toBe(true)
  })

  it("composer 形状校验：claims 数量与字段", () => {
    expect(parseComposerShape({ overview: "ok", dimensions: [{ dimensionId: "D1", claims: [{ text: "t", type: "fact", signal: "positive", evidenceIds: ["EV_1"] }] }] }).ok).toBe(true)
    expect(parseComposerShape({ overview: "", dimensions: [] }).ok).toBe(false)
    expect(parseComposerShape({ overview: "ok", dimensions: [{ dimensionId: "D1", claims: [] }] }).ok).toBe(false)
  })
})

describe("Deterministic Layout（§62）", () => {
  const dims: ResearchDimension[] = ["增长韧性", "盈利质量", "现金转化", "估值定位"].map((label, i) => ({
    dimensionId: makeDimensionId(label, i, "ai_initial"),
    label,
    researchQuestion: "q",
    origin: "ai_initial",
    capabilityRefs: ["financial_growth"],
    status: i === 3 ? "unknown" : "ready",
    rationale: "r",
    priority: i + 1,
    evidenceIds: Array.from({ length: i + 2 }, (_, j) => `EV_${i}_${j}`),
    claimIds: [],
  }))

  it("同一输入两次布局完全一致（绝不随机）", () => {
    const a = computeDimensionLayout(dims)
    const b = computeDimensionLayout(dims)
    expect(a).toEqual(b)
  })

  it("维度尺寸系统一致（UNKNOWN 同体系）；维度 id 稳定", () => {
    const layout = computeDimensionLayout(dims)
    const ready = layout.find((l) => l.dimensionId.includes("增长韧性"))!
    const unknown = layout.find((l) => l.dimensionId.includes("估值定位"))!
    // Task 12.1 §4：UNKNOWN 与普通维度使用同一尺寸体系（差异靠样式表达，绝不窄卡）
    expect(unknown.width).toBe(172)
    expect(unknown.height).toBe(ready.height)
    expect(unknown.width).toBeGreaterThanOrEqual(150)
    expect(makeDimensionId("增长韧性", 0, "ai_initial")).toBe(makeDimensionId("增长韧性", 0, "ai_initial"))
    expect(stableHashUnit("abc")).toBe(stableHashUnit("abc"))
  })

  it("Evidence Field：节点数 ≤18 且同维度聚类坐标确定", () => {
    const evidence = Array.from({ length: 30 }, (_, i) =>
      e("fact", "positive", i % 2 === 0 ? "growth" : "market", `EV_${i}`),
    )
    const fieldEvidence = selectFieldEvidence(evidence)
    expect(fieldEvidence.length).toBeLessThanOrEqual(18)
    const nodesA = computeFieldNodes(fieldEvidence, 1560, 1000)
    const nodesB = computeFieldNodes(fieldEvidence, 1560, 1000)
    expect(nodesA).toEqual(nodesB)
    expect(nodesA.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true)
  })
})

describe("Company Context（§16）", () => {
  it("注册表行业进入 context；capability 分组正确", () => {
    const context = buildCompanyContext({
      stockCode: "000333.SZ",
      stockName: "美的集团",
      capabilities: computeCapabilityManifest({
        metrics: [m("FIN_REVENUE_YOY_YTD", 1)],
        evidence: [],
        events: null,
        industryResolved: true,
        industryValuationAvailable: true,
      }),
      legacyIndustry: null,
    })
    expect(context.industryName).toBe("白色家电")
    expect(context.availableCapabilities).toContain("financial_growth")
  })

  it("capability → evidence 匹配（确定性）", () => {
    const evidence = [e("fact", "positive", "growth"), e("fact", "neutral", "valuation"), e("fact", "positive", "risk")]
    const matched = matchEvidenceByCapabilities(evidence, ["financial_growth"])
    expect(matched.map((x) => x.dimension)).toEqual(["growth"])
    const multi = matchEvidenceByCapabilities(evidence, ["financial_growth", "event"])
    expect(new Set(multi.map((x) => x.dimension))).toEqual(new Set(["growth", "risk"]))
  })
})

void DIMENSION_LIMITS

describe("Task 12.1 Spatial Polish（布局碰撞与稳定性）", () => {
  function makeDims(labels: string[], withLong = false): ResearchDimension[] {
    return labels.map((label, i) => ({
      dimensionId: makeDimensionId(label, i, "ai_initial"),
      label: withLong && i === 0 ? "B端业务与第二曲线及海外收入结构" : label,
      researchQuestion: "q",
      origin: "ai_initial",
      capabilityRefs: ["financial_growth"],
      status: i === labels.length - 1 ? "unknown" : "ready",
      rationale: "r",
      priority: i + 1,
      evidenceIds: Array.from({ length: (i % 4) + 2 }, (_, j) => `EV_${i}_${j}`),
      claimIds: [],
    }))
  }

  const six = makeDims(["增长韧性", "盈利质量与结构", "现金转化与分红能力", "估值与行业相对定价", "市场相对表现与波动", "事件与关注度扰动"])

  it("碰撞守卫：六个维度 + 长标签下无 Core 侵入、无对象重叠", () => {
    const layout = computeDimensionLayout(six)
    const check = verifyLayoutConstraints(layout)
    expect(check.ok, check.violations.join("; ")).toBe(true)
  })

  it("长中文标签不产生极窄对象（宽度固定在 150–220 区间）", () => {
    const layout = computeDimensionLayout(makeDims(["B端业务与第二曲线"], true))
    const l = layout[0]
    expect(l.width).toBeGreaterThanOrEqual(150)
    expect(l.width).toBeLessThanOrEqual(220)
    expect(l.height).toBeGreaterThanOrEqual(60)
  })

  it("最高优先级对象尺寸略大（scale 1.08）且不改变尺寸体系", () => {
    const layout = computeDimensionLayout(six)
    const first = layout.find((l) => l.dimensionId.includes("增长韧性"))!
    expect(first.scale).toBeCloseTo(1.08, 5)
    expect(first.width).toBe(186)
  })

  it("建议对象沿右侧外围弧线稳定放置（非 Sidebar、确定性、角度在 ±40° 内）", () => {
    const suggestions = [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }]
    const a = computeSuggestionLayout(suggestions)
    const b = computeSuggestionLayout(suggestions)
    expect(a).toEqual(b) // 确定性
    expect(a).toHaveLength(3) // 最多 3 个
    for (const p of a) {
      expect(Math.abs(p.angle)).toBeLessThanOrEqual(0.63)
      expect(p.radius).toBeGreaterThan(150)
    }
    // 弧线分布：上下两个比中间的更外扩（不是规则列表）
    expect(a[0].radius).toBeGreaterThan(a[1].radius)
    expect(a[2].radius).toBeGreaterThan(a[1].radius)
  })

  it("建议对象置于维度环之外（baseRadius 传入时整体外移，不与维度重叠）", () => {
    const layout = computeDimensionLayout(six)
    const maxDimRadius = layout.reduce((max, l) => Math.max(max, l.radius + l.width / 2), 0)
    const placements = computeSuggestionLayout([{ label: "A" }, { label: "B" }], {
      baseRadius: maxDimRadius + 92,
    })
    for (const p of placements) {
      expect(p.radius).toBeGreaterThanOrEqual(maxDimRadius + 92)
    }
  })

  it("Add 节点独立于所有维度对象：与最近维度角距取最大角隙中点（弧距 ≥ 120px）", () => {
    const layout = computeDimensionLayout(six)
    const add = computeAddNodeLayout(layout)
    const nearestAngle = layout.reduce((min, l) => {
      const diff = Math.abs(Math.atan2(Math.sin(l.angle - add.angle), Math.cos(l.angle - add.angle)))
      return Math.min(min, diff)
    }, Math.PI)
    // 6 维均匀分布时理论最大角距 ≈ 30°；换算为弧距须有充足间隔
    const arcDistance = nearestAngle * Math.min(add.radius, CONSTELLATION.CORE_SIZE / 2 + 200)
    expect(arcDistance).toBeGreaterThanOrEqual(120)
    expect(nearestAngle).toBeGreaterThanOrEqual(0.45)
  })

  it("连续调用布局结果完全一致（两次渲染不漂移）", () => {
    const a = computeDimensionLayout(six)
    const b = computeDimensionLayout(six)
    expect(a).toEqual(b)
  })
})
