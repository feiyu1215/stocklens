import { describe, expect, it } from "vitest"

import {
  FIELD_CATALOG,
  indicatorReportToPeriod,
  msToShanghaiDate,
  normalizeBasicInfo,
  normalizePrices,
  normalizeValuation,
  periodKeyOf,
  periodToIndicatorReport,
  zipFinancialPeriods,
} from "@/lib/data/normalize"
import { FuyaoNotFoundError } from "@/lib/data/fuyao"

describe("报告期与时间格式", () => {
  it("periodKeyOf / periodToIndicatorReport / indicatorReportToPeriod 互转一致", () => {
    expect(periodKeyOf(2026, "Q2")).toBe("2026-Q2")
    expect(periodToIndicatorReport("2026-Q2")).toBe("2026-2")
    expect(indicatorReportToPeriod("2026-2")).toBe("2026-Q2")
    expect(() => periodToIndicatorReport("2026Q2")).toThrow()
  })

  it("msToShanghaiDate 按上海时区换算交易日", () => {
    // 2026-09-30T00:00:00+08:00 = 2026-09-29T16:00:00Z
    expect(msToShanghaiDate(Date.UTC(2026, 8, 29, 16, 0, 0))).toBe("2026-09-30")
    // 2026-09-30T00:00:00Z（上海时间 08:00）仍是同一交易日
    expect(msToShanghaiDate(Date.UTC(2026, 8, 30, 0, 0, 0))).toBe("2026-09-30")
  })
})

describe("normalizeBasicInfo", () => {
  const searchData = {
    timestamp: Date.UTC(2026, 8, 30, 2, 0, 0),
    item: [
      { thscode: "000333.OF", ticker: "000333", name: "稳固A", asset_type: "fund-otc", exchange: null, currency: "CNY" },
      { thscode: "000333.SZ", ticker: "000333", name: "美的集团", asset_type: "a-share", exchange: "SZ", currency: "CNY" },
    ],
  }

  it("只取 a-share 精确匹配，跳过同名基金；行业如实为 null", () => {
    const info = normalizeBasicInfo(searchData, "000333.SZ")
    expect(info.stockName).toBe("美的集团")
    expect(info.industry).toBeNull()
    expect(info.source).toBe("fuyao")
    expect(info.updatedAt).toBeTypeOf("string")
  })

  it("找不到匹配时抛 FuyaoNotFoundError（不生成默认数据）", () => {
    expect(() => normalizeBasicInfo({ timestamp: 0, item: [] }, "999999.SZ")).toThrow(
      FuyaoNotFoundError,
    )
  })
})

