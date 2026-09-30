import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  INITIAL_EXPERIENCE,
  MOTION,
  breadcrumbSegments,
  canApply,
  companyVisualState,
  degradationForDimension,
  dimensionVisualState,
  shouldShowGlobalError,
  suggestionVisualState,
  transition,
  type ExperienceState,
} from "@/lib/experience/state"
import {
  DETAIL_THRESHOLDS,
  contextCommands,
  evidenceNodeBudget,
  getObjectDetailLevel,
  shouldShowEvidenceLabels,
} from "@/lib/experience/detail"
import { COPY, FORBIDDEN_UI_PHRASES, containsForbiddenUiPhrase } from "@/lib/experience/copy"
import { isResearchSpace } from "@/lib/world/payload-guard"

// Task 15 §12–§18：Experience Model 验收。
// 核心纪律：semantic level 只由显式事件改变（click / Enter / Explore / back），
// camera scale 只改变信息密度，绝不改变 level（§6/§84）。

const toCompany = (code = "000333.SZ"): ExperienceState =>
  transition(INITIAL_EXPERIENCE, { type: "select_company", stockCode: code })

describe("Semantic transition table（§5–§10）", () => {
  it("world → company 只能由显式 select_company 完成", () => {
    expect(INITIAL_EXPERIENCE.level).toBe("world")
    const next = toCompany()
    expect(next.level).toBe("company")
    expect(next.activeCompany).toBe("000333.SZ")
  })

  it("非法转换被静默忽略（滚轮/误触不能导航，§84）", () => {
    // world 下 open_dimension / select_evidence 均不合法
    expect(canApply(INITIAL_EXPERIENCE, { type: "open_dimension", dimensionId: "d1" })).toBe(false)
    expect(transition(INITIAL_EXPERIENCE, { type: "open_dimension", dimensionId: "d1" })).toEqual(
      INITIAL_EXPERIENCE,
    )
    expect(transition(INITIAL_EXPERIENCE, { type: "select_evidence", evidenceId: "e1" }).level).toBe("world")
  })

  it("company → dimension → claim → evidence 逐级前进，且各层对象被记录", () => {
    const c = toCompany()
    const d = transition(c, { type: "open_dimension", dimensionId: "cash" })
    expect(d.level).toBe("dimension")
    expect(d.activeDimension).toBe("cash")
    const r = transition(d, { type: "open_research", dimensionId: "cash" })
    expect(r.level).toBe("claim")
    expect(r.activeDimension).toBe("cash")
    expect(r.activeClaim).toBeUndefined()
    const e = transition(r, { type: "select_claim", claimId: "c1" })
    const ev = transition(e, { type: "select_evidence", evidenceId: "EV_1" })
    expect(ev.level).toBe("evidence")
    expect(ev.activeEvidence).toBe("EV_1")
    // 前进过程中 company / dimension 上下文保持可见（§22）
    expect(ev.activeCompany).toBe("000333.SZ")
    expect(ev.activeDimension).toBe("cash")
  })

  it("反向导航 evidence → claim → dimension → company → world（§24/§107）", () => {
    let s = toCompany()
    s = transition(s, { type: "open_dimension", dimensionId: "cash" })
    s = transition(s, { type: "open_research", dimensionId: "cash" })
    s = transition(s, { type: "select_claim", claimId: "c1" })
    s = transition(s, { type: "select_evidence", evidenceId: "EV_1" })

    s = transition(s, { type: "back" })
    expect([s.level, s.activeEvidence]).toEqual(["claim", undefined])
    expect(s.activeClaim).toBe("c1")
    s = transition(s, { type: "back" })
    expect([s.level, s.activeClaim]).toEqual(["dimension", undefined])
    s = transition(s, { type: "back" })
    expect([s.level, s.activeDimension]).toEqual(["company", undefined])
    s = transition(s, { type: "back" })
    expect(s.level).toBe("world")
    expect(s.activeCompany).toBeUndefined()
  })

  it("clear_evidence / clear_claim 只退回一层，不清空更外层上下文", () => {
    let s = transition(
      transition(transition(toCompany(), { type: "open_dimension", dimensionId: "cash" }), {
        type: "open_research",
        dimensionId: "cash",
      }),
      { type: "select_claim", claimId: "c1" },
    )
    s = transition(s, { type: "select_evidence", evidenceId: "EV_1" })
    const back = transition(s, { type: "clear_evidence" })
    expect([back.level, back.activeEvidence, back.activeClaim]).toEqual(["claim", undefined, "c1"])
    const cleared = transition(back, { type: "clear_claim" })
    expect([cleared.level, cleared.activeClaim]).toEqual(["dimension", undefined])
    expect(cleared.activeDimension).toBe("cash")
  })

  it("camera / detail 层的变化不改变 semantic level（§6/§84/§85）", () => {
    let s = toCompany()
    s = transition(s, { type: "open_dimension", dimensionId: "cash" })
    // 模拟用户缩放：detail level 变化，但 state 不因 scale 改变
    const scales = [0.62, 0.75, 0.95, 1.2, 1.45]
    const levels = scales.map((sc) => getObjectDetailLevel({ cameraScale: sc, selected: true }))
    expect(new Set(levels).size).toBeGreaterThan(1)
    expect(s.level).toBe("dimension")
    expect(s.activeDimension).toBe("cash")
    expect(s.activeCompany).toBe("000333.SZ")
  })

  it("zoom_out 回到 world（§24 世界级返回）", () => {
    const s = transition(toCompany(), { type: "zoom_out" })
    expect(s.level).toBe("world")
    expect(s.transitionSource).toBe("zoom")
  })
})

