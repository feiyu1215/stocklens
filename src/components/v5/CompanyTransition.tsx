"use client"

const C = {
  bg: "#F5F7FA",
  ink: "#11151B",
  secondary: "#6D7480",
  blue: "#2F66FF",
  coral: "#D9534F",
  hair: "rgba(17,21,27,0.12)",
} as const

interface Props {
  target: { name: string; stockCode: string; industry?: string }
  /** §21：Refresh 与 Company 的文案必须区分 */
  mode: "company" | "refresh"
  phase: "resolving" | "failed"
  /** 真实已等待秒数（Date.now() - requestStart），不是预测 */
  elapsedSec: number
  error?: string | null
  notice?: string | null
  reducedMotion: boolean
  /** 上一家公司名（取消/返回按钮文案用真实名称，不用猜测） */
  previousName?: string
  exiting?: boolean
  onCancel: () => void
  onRetry: () => void
}

/** Task 16.1A：长时间 Company Context Switch 的 Full-Screen Research Transition。
 *  它本身就是当前页面状态（fixed inset-0，z-index 100+），不是浮层卡片。
 *  只表达"系统在工作、研究空间尚未就绪"，不表达任何未返回的金融语义。 */
export default function CompanyTransition({ target, mode, phase, elapsedSec, error, notice, reducedMotion, previousName, exiting, onCancel, onRetry }: Props) {
  const slow = elapsedSec > 30
  const title = mode === "refresh" ? `正在刷新${target.name}的研究空间` : `正在构建${target.name}的研究空间`
  const meta = mode === "refresh" ? "REFRESHING RESEARCH SPACE" : "BUILDING RESEARCH SPACE"

  return (
    <div
      data-company-transition
      data-transition-phase={phase}
      className="fixed inset-0 z-[110] overflow-hidden"
      style={{
        background: exiting ? "rgba(245,247,250,0)" : "rgba(245,247,250,0.975)",
        backdropFilter: reducedMotion ? "none" : "blur(3px)",
        animation: exiting ? "v5-transition-out 320ms cubic-bezier(0.22,1,0.36,1) forwards" : "v5-transition-in 260ms ease-out",
      }}
    >
      {/* 唯一的 resolving 视觉：缓慢横扫的扫描线（确定性、无随机粒子） */}
      {!reducedMotion && phase === "resolving" && !exiting && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-[38vh]"
          style={{
            background: "linear-gradient(180deg, rgba(47,102,255,0) 0%, rgba(47,102,255,0.055) 50%, rgba(47,102,255,0) 100%)",
            animation: "v5-scan 3.6s linear infinite",
          }}
        />
      )}

      {/* 左上：始终可用的返回（hit area ≥ 40px） */}
      <button
        type="button"
        data-transition-cancel
        onClick={onCancel}
        className="absolute left-8 top-8 flex items-center gap-2 font-mono text-[12px] transition hover:opacity-70"
        style={{ color: C.ink, minHeight: 44, minWidth: 170, paddingLeft: 2, cursor: "pointer" }}
      >
        ← 返回{previousName ?? "上一家公司"}
      </button>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-center px-[8vw]">
        {/* 目标公司身份：立即可用（来自搜索元数据，不等 init） */}
        <div className="text-[54px] leading-[1.05] tracking-tight" style={{ color: C.ink }}>
          {target.name}
        </div>
        <div className="mt-3 font-mono text-[13px] tracking-[0.22em]" style={{ color: C.secondary }}>
          {target.stockCode}
          {target.industry ? ` · ${target.industry}` : ""}
        </div>

        <div className="mt-10 h-px w-full" style={{ background: C.hair, opacity: exiting ? 0 : 1, transition: "opacity 220ms ease" }} />

        {/* 主信息 + 真实时间信息 */}
        <div className="mt-8 flex flex-wrap items-baseline gap-x-6 gap-y-2" style={{ opacity: exiting ? 0 : 1, transition: "opacity 220ms ease" }}>
          <span className="text-[17px]" style={{ color: C.ink }}>
            {phase === "failed" ? `${target.name} 研究空间暂时无法完成` : title}
          </span>
          <span className="font-mono text-[11px] tracking-[0.2em]" style={{ color: C.blue }}>
            {meta}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[11px]" style={{ color: C.secondary, opacity: exiting ? 0 : 1, transition: "opacity 220ms ease" }}>
          <span data-transition-eta>{mode === "refresh" ? "通常约需 15–30 秒" : "通常约需 15–30 秒"}</span>
          <span data-transition-elapsed>已等待 {String(elapsedSec).padStart(2, "0")} 秒</span>
          {slow && <span data-transition-slow>这次比通常稍久。你可以继续等待，或返回上一家公司。</span>}
        </div>
        {notice && (
          <div data-transition-notice className="mt-3 font-mono text-[11px]" style={{ color: C.secondary }}>
            {notice}
          </div>
        )}
        {phase === "failed" && (
          <div className="pointer-events-auto mt-6 flex items-center gap-5">
            <span className="text-[13px]" style={{ color: C.coral }}>
              {error ?? "研究空间暂时无法完成"}
            </span>
            <button
              type="button"
              data-transition-retry
              onClick={onRetry}
              className="font-mono text-[12px]"
              style={{ color: C.blue, minHeight: 40, cursor: "pointer" }}
            >
              Retry
            </button>
            <button
              type="button"
              data-transition-back
              onClick={onCancel}
              className="font-mono text-[12px]"
              style={{ color: C.secondary, minHeight: 40, cursor: "pointer" }}
            >
              返回上一家公司
            </button>
          </div>
        )}

        {/* 中性占位：只表达"研究角度尚未解析"，不含任何金融语义 */}
        {phase === "resolving" && !exiting && (
          <div className="mt-14 max-w-[720px] space-y-5" data-placeholder-set>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                data-placeholder
                className="flex items-center gap-4"
                style={{ animation: reducedMotion ? "none" : `v5-placeholder 2.6s ease-in-out ${i * 0.2}s infinite` }}
              >
                <span className="font-mono text-[10px]" style={{ color: C.secondary }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="block h-px flex-1" style={{ background: "rgba(17,21,27,0.16)" }} />
                <span className="font-mono text-[10px]" style={{ color: C.secondary }}>
                  research angle resolving
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
