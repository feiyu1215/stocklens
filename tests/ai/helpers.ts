import { vi, type Mock } from "vitest"

// AI 层测试的 fetch 桩：扶摇（真实成功数据）+ DeepSeek（按场景脚本化响应）。
// 单元测试不依赖外网模型。

const tickerSearchBody = {
  code: 0, message: "success",
  data: {
    timestamp: Date.UTC(2026, 8, 30, 2, 0, 0),
    item: [{ thscode: "000333.SZ", ticker: "000333", name: "美的集团", asset_type: "a-share", exchange: "SZ", currency: "CNY" }],
  },
}

const incomeBody = {
  code: 0, message: "success",
  data: {
    timestamp: Date.UTC(2026, 8, 30, 2, 0, 0),
    item: [
      { thscode: "000333.SZ", fiscal_year: 2026, fiscal_period: "Q2", report_date_ms: null, period_end_ms: null, currency: "CNY", operating_income: 260042490000, operating_costs: null, operating_profit: null, net_profit: 26582874000, parent_holder_net_profit: 26446037000 },
      { thscode: "000333.SZ", fiscal_year: 2026, fiscal_period: "Q1", report_date_ms: null, period_end_ms: null, currency: "CNY", operating_income: 131098601000, operating_costs: null, operating_profit: null, net_profit: 12859511000, parent_holder_net_profit: 12674556000 },
      { thscode: "000333.SZ", fiscal_year: 2025, fiscal_period: "Q2", report_date_ms: null, period_end_ms: null, currency: "CNY", operating_income: 251203000000, operating_costs: null, operating_profit: null, net_profit: 26120000000, parent_holder_net_profit: 26003000000 },
      { thscode: "000333.SZ", fiscal_year: 2025, fiscal_period: "Q1", report_date_ms: null, period_end_ms: null, currency: "CNY", operating_income: 126600000000, operating_costs: null, operating_profit: null, net_profit: 12440000000, parent_holder_net_profit: 12400000000 },
    ],
  },
}

const cashflowBody = {
  code: 0, message: "success",
  data: {
    timestamp: Date.UTC(2026, 8, 30, 2, 0, 0),
    item: [
      { thscode: "000333.SZ", fiscal_year: 2026, fiscal_period: "Q2", report_date_ms: null, period_end_ms: null, currency: "CNY", act_cash_flow_net: 37552090000 },
      { thscode: "000333.SZ", fiscal_year: 2026, fiscal_period: "Q1", report_date_ms: null, period_end_ms: null, currency: "CNY", act_cash_flow_net: 17000000000 },
      { thscode: "000333.SZ", fiscal_year: 2025, fiscal_period: "Q2", report_date_ms: null, period_end_ms: null, currency: "CNY", act_cash_flow_net: 37280000000 },
      { thscode: "000333.SZ", fiscal_year: 2025, fiscal_period: "Q1", report_date_ms: null, period_end_ms: null, currency: "CNY", act_cash_flow_net: 16500000000 },
    ],
  },
}

function indicatorsBody(report: string) {
  return {
    code: 0, message: "success",
    data: {
      thscode: "000333.SZ",
      report,
      abilities: [
        {
          ability: "profitability",
          indicators: [
            { index_id: "sale_gross_margin", value: report === "2026-2" ? "25.2558" : "25.62" },
            { index_id: "sale_net_interest_ratio", value: report === "2026-2" ? "10.2225" : "10.35" },
            { index_id: "index_weighted_avg_roe", value: report === "2026-2" ? "11.33" : "11.29" },
          ],
        },
      ],
    },
  }
}

const valuationBody = {
  code: 0, message: "success",
  data: {
    timestamp: Date.UTC(2026, 8, 30, 2, 0, 0),
    item: [{ thscode: "000333.SZ", name: "美的集团", pe_ttm: 13.77168, pe_mrq: null, pb_mrq: 2.885786, ps_ttm: 1.4, pcf_ttm: 11.4 }],
  },
}

const pricesBody = {
  code: 0, message: "success",
  data: {
    item: Array.from({ length: 130 }, (_, i) => ({
      date_ms: Date.UTC(2026, 0, 1, 16) + i * 2 * 24 * 3600 * 1000,
      open_price: 80, high_price: 82, low_price: 79,
      close_price: i < 100 ? 70 + i * 0.1 : 78 - (i - 100) * 0.15,
      volume: 1, turnover: 1,
    })),
  },
}