describe("Semantic location indicator（§23）", () => {
  it("面包屑段由当前状态决定，每段带回退事件", () => {
    let s = toCompany()
    s = transition(s, { type: "open_dimension", dimensionId: "cash" })
    s = transition(s, { type: "open_research", dimensionId: "cash" })
    s = transition(s, { type: "select_claim", claimId: "c1" })

    const segs = breadcrumbSegments(s, { company: "美的集团", dimension: "现金转化", claim: "经营现金流仍覆盖净利润" })
    expect(segs.map((x) => x.label)).toEqual(["美的集团", "现金转化", "经营现金流仍覆盖净利润"])
    expect(segs.map((x) => x.level)).toEqual(["company", "dimension", "claim"])
    expect(segs.every((x) => typeof x.backEvent.type === "string")).toBe(true)
  })

  it("world level 不产生面包屑（世界本身不是位置）", () => {
    expect(breadcrumbSegments(INITIAL_EXPERIENCE, { company: "美的集团" })).toEqual([])
  })
})

describe("Information density（§85–§93）", () => {
  it("detail level 按 scale 与选中状态映射（micro / compact / expanded）", () => {
    expect(getObjectDetailLevel({ cameraScale: 0.7, selected: true })).toBe("micro")
    expect(getObjectDetailLevel({ cameraScale: DETAIL_THRESHOLDS.MICRO_BELOW })).toBe("compact")
    expect(getObjectDetailLevel({ cameraScale: 1.2, selected: false })).toBe("compact")
    expect(getObjectDetailLevel({ cameraScale: 1.2, selected: true })).toBe("expanded")
    expect(getObjectDetailLevel({ cameraScale: 1.3, hovered: true })).toBe("expanded")
  })

  it("Evidence Field 密度与 label 随 scale（§92–§93：12–16）", () => {
    expect(evidenceNodeBudget(0.7)).toBe(12)
    expect(evidenceNodeBudget(1.2)).toBe(16)
    expect(shouldShowEvidenceLabels(0.9)).toBe(false)
    expect(shouldShowEvidenceLabels(1.2)).toBe(true)
  })
})

