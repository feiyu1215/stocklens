"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"

import { applyConflict, composeLandscape, type LandscapeModel } from "@/lib/lab/landscape"
import type { ProjectionEntry } from "./LandscapeScene"

// UI LAYER（Task 15.2 §8）：全部中文/数字/标签在 React DOM；
// WORLD LAYER（Canvas）dynamic ssr:false。
// 交互（§35 只做 4 个）：drag pan / 轻 parallax / hover dimension / hover evidence。

const LandscapeScene = dynamic(() => import("./LandscapeScene"), {
  ssr: false,
  loading: () => null,
})

interface FixtureDimension {
  dimensionId: string
  label: string
  status: "ready" | "partial" | "unknown"
  priority: number
  evidenceIds: string[]
}

interface FixturePayload {
  company: { stockCode: string; stockName: string; industryName?: string }
  dimensions: FixtureDimension[]
  claims: { dimensionId: string; signal: string }[]
  suggestions: { label: string }[]
}

const INDUSTRY_EN: Record<string, string> = {
  白色家电: "WHITE GOODS",
}

export default function LandscapeLab() {
  const [model, setModel] = useState<LandscapeModel | null>(null)
  const [company, setCompany] = useState<FixturePayload["company"] | null>(null)
  const [failed, setFailed] = useState(false)
  const [webglOk, setWebglOk] = useState(true)
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)
  const [hoveredEvidence, setHoveredEvidence] = useState<string | null>(null)
  const [lightingKey, setLightingKey] = useState<string | null>(null)
  const [perfOn, setPerfOn] = useState(false)
  const [labelList, setLabelList] = useState<ProjectionEntry[]>([])
  const [perfView, setPerfView] = useState({ fps: 0, calls: 0, tris: 0 })
  const [viewport, setViewport] = useState({ width: 1440, height: 900 })

  const containerRef = useRef<HTMLDivElement>(null)
  const panRef = useRef({ x: 0, z: 0 })
  const pointerRef = useRef({ x: 0, y: 0 })
  const perfRef = useRef({ fps: 0, calls: 0, tris: 0 })
  const projectionsRef = useRef<ProjectionEntry[]>([])
  const dragRef = useRef<{ lastX: number; lastY: number } | null>(null)
  const fixtureNameRef = useRef("midea-artdirection")
  const coordsRef = useRef<HTMLSpanElement>(null)

  // fixture + query 参数（?lighting=dusk / ?perf=1）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve() // 异步边界：避免 effect 内同步 setState
      if (cancelled) return
      const params = new URLSearchParams(window.location.search)
      setLightingKey(params.get("lighting"))
      setPerfOn(params.get("perf") === "1")
      fixtureNameRef.current = params.get("fixture") ?? "midea-artdirection"
      try {
        const canvas = document.createElement("canvas")
        setWebglOk(Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl")))
      } catch {
        setWebglOk(false)
      }
    })()
    void (async () => {
      await Promise.resolve()
      try {
        const res = await fetch(`/api/observatory/fixture?name=${fixtureNameRef.current}`)
        if (!res.ok) throw new Error("fixture unavailable")
        const payload = (await res.json()) as FixturePayload
        if (cancelled) return
        const conflicts = new Map<string, number>()
        for (const claim of payload.claims ?? []) {
          if (claim.signal === "conflict") {
            conflicts.set(claim.dimensionId, (conflicts.get(claim.dimensionId) ?? 0) + 1)
          }
        }
        const composed = applyConflict(
          composeLandscape({ dimensions: payload.dimensions, suggestions: payload.suggestions ?? [] }),
          conflicts,
        )
        setModel(composed)
        setCompany(payload.company)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 每秒一次 UI 刷新（labels / perf / viewport 进入 state；逐帧位置由 rAF 直接写 DOM）
  useEffect(() => {
    const timer = window.setInterval(() => {
      setLabelList([...projectionsRef.current])
      setPerfView({ ...perfRef.current })
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }, 900)
    return () => window.clearInterval(timer)
  }, [])

  // label / leader 位置：rAF 直接写 DOM（不触发 React 重渲染）
  useEffect(() => {
    if (!model) return
    let raf = 0
    // rAF 回调按帧读写 ref（DOM 直写，不触发 React 渲染）——静态分析无法区分，行为由浏览器验收覆盖
     
    const apply = () => {
      const width = window.innerWidth
      for (const p of projectionsRef.current) {
        const group = containerRef.current?.querySelector(`[data-label-id="${p.id}"]`)
        if (!(group instanceof HTMLElement)) continue
        const side = p.kind === "suggestion" ? 1 : p.side
        const elbowX = p.sx + side * 26
        const elbowY = p.sy - 26
        const textX = elbowX + side * 8
        const textY = elbowY - 8
        group.style.transform = `translate(${side > 0 ? textX : textX - 168}px, ${textY - 26}px)`
        const svg = containerRef.current?.querySelector(`[data-leader-id="${p.id}"]`)
        if (svg instanceof SVGPolylineElement) {
          svg.setAttribute("points", `${p.sx},${p.sy} ${elbowX},${elbowY} ${elbowX + side * 4},${elbowY}`)
        }
        const dot = containerRef.current?.querySelector(`[data-dot-id="${p.id}"]`)
        if (dot instanceof SVGCircleElement) {
          dot.setAttribute("cx", String(p.sx))
          dot.setAttribute("cy", String(p.sy))
        }
        void width
      }
      if (coordsRef.current) {
        const pan = panRef.current
        coordsRef.current.textContent = `E ${(128.6 + pan.x * 1.4).toFixed(1)}  ·  N ${(32.4 - pan.z * 1.1).toFixed(1)}`
      }
      raf = window.requestAnimationFrame(apply)
    }
    raf = window.requestAnimationFrame(apply)
    return () => window.cancelAnimationFrame(raf)
  }, [model])

  // drag pan（§33 Unseen 式 drag-to-explore）+ parallax 指针（§34）
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { lastX: e.clientX, lastY: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const w = window.innerWidth
    const h = window.innerHeight
    pointerRef.current = { x: (e.clientX / w) * 2 - 1, y: (e.clientY / h) * 2 - 1 }
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.lastX
    const dy = e.clientY - drag.lastY
    drag.lastX = e.clientX
    drag.lastY = e.clientY
    // 拖拽事件期读写 ref——静态分析无法区分事件期与渲染期
     
    panRef.current = {
      x: Math.max(-7.5, Math.min(7.5, panRef.current.x - dx * 0.012)),
      z: Math.max(-4.5, Math.min(4.5, panRef.current.z - dy * 0.012)),
    }
  }, [])
  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const titleEn = "MIDEA GROUP"
  const industryEn = INDUSTRY_EN[company?.industryName ?? ""] ?? company?.industryName ?? ""

  return (
    <main
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${lightingKey === "dusk" ? "#E6D6B9" : "#EDEAE0"} 0%, ${
          lightingKey === "dusk" ? "#D8C7A6" : "#E4E0D3"
        } 100%)`,
        cursor: "grab",
        color: "#22242A",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* WORLD LAYER */}
      {model && webglOk && (
        <LandscapeScene
          model={model}
          shared={{ panRef, pointerRef, perfRef, projectionsRef }}
          hoveredZone={hoveredZone}
          onHoverZone={setHoveredZone}
          onHoverEvidence={setHoveredEvidence}
          lightingKey={lightingKey}
        />
      )}

      {/* Label leader 层（SVG，§28 thin leader + small anchor） */}
      {model && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-10 h-full w-full">
          {labelList.map((p) => (
            <g key={p.id} opacity={p.kind === "suggestion" ? 0.55 : 0.75}>
              <polyline
                data-leader-id={p.id}
                fill="none"
                stroke="#3A3D45"
                strokeWidth={1}
                opacity={0.5}
              />
              <circle data-dot-id={p.id} r={p.kind === "suggestion" ? 2 : 2.6} fill="#3A3D45" />
            </g>
          ))}
        </svg>
      )}

      {/* Dimension labels（§28–§29：DOM text-only，无卡片背景） */}
      {model && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {labelList.map((p) => {
            const active = p.kind === "zone" && hoveredZone === p.id
            return (
              <div
                key={p.id}
                data-label-id={p.id}
                className="absolute left-0 top-0 w-[168px]"
                style={{
                  opacity: active ? 1 : p.kind === "suggestion" ? 0.6 : 0.78,
                  transition: "opacity 260ms ease-out",
                }}
              >
                <div
                  className="text-[13.5px] leading-tight"
                  style={{
                    color: "#1E2026",
                    fontWeight: active ? 650 : 480,
                    letterSpacing: "0.02em",
                    wordBreak: "keep-all",
                  }}
                >
                  {p.label}
                </div>
                <div
                  className="mt-0.5 font-mono text-[9px] tracking-[0.18em]"
                  style={{ color: p.status === "UNKNOWN" ? "#8A6A33" : "#5A5E68" }}
                >
                  {p.kind === "suggestion" ? "UNEXPLORED" : `${p.index} · ${p.status}`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* HUD（San Rita 结构性借鉴：取景框刻度 + 角落元数据；§40 不抄品牌） */}
      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="absolute inset-x-4 inset-y-4 border border-[#3A3D45]/15" />
        {/* 边缘刻度 */}
        <svg aria-hidden className="absolute inset-0 h-full w-full">
          {Array.from({ length: 13 }, (_, i) => {
            const x = ((i + 1) * viewport.width) / 14
            return <line key={`t${i}`} x1={x} y1={16} x2={x} y2={i % 2 === 0 ? 26 : 21} stroke="#3A3D45" strokeOpacity={0.3} strokeWidth={1} />
          })}
          {Array.from({ length: 13 }, (_, i) => {
            const x = ((i + 1) * viewport.width) / 14
            return <line key={`b${i}`} x1={x} y1={viewport.height - 16} x2={x} y2={viewport.height - (i % 2 === 0 ? 26 : 21)} stroke="#3A3D45" strokeOpacity={0.3} strokeWidth={1} />
          })}
        </svg>

        <div className="absolute left-7 top-7 font-mono text-[10px] tracking-[0.24em] text-[#3A3D45]">
          STOCKLENS · LAB / ART DIRECTION
        </div>
        <div className="absolute right-7 top-7 text-right font-mono text-[10px] tracking-[0.14em] text-[#3A3D45]">
          <span ref={coordsRef}>E 128.6 · N 32.4</span>
        </div>
        {perfOn && (
          <div className="absolute right-7 top-16 text-right font-mono text-[10px] text-[#5A5E68]">
            FPS {perfView.fps} · CALLS {perfView.calls} · TRIS {Math.round(perfView.tris / 1000)}k
          </div>
        )}

        {/* Map / landscape title（§12：Company = 整个 world，名字只是 title） */}
        <div className="absolute bottom-9 left-8">
          <div
            className="text-[44px] font-light leading-none tracking-[0.06em]"
            style={{ color: "#1E2026", textShadow: "0 1px 14px rgba(238,235,226,0.85)" }}
          >
            {titleEn}
          </div>
          <div className="mt-2 font-mono text-[10.5px] tracking-[0.22em] text-[#5A5E68]">
            {company ? `${company.stockCode} · ${industryEn || company.industryName}` : "—"} · SCULPTURAL RESEARCH LANDSCAPE
          </div>
        </div>
        <div className="absolute bottom-9 right-8 text-right font-mono text-[10px] leading-relaxed tracking-[0.16em] text-[#5A5E68]">
          <div>EVIDENCE TERRAIN STUDY</div>
          <div className="opacity-70">?lighting=dusk · drag to explore</div>
        </div>

        {/* evidence hover 注释（§35 hover evidence） */}
        {hoveredEvidence && (
          <div className="absolute bottom-9 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.14em] text-[#3A3D45]">
            {hoveredEvidence}
          </div>
        )}
      </div>

      {(!webglOk || failed) && (
        <div className="absolute inset-0 z-40 flex items-center justify-center">
          <div className="max-w-[380px] text-center">
            <div className="text-[15px] text-[#1E2026]">
              {failed ? "Fixture 不可用" : "WebGL 不可用"}
            </div>
            <div className="mt-1 font-mono text-[10.5px] text-[#5A5E68]">
              {webglOk ? "返回 /observatory 使用正式视图" : "该浏览器回退 Pearl renderer（生产路径不变）"}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
