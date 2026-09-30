"use client"

import { useEffect, useRef } from "react"

import { FocusView } from "@/components/observatory/FocusView"
import type { ResearchSpacePayload } from "@/components/observatory/theme"
import { paintEditorialMedia } from "@/lib/lab/editorial"
import type { ResearchDimension } from "@/lib/research/dimension-schema"

// Reading entry（Task 15.2 editorial §27–§31）：
// Reading Surface（Claim Spine / Evidence Rail）保留既有实现；
// 本层负责 World → Reading 的 media crop 连接：media 退为左侧模糊条 + shared title（FLIP）。

/** 左侧 media strip：同一 paint 函数的小幅静态版本 + CSS 静态 blur（§31，零逐帧合成成本） */
function StripMedia() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = 240
    c.height = 1024
    const ctx = c.getContext("2d")
    if (!ctx) return
    paintEditorialMedia(ctx, c.width, c.height, 20261001)
  }, [])
  return (
    <canvas
      ref={ref}
      className="absolute left-0 top-0 h-full w-full"
      style={{ filter: "blur(9px) brightness(1.02) saturate(0.9)", transform: "scale(1.2)" }}
    />
  )
}

export default function EditorialReading({
  space,
  dimension,
  flipFromRect,
  onBack,
}: {
  space: ResearchSpacePayload
  dimension: ResearchDimension
  /** world 中 annotation 标题的矩形（shared element 起点，§30） */
  flipFromRect: { x: number; y: number; width: number; height: number } | null
  onBack: () => void
}) {
  const titleRef = useRef<HTMLDivElement>(null)

  // Shared element：标题从 annotation 位置 FLIP 到 reading header（§30）
  useEffect(() => {
    const el = titleRef.current
    if (!el || !flipFromRect) return
    const to = el.getBoundingClientRect()
    const dx = flipFromRect.x - to.x
    const dy = flipFromRect.y - to.y
    const sx = Math.max(flipFromRect.width / Math.max(to.width, 1), 0.2)
    const sy = Math.max(flipFromRect.height / Math.max(to.height, 1), 0.2)
    el.style.transformOrigin = "top left"
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
    el.style.opacity = "0.9"
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "transform 680ms cubic-bezier(0.22,1,0.36,1), opacity 480ms ease-out"
        el.style.transform = "translate(0, 0) scale(1, 1)"
        el.style.opacity = "1"
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [flipFromRect])

  return (
    <div className="absolute inset-0 z-50 flex">
      {/* §31：media strip —— 一次性绘制的小幅 media（静态模糊，零逐帧合成成本） */}
      <div className="relative w-[8%] shrink-0 overflow-hidden" aria-hidden>
        <StripMedia />
        <div className="absolute inset-0" style={{ background: "rgba(236,233,224,0.18)" }} />
        <div className="absolute inset-y-0 right-0 w-px bg-white/25" />
      </div>
      <div
        className="relative flex-1 overflow-hidden"
        style={{
          background: "rgba(243,240,232,0.97)",
          boxShadow: "-24px 0 80px rgba(20,22,28,0.25)",
          animation: "editorial-reading-in 680ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Reading header（shared title 落点） */}
        <div className="absolute left-10 top-7 z-10">
          <div className="font-mono text-[9.5px] tracking-[0.26em] text-[#8A8E97]">
            {space.company.stockCode} · READING
          </div>
          <div
            ref={titleRef}
            className="mt-1 text-[30px] font-medium leading-tight tracking-tight text-[#14161B]"
            style={{ wordBreak: "keep-all" }}
          >
            {dimension.label}
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="absolute bottom-8 left-10 z-20 whitespace-nowrap font-mono text-[10.5px] text-[#676A70] transition hover:text-[#14161B] focus:outline-none"
        >
          ← Back to world
        </button>
        <div className="h-full pt-24">
          <FocusView
            space={space}
            dimension={dimension}
            metrics={space.metrics}
            embedded
            hideBackLink
            onBack={onBack}
          />
        </div>
      </div>
      <style jsx global>{`
        @keyframes editorial-reading-in {
          from { transform: translateX(4.5%); opacity: 0.6; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
