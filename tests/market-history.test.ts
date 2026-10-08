import { describe, expect, it } from "vitest"

import { buildMarketChartModel, selectMarketRange } from "@/lib/v5/market-history"

const points = Array.from({ length: 140 }, (_, index) => ({
  date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
  close: 50 + index * 0.2,
}))

describe("market history presentation", () => {
  it("按交易日窗口取最新数据，ALL 保留全部有效点", () => {
    expect(selectMarketRange(points, 20)).toEqual(points.slice(-20))
    expect(selectMarketRange(points, 120)).toEqual(points.slice(-120))
    expect(selectMarketRange(points, "all")).toHaveLength(140)
    expect(selectMarketRange(points, "ytd")).toHaveLength(140)
  })

  it("生成可渲染路径和真实区间涨跌，不修改原始收盘价", () => {
    const selected = selectMarketRange(points, 60)
    const model = buildMarketChartModel(selected)
    expect(model?.path.startsWith("M")).toBe(true)
    expect(model?.areaPath.endsWith("Z")).toBe(true)
    expect(model?.latest).toBe(selected[selected.length - 1].close)
    expect(model?.changePct).toBeCloseTo((selected[selected.length - 1].close / selected[0].close - 1) * 100)
    expect(model?.pointCount).toBe(60)
    expect(model?.coordinates).toHaveLength(60)
    expect(model?.coordinates[0].x).toBe(5)
  })

  it("数据不足时不伪造趋势", () => {
    expect(buildMarketChartModel([])).toBeNull()
    expect(buildMarketChartModel([points[0]])).toBeNull()
  })
})
