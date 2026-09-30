import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runFollowup } from "@/lib/ai/followup"
import { POST as followupRoute } from "@/app/api/followup/route"
import { stubFetch, VALID_SYNTHESIS_JSON } from "./helpers"

const ORIGINAL_FUYAO = process.env.FUYAO_API_KEY
const ORIGINAL_DEEPSEEK = process.env.DEEPSEEK_API_KEY

beforeEach(() => {
  process.env.FUYAO_API_KEY = "test"
  process.env.DEEPSEEK_API_KEY = "test"
})

afterEach(() => {
  vi.unstubAllGlobals()
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  restore("FUYAO_API_KEY", ORIGINAL_FUYAO)
  restore("DEEPSEEK_API_KEY", ORIGINAL_DEEPSEEK)
})

const FOCUS = ["EV_FACT_FIN_GROSS_MARGIN_CHANGE_YOY"]

describe("Followup（Task 06 五个核心 Case）", () => {
  it("Case 1｜正常 followup：绑定焦点证据，返回分层回答", async () => {
    const { fetchMock, deepseekCalls, setScript } = stubFetch()
    setScript({ synthesizer: [VALID_SYNTHESIS_JSON] })
    vi.stubGlobal("fetch", fetchMock)

    const resp = await runFollowup({
      stockCode: "000333.SZ",
      question: "毛利率下降主要集中在哪个季度？",
      focusEvidenceIds: FOCUS,
    })

    expect(resp.mode).toBe("followup")
    expect(resp.ai.status).toBe("success")
    expect(resp.synthesis).not.toBeNull()
    expect(resp.focusEvidenceIds).toEqual(FOCUS)
    expect(resp.ignoredEvidenceIds).toEqual([])
    // grounding：所有引用都在全量证据集内
    const ids = new Set(resp.evidence.map((e) => e.evidenceId))
    for (const st of [resp.synthesis!.summary, ...resp.synthesis!.confirmedFacts, ...resp.synthesis!.analysisInferences, ...resp.synthesis!.unknowns]) {
      for (const id of st.evidenceIds) expect(ids.has(id)).toBe(true)
    }
    // 追问上下文包含焦点证据
    const call = deepseekCalls[0]
    expect(call.user).toContain("EV_FACT_FIN_GROSS_MARGIN_CHANGE_YOY")
    expect(call.system).toContain("研究追问器")
  })

  it("Case 2｜Evidence grounding：焦点 ID 不存在时被过滤并如实上报", async () => {
    const { fetchMock, setScript } = stubFetch()
    setScript({ synthesizer: [VALID_SYNTHESIS_JSON] })
    vi.stubGlobal("fetch", fetchMock)

    const resp = await runFollowup({
      stockCode: "000333.SZ",
      question: "毛利率下降的原因？",
      focusEvidenceIds: [FOCUS[0], "EV_FAKE_CLIENT_001"],
    })

    expect(resp.focusEvidenceIds).toEqual(FOCUS)
    expect(resp.ignoredEvidenceIds).toEqual(["EV_FAKE_CLIENT_001"])
    expect(resp.ai.status).toBe("success")
  })

  it("Case 3｜模型伪造 Evidence ID：repair 后仍失败 → synthesis=null、证据保留", async () => {
    const fabricated = JSON.stringify({
      summary: { text: "回答。", evidenceIds: ["EV_FAKE_001"] },
      confirmedFacts: [], analysisInferences: [], unknowns: [],
      nextQuestions: ["继续研究方向。"],
    })
    const { fetchMock, setScript } = stubFetch()
    setScript({ synthesizer: [fabricated, fabricated] })
    vi.stubGlobal("fetch", fetchMock)

    const resp = await runFollowup({
      stockCode: "000333.SZ",
      question: "毛利率下降值得担心吗？",
      focusEvidenceIds: FOCUS,
    })

    expect(resp.ai.status).toBe("failed")
    expect(resp.synthesis).toBeNull()
    expect(resp.evidence.length).toBeGreaterThan(30) // Truth Layer 完整保留（含基准/行业新增事实）
    expect(resp.ai.trace?.validationIssues?.join(" ")).toContain("EV_FAKE_001")
  })

  it("Case 4｜AI failure（超时）：Evidence 仍完整返回", async () => {
    const { fetchMock, setScript } = stubFetch()
    setScript({ synthesizer: ["timeout"] })
    vi.stubGlobal("fetch", fetchMock)

    const resp = await runFollowup({
      stockCode: "000333.SZ",
      question: "短期行情走弱与基本面有关吗？",
      focusEvidenceIds: FOCUS,
    })

    expect(resp.ai.status).toBe("failed")
    expect(resp.synthesis).toBeNull()
    expect(resp.evidence.length).toBeGreaterThan(30)
    expect(resp.ai.trace?.validationIssues?.[0]).toContain("aborted")
  })

  it("Case 5｜投资建议类追问：路由层直接拦截，不调用 LLM", async () => {
    const { fetchMock, deepseekCalls } = stubFetch()
    vi.stubGlobal("fetch", fetchMock)

    const request = new Request("http://localhost/api/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stockCode: "000333.SZ",
        question: "毛利率在下降，现在能买吗？",
        evidenceIds: FOCUS,
      }),
    })
    const res = await followupRoute(request)
    const body = await res.json()

    expect(body.mode).toBe("compliance_redirect")
    expect(body.ai.status).toBe("not_invoked")
    expect(body.synthesis).toBeNull()
    expect(body.compliance.message).toContain("不提供买卖建议")
    expect(deepseekCalls).toHaveLength(0)
  })
})
