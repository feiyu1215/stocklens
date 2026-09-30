"use client"

import type { FinancialTrendPoint } from "@/lib/metrics/trend"

// 财务趋势（Task 08 §30–31）：轻量 SVG 折线 + 可追溯表格。
// 数据来自后端 trend 序列（Metric Engine 计算），前端只渲染不重算。
// 只描述历史，不做预测/外推。

type TrendFieldKey = "revenueQuarterYoY" | "netProfitQuarterYoY"

const SERIES: { key: TrendFieldKey; label: string; stroke: string }[] = [
  { key: "revenueQuarterYoY", label: "单季营收同比", stroke: "#4f46e5" },
  { key: "netProfitQuarterYoY", label: "单季归母净利同比", stroke: "#0891b2" },
]

function buildPath(
  points: { x: number; y: number }[],
): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
}

export function TrendPanel({ trend }: { trend: FinancialTrendPoint[] }) {
  const withYoY = trend.filter(
    (p) => typeof p.revenueQuarterYoY === "number" || typeof p.netProfitQuarterYoY === "number",
  )
  if (withYoY.length < 2) return null

  const W = 640
  const H = 160
  const PAD = 28
  const values = withYoY.flatMap((p) =>
    SERIES.map((s) => p[s.key]).filter((v): v is number => typeof v === "number"),
  )
  if (values.length === 0) return null
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0)
  const span = max - min || 1

  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(withYoY.length - 1, 1)
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD)
  const zeroY = y(0)

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">财务趋势（单季同比）</h2>
        <div className="flex gap-3 text-xs">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-zinc-500">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: s.stroke }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-0.5 text-xs text-zinc-400">
        由累计报表差分所得（与指标层同一算法），仅描述历史，不含预测。
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 w-full"
        role="img"
        aria-label="单季同比趋势折线图"
      >
        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke="#e4e4e7" strokeDasharray="4 4" />
        {SERIES.map((s) => {
          const pts = withYoY
            .map((p, i) => ({ v: p[s.key], i }))
            .filter((d): d is { v: number; i: number } => typeof d.v === "number")
            .map((d) => ({ x: x(d.i), y: y(d.v) }))
          if (pts.length < 2) return null
          return (
            <g key={s.key}>
              <path d={buildPath(pts)} fill="none" stroke={s.stroke} strokeWidth={2} />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={s.stroke} />
              ))}
            </g>
          )
        })}
        {withYoY.map((p, i) => (
          <text key={p.period} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-400" fontSize="10">
            {p.period.replace(/^\d{4}-/, "")}
          </text>
        ))}
      </svg>

      <details className="mt-2 text-xs text-zinc-500">
        <summary className="cursor-pointer select-none font-medium text-indigo-600 hover:text-indigo-700">
          查看数据表与口径
        </summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-zinc-400">
              <th className="py-1 font-normal">报告期</th>
              <th className="py-1 font-normal">单季营收同比（%）</th>
              <th className="py-1 font-normal">单季归母净利同比（%）</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {withYoY.map((p) => (
              <tr key={p.period} className="border-t border-zinc-100">
                <td className="py-1">{p.period}</td>
                <td className="py-1">
                  {typeof p.revenueQuarterYoY === "number" ? p.revenueQuarterYoY.toFixed(2) : "—"}
                </td>
                <td className="py-1">
                  {typeof p.netProfitQuarterYoY === "number" ? p.netProfitQuarterYoY.toFixed(2) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
