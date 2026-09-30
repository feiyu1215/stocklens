"use client"

import type { MetricResult } from "@/lib/metrics/types"
import { formatMetricValue } from "@/lib/presentation/formatters"

// 市场对比（Task 08 §32）：个股 / 沪深300 / 行业指数 × 20/60/120D 三行三列。
// 数字全部来自 Metric Engine（前端只读取与格式化）。

const HORIZONS = [20, 60, 120] as const

interface Row {
  label: string
  ids: Record<(typeof HORIZONS)[number], string>
  relativeIds?: Record<(typeof HORIZONS)[number], string>
}

export function MarketContextTable({
  metrics,
  industryLabel,
}: {
  metrics: MetricResult[]
  industryLabel?: string | null
}) {
  const byId = new Map(metrics.map((m) => [m.metricId, m] as const))
  const hasIndustry = HORIZONS.some((n) => byId.get(`IND_RETURN_${n}D`)?.status === "available")
  const hasBenchmark = HORIZONS.some((n) => byId.get(`MKT_CSI300_RETURN_${n}D`)?.status === "available")
  if (!hasBenchmark && !hasIndustry) return null

  const rows: Row[] = [
    {
      label: "个股",
      ids: { 20: "MKT_RETURN_20D", 60: "MKT_RETURN_60D", 120: "MKT_RETURN_120D" },
    },
    {
      label: "沪深300",
      ids: { 20: "MKT_CSI300_RETURN_20D", 60: "MKT_CSI300_RETURN_60D", 120: "MKT_CSI300_RETURN_120D" },
      relativeIds: { 20: "MKT_RELATIVE_CSI300_20D", 60: "MKT_RELATIVE_CSI300_60D", 120: "MKT_RELATIVE_CSI300_120D" },
    },
  ]
  if (hasIndustry) {
    rows.push({
      label: industryLabel ? `${industryLabel}指数` : "所属行业",
      ids: { 20: "IND_RETURN_20D", 60: "IND_RETURN_60D", 120: "IND_RETURN_120D" },
      relativeIds: {
        20: "MKT_RELATIVE_INDUSTRY_20D",
        60: "MKT_RELATIVE_INDUSTRY_60D",
        120: "MKT_RELATIVE_INDUSTRY_120D",
      },
    })
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold text-zinc-900">区间表现对比</h2>
      <p className="mt-0.5 text-xs text-zinc-400">
        与个股同口径（N 个交易日跨度，前复权 / 指数收盘）。相对值为百分点差（个股 − 基准）。
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-xs text-zinc-400">
              <th className="py-1.5 text-left font-normal">区间</th>
              {HORIZONS.map((n) => (
                <th key={n} className="py-1.5 text-right font-normal">
                  {n} 个交易日
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-zinc-100">
                <td className="py-2 font-medium text-zinc-700">{row.label}</td>
                {HORIZONS.map((n) => {
                  const metric = byId.get(row.ids[n])
                  const rel = row.relativeIds ? byId.get(row.relativeIds[n]) : undefined
                  return (
                    <td key={n} className="py-2 text-right">
                      <div className="font-mono text-zinc-900">
                        {metric && metric.status === "available" ? formatMetricValue(metric) : "—"}
                      </div>
                      {rel && (
                        <div className="font-mono text-xs text-zinc-400">
                          相对 {rel.status === "available" ? formatMetricValue(rel) : "—"}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        相对表现仅表示区间涨跌差异，不代表公司经营质量或投资价值。
      </p>
    </section>
  )
}
