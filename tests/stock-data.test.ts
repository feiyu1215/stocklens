import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { gatherStockData } from "@/lib/data/stock-data"

// 通过路由 URL 分流的 fetch 桩：模拟「估值域失败、其余域成功」的部分失败场景，
// 全程无真实网络请求。
function stubFetchByRoute(handler: (url: URL) => { status?: number; body?: unknown }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    const { status = 200, body = { code: 0, message: "success", data: null } } = handler(url)
    return new Response(JSON.stringify(body), { status })
  })
}

const tickerSearchBody = {
  code: 0,
  message: "success",
  data: {
    timestamp: Date.UTC(2026, 8, 30, 2, 0, 0),
    item: [
      { thscode: "000333.SZ", ticker: "000333", name: "美的集团", asset_type: "a-share", exchange: "SZ", currency: "CNY" },
    ],
  },
}

const incomeBody = {
  code: 0,
  message: "success",
  data: {
    timestamp: Date.UTC(2026, 8, 30, 2, 0, 0),
    item: [
      {
        thscode: "000333.SZ", fiscal_year: 2026, fiscal_period: "Q2",
        report_date_ms: null, period_end_ms: null, currency: "CNY",
        operating_income: 260042490000, operating_costs: null, operating_profit: null,
        net_profit: 26582874000, parent_holder_net_profit: 26446037000,
      },
    ],
  },
}

const cashflowBody = {
  code: 0,
  message: "success",
  data: {
    timestamp: Date.UTC(2026, 8, 30, 2, 0, 0),
    item: [
      {
        thscode: "000333.SZ", fiscal_year: 2026, fiscal_period: "Q2",
        report_date_ms: null, period_end_ms: null, currency: "CNY",
        act_cash_flow_net: 37552090000,
      },
    ],
  },
}

const indicatorsBody = {
  code: 0,
  message: "success",
  data: {
    thscode: "000333.SZ",
    report: "2026-2",
    abilities: [
      {
        ability: "profitability",
        indicators: [
          { index_id: "sale_gross_margin", value: "25.2558" },
          { index_id: "sale_net_interest_ratio", value: "10.2225" },
          { index_id: "index_weighted_avg_roe", value: "11.33" },
        ],
      },
    ],
  },
}

const pricesBody = {
  code: 0,
  message: "success",
  data: {
    item: [
      { date_ms: Date.UTC(2026, 8, 26, 16), open_price: 78, high_price: 79, low_price: 77, close_price: 78.4, volume: 1, turnover: 1 },
      { date_ms: Date.UTC(2026, 8, 29, 16), open_price: 81, high_price: 82, low_price: 80, close_price: 80.4, volume: 1, turnover: 1 },
    ],
  },
}

const ORIGINAL_KEY = process.env.FUYAO_API_KEY

beforeEach(() => {
  process.env.FUYAO_API_KEY = "test-key"
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL_KEY === undefined) delete process.env.FUYAO_API_KEY
  else process.env.FUYAO_API_KEY = ORIGINAL_KEY
})

describe("gatherStockData —— 部分失败（partial failure）", () => {
  it("估值域 HTTP 500：仅 valuation 失败，其余三域正常，errors 精确记录", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchByRoute((url) => {
        if (url.pathname.includes("/valuations/")) return { status: 500 }
        if (url.pathname.includes("/tickers/search")) return { body: tickerSearchBody }
        if (url.pathname.includes("income-statements")) return { body: incomeBody }
        if (url.pathname.includes("cash-flow-statements")) return { body: cashflowBody }
        if (url.pathname.includes("financials/indicators")) return { body: indicatorsBody }
        if (url.pathname.includes("prices/historical")) return { body: pricesBody }
        return { status: 404 }
      }),
    )

    const resp = await gatherStockData("000333.SZ")

    expect(resp.availability).toEqual({ basic: true, financial: true, valuation: false, prices: true })
    expect(resp.errors).toHaveLength(1)
    expect(resp.errors[0]).toMatchObject({ domain: "valuation", source: "fuyao" })
    expect(resp.errors[0].message).toContain("HTTP 500")

    expect(resp.stock?.stockName).toBe("美的集团")
    expect(resp.financial[0]).toMatchObject({
      period: "2026-Q2",
      revenue: 260042490000,
      netProfit: 26446037000,
      operatingCashflow: 37552090000,
      roe: 11.33,
    })
    expect(resp.valuation).toBeNull()
    expect(resp.prices).toHaveLength(2)

    expect(resp.meta.latest_financial_period).toBe("2026-Q2")
    expect(resp.meta.latest_price_date).toBe("2026-09-30")
    expect(resp.meta.requested_at).toBeTypeOf("string")
  })

  it("全部域失败（如信封 code!=0）：四域 availability 全 false 且无任何伪造数据", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchByRoute(() => ({
        body: { code: 1002, message: "Unknown A-share thscode: 999999.SZ", data: null },
      })),
    )

    const resp = await gatherStockData("999999.SZ")

    expect(resp.availability).toEqual({ basic: false, financial: false, valuation: false, prices: false })
    expect(resp.errors.length).toBeGreaterThanOrEqual(4)
    expect(resp.errors.every((e) => e.code === "1002")).toBe(true)
    expect(resp.stock).toBeNull()
    expect(resp.financial).toEqual([])
    expect(resp.valuation).toBeNull()
    expect(resp.prices).toEqual([])
  })

  it("财务指标失败时保留报表数据，并明确记录指标缺口", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetchByRoute((url) => {
        if (url.pathname.includes("/tickers/search")) return { body: tickerSearchBody }
        if (url.pathname.includes("income-statements")) return { body: incomeBody }
        if (url.pathname.includes("cash-flow-statements")) return { body: cashflowBody }
        if (url.pathname.includes("financials/indicators")) return { status: 500 }
        if (url.pathname.includes("/valuations/")) return { body: { code: 0, message: "success", data: { timestamp: Date.UTC(2026, 8, 30), item: [] } } }
        if (url.pathname.includes("prices/historical")) return { body: pricesBody }
        return { status: 404 }
      }),
    )

    const resp = await gatherStockData("000333.SZ")

    expect(resp.availability.financial).toBe(true)
    expect(resp.financial[0]).toMatchObject({
      period: "2026-Q2",
      revenue: 260042490000,
      operatingCashflow: 37552090000,
    })
    expect(resp.financial[0].grossMargin).toBeUndefined()
    const indicatorErrors = resp.errors.filter((error) => error.domain === "financial")
    expect(indicatorErrors).toHaveLength(2)
    expect(indicatorErrors.every((error) => error.message.includes("财务指标"))).toBe(true)
  })
})
