"use client"

import { useMemo, useState } from "react"

import type { MarketHistory } from "@/components/observatory/theme"
import { buildMarketChartModel, selectMarketRange, type MarketRange } from "@/lib/v5/market-history"

const RANGES: { value: MarketRange; label: string; title: string }[] = [
  { value: 20, label: "1M", title: "近 1 个月" },
  { value: 60, label: "3M", title: "近 3 个月" },
  { value: 120, label: "6M", title: "近 6 个月" },
  { value: "ytd", label: "YTD", title: "今年以来" },
  { value: "all", label: "ALL", title: "全部可用历史" },
]

function shortDate(date: string) {
  return date.slice(5).replace("-", "/")
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
}

export default function MarketTrendStrip({ history, compact = false }: { history?: MarketHistory; compact?: boolean }) {
  const [range, setRange] = useState<MarketRange>(120)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const points = useMemo(() => selectMarketRange(history?.points ?? [], range), [history, range])
  const model = useMemo(() => buildMarketChartModel(points), [points])

  if (!history || !model) return null

  const inspectedIndex = activeIndex ?? points.length - 1
  const inspected = points[inspectedIndex]
  const previous = points[Math.max(0, inspectedIndex - 1)]
  const dailyChange = inspectedIndex === 0 ? 0 : (inspected.close / previous.close - 1) * 100
  const displayedChange = activeIndex === null ? model.changePct : dailyChange
  const rising = displayedChange >= 0
  const coordinate = activeIndex === null ? null : model.coordinates[activeIndex]

  const inspectAtClientX = (clientX: number, left: number, width: number) => {
    const ratio = Math.max(0, Math.min(1, (clientX - left) / Math.max(width, 1)))
    setActiveIndex(Math.round(ratio * (points.length - 1)))
  }

  return (
    <section
      data-market-trend
      data-ui
      className={`${compact ? "mt-5 w-[282px]" : "mt-7 w-full"} pointer-events-auto border-y border-black/10 py-3`}
      onPointerDown={(event) => event.stopPropagation()}
      aria-label="历史股价趋势"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[8.5px] tracking-[0.18em] text-[#6D7480]">PRICE CONTEXT</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[18px] font-medium text-[#11151B]">¥{inspected.close.toFixed(2)}</span>
            <span className={`font-mono text-[10px] ${rising ? "text-[#2F66FF]" : "text-[#D9534F]"}`}>
              {signed(displayedChange)}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[8px] text-[#8B919B]">
            {activeIndex === null ? "区间涨跌" : `${inspected.date} · 当日涨跌`}
          </div>
        </div>
        <div className="flex items-center gap-0.5" aria-label="行情时间范围">
          {RANGES.map((item) => (
            <button
              key={String(item.value)}
              type="button"
              title={item.title}
              aria-pressed={range === item.value}
              data-market-range={item.value}
              onClick={() => {
                setRange(item.value)
                setActiveIndex(null)
              }}
              className="relative min-h-7 px-1.5 py-1 font-mono text-[8px] tracking-[0.05em] transition after:absolute after:-inset-x-px after:-inset-y-1 after:content-['']"
              style={{ color: range === item.value ? "#11151B" : "#8B919B", borderBottom: range === item.value ? "1px solid #11151B" : "1px solid transparent" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-2" data-market-chart>
        <svg
          viewBox="0 0 282 86"
          className={`${compact ? "h-[76px]" : "h-[104px]"} w-full touch-none overflow-visible outline-none`}
          role="graphics-document"
          tabIndex={0}
          aria-label={`${model.firstDate} 至 ${model.latestDate}的前复权收盘价趋势。使用左右方向键逐日查看。`}
          preserveAspectRatio="none"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            inspectAtClientX(event.clientX, rect.left, rect.width)
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setActiveIndex(null)
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setActiveIndex(null)
              return
            }
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
            event.preventDefault()
            const current = activeIndex ?? points.length - 1
            setActiveIndex(Math.max(0, Math.min(points.length - 1, current + (event.key === "ArrowLeft" ? -1 : 1))))
          }}
        >
          <line x1="5" y1="24" x2="277" y2="24" stroke="rgba(17,21,27,0.055)" strokeDasharray="2 5" />
          <line x1="5" y1="62" x2="277" y2="62" stroke="rgba(17,21,27,0.055)" strokeDasharray="2 5" />
          <path d={model.areaPath} fill={model.changePct >= 0 ? "rgba(47,102,255,0.07)" : "rgba(217,83,79,0.06)"} />
          <path d={model.path} fill="none" stroke={model.changePct >= 0 ? "#2F66FF" : "#D9534F"} strokeWidth="1.65" vectorEffect="non-scaling-stroke" />
          {coordinate && (
            <g data-market-crosshair aria-hidden>
              <line x1={coordinate.x} y1="3" x2={coordinate.x} y2="86" stroke="rgba(17,21,27,0.28)" strokeWidth="0.8" strokeDasharray="2 2" />
              <circle cx={coordinate.x} cy={coordinate.y} r="3.2" fill="#F5F7FA" stroke={rising ? "#2F66FF" : "#D9534F"} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
            </g>
          )}
        </svg>
        {coordinate && (
          <div
            data-market-tooltip
            className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-sm border border-black/10 bg-white/95 px-2 py-1 font-mono text-[8px] shadow-[0_4px_14px_rgba(17,21,27,0.08)]"
            style={{ left: `${(coordinate.x / 282) * 100}%`, transform: coordinate.x > 190 ? "translateX(-100%)" : coordinate.x < 92 ? "translateX(0)" : "translateX(-50%)", color: "#11151B" }}
          >
            {shortDate(inspected.date)} · ¥{inspected.close.toFixed(2)} · {signed(dailyChange)}
          </div>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between font-mono text-[8px] tracking-[0.05em] text-[#8B919B]">
        <span>{shortDate(model.firstDate)}</span>
        <span>高 {model.max.toFixed(2)} · 低 {model.min.toFixed(2)}</span>
        <span>{shortDate(model.latestDate)}</span>
      </div>
      <div className="mt-1 text-center font-mono text-[7.5px] tracking-[0.06em] text-[#A0A5AD]">
        前复权 · {model.pointCount} 交易日 · 扶摇 · 指向曲线查看日价
      </div>
    </section>
  )
}
