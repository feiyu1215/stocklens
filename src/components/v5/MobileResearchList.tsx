"use client"


import type { ResearchSpacePayload } from "@/components/observatory/theme"
import MarketTrendStrip from "@/components/v5/MarketTrendStrip"
import { WipeLink } from "@/components/v5/RouteWipe"
import { RESEARCH_LIBRARY_HREF } from "@/lib/v5/routes"

export default function MobileResearchList({
  payload,
  isRecordedSample,
  onOpenDimension,
}: {
  payload: ResearchSpacePayload
  isRecordedSample: boolean
  onOpenDimension: (dimensionId: string) => void
}) {
  return (
    <section
      data-mobile-research-list
      className="absolute inset-0 z-[80] overflow-y-auto bg-[#F5F7FA] px-5 pb-20 pt-6 md:hidden"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.28em] text-[#11151B]">STOCKLENS</span>
        {/* 与桌面端「▦ 研究库」同一目的地，保证研究库往返闭合 */}
        <WipeLink href={RESEARCH_LIBRARY_HREF} className="relative text-[11px] text-[#6D7480] after:absolute after:-inset-y-3 after:-inset-x-2 after:content-['']">← 研究库</WipeLink>
        {isRecordedSample && (
          <span className="border border-black/10 px-2 py-1 font-mono text-[8px] tracking-[0.1em] text-[#6D7480]">
            录制示例 · 2026-09-30
          </span>
        )}
      </div>
      <div className="mt-12 font-mono text-[10px] tracking-[0.2em] text-[#6D7480]">
        {payload.company.stockCode} · MOBILE READING
      </div>
      <h1 className="mt-2 text-[34px] font-semibold leading-tight tracking-[-0.02em] text-[#11151B]">
        {payload.company.stockName}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[#6D7480]">
        {payload.company.industryName ?? "行业信息暂缺"} · {payload.dimensions.length} 个研究维度
      </p>

      <MarketTrendStrip history={payload.marketHistory} />

      <ol className="mt-8 divide-y divide-black/10 border-y border-black/10">
        {payload.dimensions.map((dimension, index) => {
          const claim = payload.claims.find(
            (item) => item.dimensionId === dimension.dimensionId && item.type !== "unknown",
          )
          return (
            <li key={dimension.dimensionId}>
              <button
                type="button"
                onClick={() => onOpenDimension(dimension.dimensionId)}
                className="w-full py-5 text-left"
                style={{ minHeight: 96 }}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-mono text-[10px] tracking-[0.18em] text-[#6D7480]">
                    {String(index + 1).padStart(2, "0")} · {dimension.status.toUpperCase()}
                  </span>
                  <span className="font-mono text-[10px] text-[#6D7480]">
                    {dimension.evidenceIds.length} EVIDENCE
                  </span>
                </div>
                <div className="mt-2 text-[21px] font-medium leading-snug text-[#11151B]">
                  {dimension.label}
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[#6D7480]">
                  {claim?.text ?? dimension.researchQuestion}
                </p>
                <div className="mt-3 font-mono text-[10px] tracking-[0.14em] text-[#2F66FF]">
                  阅读结论与证据 →
                </div>
              </button>
            </li>
          )
        })}
      </ol>

      <p className="mt-6 text-[11px] leading-relaxed text-[#6D7480]">
        结论分为事实、分析推断与暂时无法验证的信息；StockLens 不提供买卖建议。
      </p>
    </section>
  )
}
