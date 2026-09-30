"use client"

import { useEffect, useRef, useState } from "react"

import { easeInOut } from "@/lib/world/terrain-coverage"
import type { WorldRenderer } from "./renderers/types"
import type { RegionMorphSource } from "./ResearchWorkspace"

// Semantic Morph 承载（Task 15.1 §28–§43）：
// 动画时钟在 app 层（rAF），视觉映射在 renderer（renderMorphOverlay）——
// terrain 提供边界 + label 双连续的 morph；未声明该能力的 renderer 退化为简单过渡。
// prefers-reduced-motion（§73）：跳过中间动画，直接落位（状态变化仍清晰）。

export interface MorphSurfaceProps {
  phase: "expanding" | "settled" | "collapsing"
  source: RegionMorphSource
  target: { x: number; y: number; width: number; height: number }
  durationMs: number
  renderer: WorldRenderer
  tokens: WorldRenderer["tokens"]
  /** expanding→settled / collapsing→(phase 结束) 时回调 */
  onSettled: () => void
  /** 进度上报（仅 debug 面板消费；ref 写入，不触发 app 重渲染） */
  onProgress?: (progress: number, phase: string) => void
  children: React.ReactNode
}

export function MorphSurface({
  phase,
  source,
  target,
  durationMs,
  renderer,
  tokens,
  onSettled,
  onProgress,
  children,
}: MorphSurfaceProps) {
  const [rawProgress, setRawProgress] = useState(phase === "collapsing" ? 1 : 0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }, [])

  // settled / reduced-motion / 无时长：不跑时钟，进度由 phase 直接推导（render 期，无 setState）
  const settledProgress = phase === "settled" ? 1 : phase === "collapsing" ? 1 : 0
  const progress = phase === "expanding" || phase === "collapsing" ? rawProgress : settledProgress

  useEffect(() => {
    if (phase === "settled") {
      onProgress?.(1, phase)
      return
    }
    if (reducedMotionRef.current || durationMs <= 0) {
      onProgress?.(phase === "collapsing" ? 0 : 1, phase)
      const t = window.setTimeout(onSettled, 30)
      return () => window.clearTimeout(t)
    }
    startRef.current = null
    const from = phase === "collapsing" ? 1 : 0
    const to = phase === "collapsing" ? 0 : 1
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const raw = Math.min((now - startRef.current) / durationMs, 1)
      const value = from + (to - from) * easeInOut(raw)
      setRawProgress(value)
      onProgress?.(value, phase)
      if (raw < 1) {
        rafRef.current = window.requestAnimationFrame(tick)
      } else {
        onSettled()
      }
    }
    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
    }
    // onSettled/onProgress 由父组件 useCallback 保证稳定；phase/duration 变化才重启时钟
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, durationMs])

  if (renderer.renderMorphOverlay) {
    return (
      <>
        {renderer.renderMorphOverlay({
          phase,
          progress,
          source: {
            dimensionId: source.dimensionId,
            label: source.label,
            cx: source.cx,
            cy: source.cy,
            radius: source.radius,
            seed: source.seed,
          },
          target,
          tokens,
          children,
        })}
      </>
    )
  }

  // 无 morph 能力的 renderer：轻量过渡（不伪装 semantic morph）
  const t = easeInOut(progress)
  const opacity = phase === "settled" ? 1 : phase === "collapsing" ? Math.max(0, 1 - t) : t
  return (
    <div className="absolute inset-0 z-20" style={{ background: tokens.background, opacity }}>
      <div className="h-full w-full">{children}</div>
    </div>
  )
}