describe("zipFinancialPeriods —— Missing 与 Zero 严格区分", () => {
  const income = [
    {
      thscode: "000333.SZ", fiscal_year: 2026, fiscal_period: "Q2",
      report_date_ms: null, period_end_ms: null, currency: "CNY",
      operating_income: 100, operating_costs: null, operating_profit: null,
      net_profit: 0, parent_holder_net_profit: 0,
    },
    {
      thscode: "000333.SZ", fiscal_year: 2026, fiscal_period: "Q1",
      report_date_ms: null, period_end_ms: null, currency: "CNY",
      operating_income: null, operating_costs: null, operating_profit: null,
      net_profit: 50, parent_holder_net_profit: 50,
    },
  ]
  const cashflow = [
    {
      thscode: "000333.SZ", fiscal_year: 2026, fiscal_period: "Q2",
      report_date_ms: null, period_end_ms: null, currency: "CNY",
      act_cash_flow_net: -20,
    },
  ]
  const indicators = {
    thscode: "000333.SZ",
    report: "2026-2",
    abilities: [
      {
        ability: "profitability",
        indicators: [
          { index_id: "sale_gross_margin", value: "25.25" },
          { index_id: "sale_net_interest_ratio", value: null },
          { index_id: "index_weighted_avg_roe", value: "11.33" },
        ],
      },
    ],
  }

  it("真实 0 原样保留，真实负数原样保留", () => {
    const [q2] = zipFinancialPeriods("000333.SZ", income, cashflow, [indicators], "2026-09-30T00:00:00Z")
    expect(q2.period).toBe("2026-Q2")
    expect(q2.revenue).toBe(100)
    expect(q2.netProfit).toBe(0) // 真实 0，不是缺失
    expect(q2.operatingCashflow).toBe(-20)
  })

  it("已查询期次指标取值；指标值为 null 保留 null；未查询期次为 undefined（序列化后键不出现）", () => {
    const [q2, q1] = zipFinancialPeriods("000333.SZ", income, cashflow, [indicators], null)
    expect(q2.grossMargin).toBe(25.25)
    expect(q2.netMargin).toBeNull() // 指标接口返回了但值为空
    expect(q2.roe).toBe(11.33)
    expect(q1.grossMargin).toBeUndefined()
    expect(q1.roe).toBeUndefined()
    expect(JSON.parse(JSON.stringify(q1))).not.toHaveProperty("grossMargin")
    expect(JSON.parse(JSON.stringify(q1))).not.toHaveProperty("roe")
  })

  it("缺失字段为 null；无现金流期次 operatingCashflow 为 null", () => {
    const [, q1] = zipFinancialPeriods("000333.SZ", income, cashflow, [indicators], null)
    expect(q1.revenue).toBeNull() // 接口返回 null
    expect(q1.netProfit).toBe(50)
    expect(q1.operatingCashflow).toBeNull() // 无该期现金流数据
  })

  it("期次倒序排列", () => {
    const periods = zipFinancialPeriods("000333.SZ", income, cashflow, [indicators], null)
    expect(periods.map((p) => p.period)).toEqual(["2026-Q2", "2026-Q1"])
  })

  it("指标请求失败（空集）时所有期次 margins/roe 为 undefined，报表数据不受影响", () => {
    const periods = zipFinancialPeriods("000333.SZ", income, cashflow, [], null)
    expect(periods[0].revenue).toBe(100)
    expect(periods[0].grossMargin).toBeUndefined()
    expect(JSON.parse(JSON.stringify(periods[0]))).not.toHaveProperty("grossMargin")
  })
})

describe("normalizeValuation", () => {
  it("pe_ttm 可为负（亏损公司）原样保留；pb_mrq 缺失为 null", () => {
    const data = {
      timestamp: Date.UTC(2026, 8, 30, 2, 0, 0),
      item: [{ thscode: "000333.SZ", name: "美的集团", pe_ttm: -3.2, pe_mrq: null, pb_mrq: null, ps_ttm: 1.4, pcf_ttm: 11.4 }],
    }
    const v = normalizeValuation(data, "000333.SZ")
    expect(v.peTtm).toBe(-3.2)
    expect(v.pb).toBeNull()
    expect(v.date).toBe("2026-09-30")
  })
})

describe("normalizePrices", () => {
  it("升序排序、日期换算、剔除缺 close 的条目", () => {
    const data = {
      item: [
        { date_ms: Date.UTC(2026, 8, 29, 16), open_price: 81, high_price: 82, low_price: 80, close_price: 81.5, volume: 1, turnover: 1 },
        { date_ms: Date.UTC(2026, 8, 26, 16), open_price: 78, high_price: 79, low_price: 77, close_price: 78.4, volume: 1, turnover: 1 },
        { date_ms: Date.UTC(2026, 8, 25, 16), open_price: 77, high_price: 78, low_price: 76, close_price: null, volume: 1, turnover: 1 },
      ],
    }
    const prices = normalizePrices(data, "000333.SZ")
    expect(prices).toHaveLength(2)
    expect(prices[0].date).toBe("2026-09-27")
    expect(prices[0].close).toBe(78.4)
    expect(prices[1].date).toBe("2026-09-30")
    expect(prices[1].close).toBe(81.5)
  })

  it("空 item 返回空数组（不是错误，也不产生伪造数据）", () => {
    expect(normalizePrices({ item: null }, "000333.SZ")).toEqual([])
  })
})

describe("FIELD_CATALOG", () => {
  it("关键内部字段均已登记原始字段与单位", () => {
    const names = FIELD_CATALOG.map((f) => f.internal)
    for (const key of ["stockName", "industry", "revenue", "netProfit", "operatingCashflow", "grossMargin", "netMargin", "roe", "peTtm", "pb", "price.close/open/high/low"]) {
      expect(names).toContain(key)
    }
  })
})
