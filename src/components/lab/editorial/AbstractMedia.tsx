"use client"

import { useEffect, useRef } from "react"

import { paintEditorialMedia } from "@/lib/lab/editorial"

// Media 层（Task 15.2 editorial §13/§21）：一张自制抽象「航拍矿物勘探」视觉，
// 一次绘制到离屏 canvas（1.6× viewport），CSS transform 承担 pan / crop（镜头在 media 里移动）。
// 不建模、不逐帧渲染 —— HTML+CSS 达成参考效果（§1 优先简单方案）。

export default function AbstractMedia({
  transform,
  reading,
}: {
  transform: { x: number; y: number; scale: number }
  /** reading 态：媒体退为模糊背景（§31 continuity） */
  reading: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const w = Math.round(parent.clientWidth * 1.32)
    const h = Math.round(parent.clientHeight * 1.32)
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    paintEditorialMedia(ctx, w, h)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <canvas
        ref={canvasRef}
        data-media-canvas
        className="absolute left-0 top-0 origin-top-left will-change-transform"
        style={{
          width: "132%",
          height: "132%",
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          // reading 态不 blur 整幅 canvas（合成成本过高）：由压层与左侧条承担模糊背景
          transition: "transform 720ms cubic-bezier(0.22,1,0.36,1)",
        }}
      />
      {/* 颗粒/氛围压层：极轻，保持媒体主导 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: reading
            ? "linear-gradient(90deg, rgba(233,230,220,0.35) 0%, rgba(28,30,36,0.3) 30%, rgba(28,30,36,0.5) 100%)"
            : "linear-gradient(180deg, rgba(28,30,36,0.05) 0%, rgba(28,30,36,0.02) 46%, rgba(28,30,36,0.14) 100%)",
          transition: "background 720ms ease-out",
        }}
      />
    </div>
  )
}