describe("Degradation 本地化（§1–§4/§49–§51/§110）", () => {
  it("页面级失败只在无法建立 World 时（§4）", () => {
    // composer 部分失败但 Truth Layer 有证据 → 不是页面失败（§2）
    expect(
      shouldShowGlobalError({ companyResolved: true, truthAvailable: true, aiStatus: "failed" }),
    ).toBe(false)
    expect(
      shouldShowGlobalError({ companyResolved: true, truthAvailable: false, aiStatus: "success" }),
    ).toBe(true)
    expect(
      shouldShowGlobalError({ companyResolved: false, truthAvailable: false, aiStatus: "failed" }),
    ).toBe(true)
  })

  it("AI 解释缺失只降级解释，证据仍标记可用（§3/§49）", () => {
    expect(degradationForDimension(false, "failed")).toEqual({
      evidenceReady: true,
      interpretation: "unavailable",
    })
    expect(degradationForDimension(true, "success")).toEqual({
      evidenceReady: true,
      interpretation: "ready",
    })
  })

  it("主 UI 文案不含页面级失败语言（§50–§51）", () => {
    for (const value of Object.values(COPY)) {
      expect(containsForbiddenUiPhrase(value)).toBe(false)
    }
    expect(FORBIDDEN_UI_PHRASES.length).toBeGreaterThan(0)
    expect(containsForbiddenUiPhrase("This operation failed")).toBe(true)
  })

  it("observatory 组件里不回流失败语言（源码扫描，排除注释）", () => {
    const dir = join(process.cwd(), "src", "components", "observatory")
    const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"))
    const offenders: string[] = []
    for (const f of files) {
      const lines = readFileSync(join(dir, f), "utf8").split(/\r?\n/)
      lines.forEach((line, i) => {
        const code = line.split("//")[0] ?? ""
        if (/^\s*[{/*]/.test(line) && !line.includes('"')) return
        for (const phrase of FORBIDDEN_UI_PHRASES) {
          if (code.toLowerCase().includes(phrase.toLowerCase())) offenders.push(`${f}:${i + 1} ${phrase}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

describe("Object state machines（§57–§59）", () => {
  it("dimension visual state 优先级：parked > degraded > focused > peek > selected > hover", () => {
    const base = { parked: false, degraded: false, focused: false, peekOpen: false, selected: false, hovered: false }
    expect(dimensionVisualState(base)).toBe("idle")
    expect(dimensionVisualState({ ...base, hovered: true, selected: true })).toBe("selected")
    expect(dimensionVisualState({ ...base, selected: true, peekOpen: true })).toBe("peek")
    expect(dimensionVisualState({ ...base, selected: true, focused: true })).toBe("focused")
    expect(dimensionVisualState({ ...base, focused: true, degraded: true })).toBe("degraded")
    expect(dimensionVisualState({ ...base, degraded: true, parked: true })).toBe("parked")
  })

  it("suggestion visual state：ghost → hover → adding → ready / unknown / dismissed", () => {
    const base = { dismissed: false, adding: false, dragging: false, hovered: false }
    expect(suggestionVisualState(base)).toBe("ghost")
    expect(suggestionVisualState({ ...base, hovered: true })).toBe("hover")
    expect(suggestionVisualState({ ...base, hovered: true, dragging: true, adding: true })).toBe("adding")
    expect(suggestionVisualState({ ...base, resolvedStatus: "ready" })).toBe("ready")
    expect(suggestionVisualState({ ...base, resolvedStatus: "unknown" })).toBe("unknown")
    expect(suggestionVisualState({ ...base, resolvedStatus: "ready", dismissed: true })).toBe("dismissed")
  })

  it("company visual state：entering / research / leaving 优先于空间层级（§26–§29）", () => {
    expect(companyVisualState({ tier: "active", entering: false, researching: false, leaving: false })).toBe("active")
    expect(companyVisualState({ tier: "distant", entering: true, researching: false, leaving: false })).toBe("entering")
    expect(companyVisualState({ tier: "active", entering: false, researching: true, leaving: false })).toBe("research")
    expect(companyVisualState({ tier: "active", entering: false, researching: false, leaving: true })).toBe("leaving")
  })
})

describe("Context commands 与动效阈值（§61–§69）", () => {
  it("Command Lens 命令随 level 变化（§67–§69）", () => {
    expect(contextCommands("world").map((c) => c.id)).toEqual(["search_company", "explore_company"])
    expect(contextCommands("dimension").map((c) => c.id)).toEqual([
      "open_research",
      "add_research_angle",
      "pin_note",
    ])
    expect(contextCommands("evidence").map((c) => c.id)).toContain("return_to_claim")
    // 每个 level 至少给出一条可执行命令，不出现空状态
    for (const level of ["world", "company", "dimension", "claim", "evidence"] as const) {
      expect(contextCommands(level).length).toBeGreaterThan(0)
    }
  })

  it("关键动效时长在 60–900ms：不过快失去空间解释，不慢过操作阈值（§61–§63）", () => {
    const durations = [
      MOTION.micro,
      MOTION.peek,
      MOTION.dimensionToResearch,
      MOTION.companyToCompanyWorld,
    ].map((d) => Number.parseInt(d, 10))
    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(60)
      expect(d).toBeLessThanOrEqual(MOTION.PRODUCTIVITY_THRESHOLD_MS)
    }
  })
})

describe("载荷守卫（§4：数据不完整不得静默，也不得崩页面）", () => {
  const fixtures = join(process.cwd(), "tests", "fixtures", "observatory")
  const readFixture = (name: string) => JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8"))

  it("完整 Research Space 才被接受（真实 fixture）", () => {
    expect(isResearchSpace(readFixture("midea-overview"))).toBe(true)
    expect(isResearchSpace(readFixture("midea-valuation"))).toBe(true)
  })

  it("别的 API 载荷（如新增维度结果）不被当作研究空间", () => {
    expect(isResearchSpace(readFixture("unknown-dimension"))).toBe(false)
  })

  it("空值 / 缺字段 / 错类型一律拒绝", () => {
    expect(isResearchSpace(null)).toBe(false)
    expect(isResearchSpace(undefined)).toBe(false)
    expect(isResearchSpace("space")).toBe(false)
    expect(isResearchSpace({})).toBe(false)
    expect(isResearchSpace({ company: { stockCode: "000333.SZ" }, dimensions: [], claims: [], evidence: [] })).toBe(false)
    const ok = readFixture("midea-overview") as Record<string, unknown>
    expect(isResearchSpace({ ...ok, dimensions: undefined })).toBe(false)
    expect(isResearchSpace({ ...ok, evidence: "none" })).toBe(false)
    expect(isResearchSpace({ ...ok, company: {} })).toBe(false)
  })
})

describe("Renderer 独立性（§33）", () => {
  it("experience 模块不 import 任何 Renderer / 视觉隐喻", () => {
    const dir = join(process.cwd(), "src", "lib", "experience")
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"))
    expect(files.length).toBeGreaterThanOrEqual(3)
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8")
      expect(src).not.toMatch(/renderers?\//)
      expect(src).not.toMatch(/pearl|dusk|terrain|cosmos/i)
      expect(src).not.toMatch(/react"/)
    }
  })

  it("ObservatoryApp 是唯一持有 ExperienceState 的组件（§10：不允许组件各自 transition）", () => {
    const dir = join(process.cwd(), "src", "components", "observatory")
    const owners: string[] = []
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
      const src = readFileSync(join(dir, f), "utf8")
      if (/useState<\s*ExperienceState\s*>/.test(src)) owners.push(f)
    }
    expect(owners).toEqual(["ObservatoryApp.tsx"])
  })
})
