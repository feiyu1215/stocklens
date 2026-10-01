"use client"

import { DEMO_FINAL_FRAME, type DemoScene } from "@/lib/v5/demo"

const C = {
  ink: "#11151B",
  secondary: "#6D7480",
  blue: "#2F66FF",
  hair: "rgba(17,21,27,0.12)",
} as const

interface Props {
  scene: DemoScene
  index: number
  total: number
  /** 场景内的当前字幕（由控制器调度，位置固定不变） */
  caption: { title: string; text: string }
  paused: boolean
  final: boolean
  reducedMotion: boolean
  onTogglePause: () => void
  onSkip: () => void
  onExit: () => void
}

/** Task 16.1 §27/§28：字幕与控件固定在左下同一处；指针是唯一移动的演示元素。 */
export default function DemoOverlay({ scene, index, total, caption, paused, final, reducedMotion, onTogglePause, onSkip, onExit }: Props) {
  const px = `${(scene.pointer.x * 100).toFixed(2)}%`
  const py = `${(scene.pointer.y * 100).toFixed(2)}%`

  return (
    <div data-demo-overlay className="pointer-events-none absolute inset-0 z-[80]">
      {!final && (
        <div
          data-demo-pointer
          className="absolute h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: px,
            top: py,
            border: `1.5px solid ${C.blue}`,
            background: "rgba(47,102,255,0.16)",
            boxShadow: "0 0 0 6px rgba(47,102,255,0.07)",
            transition: reducedMotion ? "none" : "left 500ms cubic-bezier(0.22,1,0.36,1), top 500ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      )}

      {/* 字幕：整场演示固定在同一处（左下安全区） */}
      <div className="absolute left-8 z-[81]" style={{ bottom: 120, width: 460 }}>
        {final ? (
          <div
            data-demo-final
            className="pointer-events-auto border px-6 py-5 backdrop-blur"
            style={{ borderColor: C.hair, background: "rgba(255,255,255,0.96)", boxShadow: "0 16px 48px rgba(17,21,27,0.12)" }}
          >
            <div className="text-[19px] leading-snug" style={{ color: C.ink }}>
              {DEMO_FINAL_FRAME.line1}
              <br />
              {DEMO_FINAL_FRAME.line2}
            </div>
            <button
              type="button"
              data-demo-finish
              onClick={onExit}
              className="mt-4 font-mono text-[12px] transition hover:opacity-75"
              style={{ color: C.blue, minHeight: 32, cursor: "pointer" }}
            >
              {DEMO_FINAL_FRAME.cta}
            </button>
          </div>
        ) : (
          <div
            data-demo-caption
            className="border px-5 py-3 backdrop-blur"
            style={{ borderColor: C.hair, background: "rgba(255,255,255,0.95)", boxShadow: "0 10px 36px rgba(17,21,27,0.10)" }}
          >
            <div className="font-mono text-[10.5px] tracking-[0.2em]" style={{ color: C.blue }}>
              {caption.title}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.ink }}>
              {caption.text}
            </p>
          </div>
        )}
      </div>

      {/* 控件：同样固定在左下，位于字幕下方 */}
      <div
        data-demo-controls
        className="pointer-events-auto absolute left-8 z-[81] flex items-center gap-3 border px-3 py-2 backdrop-blur"
        style={{ bottom: 64, borderColor: C.hair, background: "rgba(255,255,255,0.95)" }}
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
          style={{ color: C.ink, minHeight: 28, minWidth: 62, cursor: "pointer" }}
        >
          {paused ? "继续" : "暂停"}
        </button>
        <button
          type="button"
          data-demo-skip
          onClick={onSkip}
          className="font-mono text-[10.5px]"
          style={{ color: C.ink, minHeight: 28, minWidth: 40, cursor: "pointer" }}
        >
          下一步 →
        </button>
        <button
          type="button"
          data-demo-exit
          onClick={onExit}
          className="font-mono text-[10.5px]"
          style={{ color: C.secondary, minHeight: 28, minWidth: 36, cursor: "pointer" }}
        >
          退出
        </button>
        {paused && (
          <span data-demo-paused className="font-mono text-[10.5px]" style={{ color: C.secondary }}>
            演示已暂停 · 继续演示 / 退出并自行探索
          </span>
        )}
      </div>
    </div>
  )
}
