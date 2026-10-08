"use client"

import { WipeLink } from "@/components/v5/RouteWipe"

import type { InitPhaseFrame } from "@/lib/v5/init-stream"
import { RESEARCH_LIBRARY_HREF } from "@/lib/v5/routes"

const STEPS = [
  { title: "连接公司与行情数据", note: "确认公司身份、价格与财务数据口径" },
  { title: "校验研究证据", note: "整理可追溯的指标、事件与来源" },
  { title: "组织研究角度", note: "把证据放入画布，完成后自动进入" },
] as const

export default function InitialResearchLoading({
  stockCode,
  question,
  elapsedSec,
  serverPhase = null,
  reducedMotion,
  cancelled = false,
  onCancel,
  onRetry,
}: {
  stockCode: string
  question?: string | null
  elapsedSec: number
  /** P2-3：服务端真实阶段帧驱动进度；没到那个阶段绝不显示完成 */
  serverPhase?: InitPhaseFrame | null
  reducedMotion: boolean
  /** 用户主动中止后的确认态；此时不再显示进度，只提供重试与返回 */
  cancelled?: boolean
  onCancel?: () => void
  onRetry?: () => void
}) {
  // 无帧时步骤 0（连接数据）确实在进行中；complete 帧 step+1（step 2 complete = 全部完成）
  const active = serverPhase
    ? serverPhase.state === "complete"
      ? serverPhase.step + 1
      : serverPhase.step
    : 0

  return (
    <section
      data-initial-research-loading
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[105] overflow-hidden bg-[#F5F7FA] px-6 md:px-[8vw]"
    >
      {!reducedMotion && !cancelled && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-[36vh]"
          style={{
            background: "linear-gradient(180deg, rgba(47,102,255,0) 0%, rgba(47,102,255,0.05) 50%, rgba(47,102,255,0) 100%)",
            animation: "v5-scan 3.6s linear infinite",
          }}
        />
      )}

      {/* 研究库往返（DECISION.md §2026-10-07）：标签写"研究库"就必须回到研究库，不能落回首页 */}
      <WipeLink
        href={RESEARCH_LIBRARY_HREF}
        className="absolute left-6 top-6 flex min-h-11 items-center font-mono text-[11px] text-[#6D7480] transition hover:text-[#11151B] md:left-8 md:top-8"
      >
        ← 返回研究库
      </WipeLink>

      {/* 首次研究原本没有任何中止手段（切换公司有，这里没有）；补齐后接口卡住时用户不再被困 */}
      {!cancelled && onCancel && (
        <button
          type="button"
          data-init-cancel
          onClick={onCancel}
          className="absolute right-6 top-6 flex min-h-11 items-center border border-black/10 bg-white/70 px-3 font-mono text-[10.5px] text-[#6D7480] transition hover:border-black/25 hover:text-[#11151B] md:right-8 md:top-8"
        >
          中止等待
        </button>
      )}

      <div className="relative mx-auto flex h-full w-full max-w-[920px] flex-col justify-center pb-8 pt-20">
        {cancelled ? (
          <>
            <div className="font-mono text-[11px] tracking-[0.22em] text-[#6D7480]">RESEARCH PAUSED</div>
            <h1 className="mt-4 text-[30px] leading-tight tracking-[-0.03em] text-[#11151B] md:text-[44px]">
              已中止这次研究准备
            </h1>
            <p className="mt-3 max-w-[680px] text-[12.5px] leading-6 text-[#6D7480]">
              中止不会留下任何研究数据。通常是数据源临时不可用，重新开始一般即可恢复。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {onRetry && (
                <button
                  type="button"
                  data-init-retry
                  onClick={onRetry}
                  className="flex min-h-11 items-center rounded-full bg-[#11151B] px-5 text-[12.5px] text-white transition hover:bg-[#2F66FF]"
                >
                  重新开始 →
                </button>
              )}
              <WipeLink
                href={RESEARCH_LIBRARY_HREF}
                className="flex min-h-11 items-center border border-black/10 bg-white/70 px-4 font-mono text-[11px] text-[#11151B] transition hover:border-black/25"
              >
                ← 返回研究库
              </WipeLink>
            </div>
          </>
        ) : (
          <>
            <div className="font-mono text-[11px] tracking-[0.22em] text-[#2F66FF]">PREPARING RESEARCH SPACE</div>
            <h1 className="mt-4 text-[30px] leading-tight tracking-[-0.03em] text-[#11151B] md:text-[48px]">
              正在准备你的研究空间
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-[#6D7480]">
              <span>{stockCode || "公司数据"}</span>
              <span>已等待 {String(elapsedSec).padStart(2, "0")} 秒</span>
              {elapsedSec > 30 && elapsedSec <= 90 && <span>数据核验比平时稍久，完成后仍会自动进入。</span>}
              {elapsedSec > 90 && <span>等待已明显超过预期，你可以继续等，或中止后重新开始。</span>}
            </div>

            {question && (
              <div className="mt-6 max-w-[720px] border-l border-[#2F66FF] pl-4 text-[13px] leading-6 text-[#6D7480]">
                本次从“{question}”开始组织研究
              </div>
            )}

            <div className="mt-10 grid gap-0 border-y border-black/10 md:grid-cols-3">
              {STEPS.map((step, index) => {
                const complete = index < active
                const current = index === active
                return (
                  <div
                    key={step.title}
                    data-loading-step={current ? "active" : complete ? "complete" : "waiting"}
                    className="relative border-b border-black/10 py-5 last:border-b-0 md:border-b-0 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[9px]"
                        style={{
                          borderColor: current || complete ? "#2F66FF" : "rgba(17,21,27,0.16)",
                          background: complete ? "#2F66FF" : "transparent",
                          color: complete ? "#fff" : current ? "#2F66FF" : "#8B919B",
                        }}
                      >
                        {complete ? "✓" : String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[13px]" style={{ color: current ? "#11151B" : "#6D7480" }}>
                        {step.title}
                      </span>
                    </div>
                    <p className="mt-2 pl-9 text-[11px] leading-5 text-[#8B919B]">{step.note}</p>
                    {current && !reducedMotion && (
                      <span className="absolute bottom-0 left-0 h-px w-full overflow-hidden bg-black/5">
                        <span className="block h-full w-1/3 bg-[#2F66FF]" style={{ animation: "v5-placeholder 1.8s ease-in-out infinite" }} />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <p className="mt-6 max-w-[680px] text-[11px] leading-5 text-[#6D7480]">
              数字与结论会保留来源和时间口径；AI 负责整理与解释，不会在后台自动改动你的研究空间。
            </p>
          </>
        )}
      </div>
    </section>
  )
}
