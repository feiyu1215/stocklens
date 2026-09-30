"use client"

import type { DemoStep } from "@/lib/v5/demo"

const C = {
  ink: "#11151B",
  secondary: "#6D7480",
  blue: "#2F66FF",
  hair: "rgba(17,21,27,0.12)",
} as const

interface Props {
  step: DemoStep
  index: number
  total: number
  paused: boolean
  reducedMotion: boolean
  onTogglePause: () => void
  onSkip: () => void
  onExit: () => void
}

/** Task 16 PART C：Guided Demo 的视觉层——轻量虚拟指针 + 单步字幕 + 控件。
 *  不承担任何业务逻辑：所有动作由 DemoController 调用既有 UI action 完成（§22）。 */
export default function DemoOverlay({ step, index, total, paused, reducedMotion, onTogglePause, onSkip, onExit }: Props) {
  const px = `${(step.pointer.x * 100).toFixed(2)}%`
  const py = `${(step.pointer.y * 100).toFixed(2)}%`
  const tx = step.trail ? `${(step.trail.x * 100).toFixed(2)}%` : px
  const ty = step.trail ? `${(step.trail.y * 100).toFixed(2)}%` : py

  return (
    <div data-demo-overlay className="pointer-events-none absolute inset-0 z-[80]">
      {/* 虚拟指针：一个很小的圆点 + 可选轨迹（§29） */}
      <div
        data-demo-pointer
        className="absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: px,
          top: py,
          border: `1.5px solid ${C.blue}`,
          background: "rgba(47,102,255,0.18)",
          boxShadow: "0 0 0 7px rgba(47,102,255,0.08)",
          transition: reducedMotion ? "none" : "left 900ms cubic-bezier(0.22,1,0.36,1), top 900ms cubic-bezier(0.22,1,0.36,1)",
        }}
      />
      {!reducedMotion && step.trail && (
        <svg aria-hidden className="absolute inset-0 h-full w-full">
          <line
            x1={tx}
            y1={ty}
            x2={px}
            y2={py}
            stroke={C.blue}
            strokeWidth={1}
            strokeDasharray="3 5"
            opacity={0.35}
          />
        </svg>
      )}

      {/* 字幕：1 标题 + 1 句话（§30） */}
      <div
        className="absolute left-1/2 max-w-[620px] -translate-x-1/2"
        style={{ bottom: 176 }}
      >
        <div
          data-demo-caption
          className="border px-5 py-3 backdrop-blur"
          style={{ borderColor: C.hair, background: "rgba(255,255,255,0.95)", boxShadow: "0 10px 40px rgba(17,21,27,0.10)" }}
        >
          <div className="font-mono text-[10.5px] tracking-[0.2em]" style={{ color: C.blue }}>
            {step.title.toUpperCase()}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.ink }}>
            {step.caption}
          </p>
        </div>
      </div>

      {/* 控件：始终可见 1/8 · Pause/Skip/Exit（§31） */}
      <div
        data-demo-controls
        className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-3 border px-3 py-2 backdrop-blur"
        style={{ bottom: 128, borderColor: C.hair, background: "rgba(255,255,255,0.95)" }}
      >
        <span data-demo-progress className="font-mono text-[10.5px]" style={{ color: C.secondary }}>
          {index + 1} / {total}
        </span>
        <span className="h-3 w-px" style={{ background: C.hair }} />
        <button
          type="button"
          data-demo-pause
          onClick={onTogglePause}
          className="font-mono text-[10.5px]"
          style={{ color: C.ink, minHeight: 28, minWidth: 58, cursor: "pointer" }}
        >
          {paused ? "▶ Resume" : "❚❚ Pause"}
        </button>
        <button
          type="button"
          data-demo-skip
          onClick={onSkip}
          className="font-mono text-[10.5px]"
          style={{ color: C.ink, minHeight: 28, minWidth: 44, cursor: "pointer" }}
        >
          Next →
        </button>
        <button
          type="button"
          data-demo-exit
          onClick={onExit}
          className="font-mono text-[10.5px]"
          style={{ color: C.secondary, minHeight: 28, minWidth: 40, cursor: "pointer" }}
        >
          Exit ×
        </button>
        {paused && (
          <span data-demo-paused className="font-mono text-[10.5px]" style={{ color: C.secondary }}>
            演示已暂停
          </span>
        )}
      </div>
    </div>
  )
}
