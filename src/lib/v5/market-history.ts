export interface MarketHistoryPoint {
  date: string
  close: number
}

export type MarketRange = 20 | 60 | 120 | "ytd" | "all"

export function selectMarketRange(points: MarketHistoryPoint[], range: MarketRange): MarketHistoryPoint[] {
  const clean = points
    .filter((point) => point.date && Number.isFinite(point.close) && point.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date))
  if (range === "all") return clean
  if (range === "ytd") {
    const latestYear = clean.at(-1)?.date.slice(0, 4)
    return latestYear ? clean.filter((point) => point.date.startsWith(`${latestYear}-`)) : []
  }
  return clean.slice(-range)
}

export interface MarketChartCoordinate {
  x: number
  y: number
}

export interface MarketChartModel {
  path: string
  areaPath: string
  min: number
  max: number
  latest: number
  changePct: number
  firstDate: string
  latestDate: string
  pointCount: number
  coordinates: MarketChartCoordinate[]
}

/** 只负责把真实收盘序列投影成 SVG，不平滑、不预测、不填补缺失值。 */
export function buildMarketChartModel(
  points: MarketHistoryPoint[],
  width = 282,
  height = 86,
  padding = 5,
): MarketChartModel | null {
  if (points.length < 2) return null
  const values = points.map((point) => point.close)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const x = (index: number) => padding + (index * (width - padding * 2)) / (points.length - 1)
  const y = (value: number) =>
    span === 0 ? height / 2 : padding + ((max - value) / span) * (height - padding * 2)
  const coordinates = points.map((point, index) => ({ x: x(index), y: y(point.close) }))
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ")
  const first = points[0]
  const latest = points[points.length - 1]
  return {
    path,
    areaPath: `${path} L${coordinates[coordinates.length - 1].x.toFixed(2)},${height} L${coordinates[0].x.toFixed(2)},${height} Z`,
    min,
    max,
    latest: latest.close,
    changePct: (latest.close / first.close - 1) * 100,
    firstDate: first.date,
    latestDate: latest.date,
    pointCount: points.length,
    coordinates,
  }
}