export interface DeepseekCall {
  system: string
  user: string
  rawBody: unknown
}

export interface StubOptions {
  /** 按 task 顺序提供响应脚本；返回 string = content；"timeout" = 抛出超时；{status} = HTTP 错误 */
  planner?: (string | "timeout" | { status: number })[]
  synthesizer?: (string | "timeout" | { status: number })[]
}

export function stubFetch(): { fetchMock: Mock; deepseekCalls: DeepseekCall[]; setScript: (s: StubOptions) => void } {
  const deepseekCalls: DeepseekCall[] = []
  let script: StubOptions = {}

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))

    if (url.host === "api.deepseek.com") {
      const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] }
      const system = body.messages[0]?.content ?? ""
      const user = body.messages[1]?.content ?? ""
      const call: DeepseekCall = { system, user, rawBody: body }
      const isPlanner = system.includes("研究规划器")
      const queue = isPlanner ? script.planner : script.synthesizer
      const taskIndex = deepseekCalls.filter((c) => c.system.includes(isPlanner ? "研究规划器" : "证据综合器")).length
      deepseekCalls.push(call)

      const next = queue
        ? taskIndex < queue.length
          ? queue[taskIndex]
          : queue[queue.length - 1]
        : undefined
      if (next === "timeout") {
        throw new Error("The operation was aborted due to timeout")
      }
      if (typeof next === "object" && next !== null && "status" in next) {
        return new Response("server error", { status: next.status })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: next ?? "{}" } }] }), { status: 200 })
    }

    // ---------- 扶摇路由（全部成功） ----------
    if (url.pathname.includes("/tickers/search")) {
      return new Response(JSON.stringify(tickerSearchBody), { status: 200 })
    }
    if (url.pathname.includes("income-statements")) {
      return new Response(JSON.stringify(incomeBody), { status: 200 })
    }
    if (url.pathname.includes("cash-flow-statements")) {
      return new Response(JSON.stringify(cashflowBody), { status: 200 })
    }
    if (url.pathname.includes("financials/indicators")) {
      const report = url.searchParams.get("report") ?? "2026-2"
      return new Response(JSON.stringify(indicatorsBody(report)), { status: 200 })
    }
    if (url.pathname.includes("/valuations/")) {
      return new Response(JSON.stringify(valuationBody), { status: 200 })
    }
    if (url.pathname.includes("prices/historical")) {
      return new Response(JSON.stringify(pricesBody), { status: 200 })
    }
    return new Response(JSON.stringify({ code: 1002, message: "unrouted", data: null }), { status: 200 })
  })

  return {
    fetchMock,
    deepseekCalls,
    setScript: (s) => {
      script = s
    },
  }
}

export const VALID_PLANNER_JSON =
  '{"intent":"overall_diagnosis","dimensions":["growth","profitability","cashflow"],"optionalDimensions":["valuation","market"],"reason":"用户询问整体经营状态，优先覆盖增长、盈利与现金流维度。"}'

export const VALID_SYNTHESIS_JSON = JSON.stringify({
  summary: {
    text: "公司收入和利润保持同比增长，但毛利率较上年同期有所下降，增长与盈利变化方向不完全一致；行情上短期与中期方向存在背离。",
    evidenceIds: ["EV_FACT_FIN_REVENUE_YOY_YTD", "EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE", "EV_INF_MARKET_HORIZON_DIVERGENCE"],
  },
  confirmedFacts: [
    { text: "最新报告期营业收入累计同比增长。", evidenceIds: ["EV_FACT_FIN_REVENUE_YOY_YTD"] },
    { text: "归母净利润累计同比增长。", evidenceIds: ["EV_FACT_FIN_NET_PROFIT_YOY_YTD"] },
  ],
  analysisInferences: [
    {
      text: "收入仍在增长，但毛利率较上年同期下降，经营增长与盈利水平的变化方向并不完全一致。",
      evidenceIds: ["EV_INF_FIN_GROWTH_MARGIN_DIVERGENCE", "EV_FACT_FIN_REVENUE_YOY_YTD", "EV_FACT_FIN_GROSS_MARGIN_CHANGE_YOY"],
    },
  ],
  unknowns: [
    { text: "当前只能确认 PE/PB 快照，尚无法判断估值处于自身历史什么位置。", evidenceIds: ["EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE"] },
  ],
  nextQuestions: ["毛利率下降是否主要集中在最新单季度？", "短期行情走弱是否与基本面变化同步？"],
})
