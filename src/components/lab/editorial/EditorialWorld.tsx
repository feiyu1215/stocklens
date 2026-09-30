"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { formatMetricValue } from "@/lib/presentation/formatters"
import type { MetricResult } from "@/lib/metrics/types"
import {
  composeAnnotations,
  mediaTransformFor,
  spotlightFor,
  tierStyle,
  type AnnotationSpec,
  type EditorialState,
} from "@/lib/lab/editorial"

// Editorial Research World（Task 15.2 editorial）：
// State A world → hover → B selected → C reading（§38）。
// Composition → Typography → Media → Interaction（§56）；世界 = media crop，无建模（§34）。

const AbstractMedia = dynamic(() => import("./AbstractMedia"), { ssr: false })
const EditorialReading = dynamic(() => import("./EditorialReading"), { ssr: false })

interface FixtureDimension {
  dimensionId: string
  label: string
  status: "ready" | "partial" | "unknown"
  priority: number
  evidenceIds: string[]
  missingInformation?: string[]
}

interface FixturePayload {
  company: { stockCode: string; stockName: string; industryName?: string }
  dimensions: FixtureDimension[]
  claims: { dimensionId: string; text: string; signal: string }[]
  evidence: { evidenceId: string; title: string; metricIds: string[] }[]
  metrics: MetricResult[]
  suggestions: { label: string }[]
}

const INDUSTRY_EN: Record<string, string> = { 白色家电: "WHITE GOODS" }

export default function EditorialWorld() {
  const [payload, setPayload] = useState<FixturePayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [state, setState] = useState<EditorialState>({ name: "world" })
  const [flipFromRect, setFlipFromRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [viewport, setViewport] = useState({ width: 1440, height: 900 })
  const containerRef = useRef<HTMLDivElement>(null)
  const panRef = useRef({ x: 0, y: 0 })
  const [panVersion, setPanVersion] = useState(0)
  const dragRef = useRef<{ lastX: number; lastY: number } | null>(null)
  const titleRectsRef = useRef(new Map<string, { x: number; y: number; width: number; height: number }>())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      try {
        const res = await fetch("/api/observatory/fixture?name=midea-artdirection")
        if (!res.ok) throw new Error()
        const data = (await res.json()) as FixturePayload
        if (!cancelled) setPayload(data)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const annotations = useMemo(() => {
    if (!payload) return []
    const conflicts = new Map<string, number>()
    for (const claim of payload.claims ?? []) {
      if (claim.signal === "conflict") conflicts.set(claim.dimensionId, (conflicts.get(claim.dimensionId) ?? 0) + 1)
    }
    return composeAnnotations(
      {
        dimensions: payload.dimensions,
        suggestions: payload.suggestions ?? [],
        company: payload.company,
      },
      conflicts,
    )
  }, [payload])

  const hoverAnnotation: AnnotationSpec | null =
    state.name === "hover" ? annotations.find((a) => a.id === state.id) ?? null : null
  const selectedId = state.name === "selected" || state.name === "reading" ? state.id : null
  const selectedAnnotation: AnnotationSpec | null =
    selectedId !== null ? annotations.find((a) => a.id === selectedId) ?? null : null

  // drag / pan visual field（§39）：world 态拖动 media。
  // pan 状态在指针事件期读写 ref（每帧更新、与渲染解耦）——静态分析无法区分事件期，行为由浏览器验收覆盖
  // eslint-disable-next-line react-hooks/refs -- direct manipulation 指针帧更新，见 docs/design-audit/task15-2-editorial
  const mediaTransform = mediaTransformFor(state, annotations, viewport, panRef.current)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (state.name !== "world") return
    dragRef.current = { lastX: e.clientX, lastY: e.clientY }
  }, [state.name])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    panRef.current = {
      x: Math.max(-70, Math.min(70, panRef.current.x + (e.clientX - drag.lastX) * 0.5)),
      y: Math.max(-60, Math.min(60, panRef.current.y + (e.clientY - drag.lastY) * 0.5)),
    }
    drag.lastX = e.clientX
    drag.lastY = e.clientY
    setPanVersion((n) => n + 1)
  }, [])
  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])
  void panVersion // pan 更新经 mediaTransformFor(panRef.current) 进入渲染

  // hover dim / click dim / explore / back（§39）
  const setHover = useCallback((ann: AnnotationSpec | null) => {
    setState((prev) => {
      if (prev.name === "reading") return prev
      if (prev.name === "selected") return prev
      return ann && (ann.kind === "dimension" || ann.kind === "unknown") ? { name: "hover", id: ann.id } : { name: "world" }
    })
  }, [])
  const select = useCallback((ann: AnnotationSpec) => {
    setState((prev) => (prev.name === "reading" ? prev : { name: "selected", id: ann.id }))
  }, [])
  const enterReading = useCallback(
    (ann: AnnotationSpec) => {
      const rect = titleRectsRef.current.get(ann.id)
      setFlipFromRect(rect ?? null)
      setState({ name: "reading", id: ann.id })
    },
    [],
  )
  const backToWorld = useCallback(() => {
    setState({ name: "world" })
    setFlipFromRect(null)
  }, [])

  const selectedDimension =
    payload && selectedAnnotation
      ? payload.dimensions.find((d) => d.dimensionId === selectedAnnotation.id) ?? null
      : null

  // 证据脚注（§25：editorial footnote，真实 fixture 数值）
  // 标题矩形统一在 layout effect 测量（shared element FLIP 起点，§30）
  useEffect(() => {
    containerRef.current?.querySelectorAll("[data-title-for]").forEach((el) => {
      const id = (el as HTMLElement).getAttribute("data-title-for")
      if (id) titleRectsRef.current.set(id, el.getBoundingClientRect())
    })
  })

  const footnotes = useMemo(() => {
    if (!payload) return []
    const focal = annotations.find((a) => a.tier === "focal")
    if (!focal) return []
    const dim = payload.dimensions.find((d) => d.dimensionId === focal.id)
    if (!dim) return []
    return dim.evidenceIds
      .slice(0, 2)
      .map((id, i) => {
        const ev = payload.evidence.find((e) => e.evidenceId === id)
        const metric = payload.metrics.find((m) => ev && m.metricId === ev.metricIds[0])
        if (!ev || !metric) return null
        return { index: String(i + 1).padStart(2, "0"), title: metric.name, value: formatMetricValue(metric) }
      })
      .filter((x): x is { index: string; title: string; value: string } => Boolean(x))
  }, [payload, annotations])

  const spot = spotlightFor(hoverAnnotation)
  const reading = state.name === "reading"
  const selectedClaims =
    payload && selectedAnnotation
      ? (payload.claims ?? []).filter((c) => c.dimensionId === selectedAnnotation.id).slice(0, 2)
      : []
  const selectedMissing =
    payload && selectedAnnotation
      ? payload.dimensions.find((d) => d.dimensionId === selectedAnnotation.id)?.missingInformation ?? []
      : []

  return (
    <main
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden select-none"
      style={{ background: "#E9E6DC", color: "#1C1E24", cursor: state.name === "world" ? "grab" : "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* WORLD = media（§13/§21） */}
      <AbstractMedia transform={mediaTransform} reading={reading} />

      {/* hover 聚光遮罩（§19：局部遮罩，无 border glow） */}
      {spot && state.name === "hover" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: "rgba(24,26,32,0.3)",
            maskImage: `radial-gradient(circle ${spot.r}vh at ${spot.x}% ${spot.y}%, transparent 0%, black 78%)`,
            WebkitMaskImage: `radial-gradient(circle ${spot.r}vh at ${spot.x}% ${spot.y}%, transparent 0%, black 78%)`,
            transition: "opacity 420ms ease-out",
          }}
        />
      )}

      {/* UNKNOWN media treatment（§23：局部 blur，非虚线圈） */}
      {(() => {
        const unknown = annotations.find((a) => a.kind === "unknown")
        if (!unknown || reading) return null
        return (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10"
            style={{
              left: `${unknown.x - 16}%`,
              top: `${unknown.y - 14}%`,
              width: "34%",
              height: "34%",
              backdropFilter: "blur(13px) saturate(0.72)",
              WebkitBackdropFilter: "blur(13px) saturate(0.72)",
              maskImage: "radial-gradient(ellipse 62% 58% at 50% 50%, black 34%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(ellipse 62% 58% at 50% 50%, black 34%, transparent 78%)",
            }}
          />
        )
      })()}

      {/* Annotations（§17/§18：文字直接存在于空间中） */}
      <div
        className="absolute inset-0 z-20"
        style={{
          opacity: reading ? 0 : 1,
          transition: "opacity 520ms ease-out",
          pointerEvents: reading ? "none" : "auto",
        }}
      >
        {annotations.map((ann) => {
          if (selectedId !== null && ann.id !== selectedId) return null
          const ts = tierStyle(ann.tier)
          const hovered = state.name === "hover" && state.id === ann.id
          const isSelected = selectedId === ann.id
          const isDim = ann.kind === "dimension"
          const scaleBoost = hovered || isSelected ? 1.06 : 1
          return (
            <div
              key={ann.id}
              className="absolute"
              style={{
                left: `${ann.x}%`,
                top: `${ann.y}%`,
                transform: `translateY(-30%) scale(${scaleBoost})`,
                transformOrigin: ann.align === "left" ? "left center" : "right center",
                textAlign: ann.align === "left" ? "left" : "right",
                opacity: state.name === "hover" && !hovered ? 0.3 : ts.opacity,
                transition: "opacity 420ms ease-out, transform 620ms cubic-bezier(0.22,1,0.36,1)",
                cursor: isDim || ann.kind === "unknown" ? "pointer" : "default",
              }}
              onPointerEnter={() => (state.name === "world" || state.name === "hover") && setHover(ann)}
              onPointerLeave={() => state.name === "hover" && setHover(null)}
              onClick={(e) => {
                e.stopPropagation()
                if (state.name === "world" || state.name === "hover") select(ann)
              }}
            >
              <div data-title-for={ann.id}>
                <div
                  style={{
                    fontSize: ts.size,
                    fontWeight: ts.weight,
                    lineHeight: 1.12,
                    letterSpacing: "0.01em",
                    wordBreak: "keep-all",
                    textShadow: "0 1px 22px rgba(233,230,220,0.9), 0 0 44px rgba(233,230,220,0.55)",
                  }}
                >
                  {ann.label}
                </div>
                {/* status / evidence 行（§18） */}
                <div className="mt-1.5 font-mono text-[10px] tracking-[0.2em]" style={{ color: "#565A64" }}>
                  {ann.kind === "suggestion" && <span>UNEXPLORED</span>}
                  {ann.kind === "unknown" && <span style={{ color: "#8A6A33" }}>UNRESOLVED · EVIDENCE INCOMPLETE —</span>}
                  {isDim && (
                    <>
                      {ann.status} {ann.conflict && <span style={{ color: "#8A6A33" }}>· {`{1 CONFLICT}`}</span>}
                      <span className="ml-2">↗ {ann.evidenceCount} EVIDENCE</span>
                    </>
                  )}
                </div>
                {/* CONFLICT split treatment（§24：双层 annotation + crossed leader） */}
                {isDim && ann.conflict && (
                  <svg width="120" height="18" className="mt-1 overflow-visible">
                    <path d="M0 9 H 44 M44 9 L 74 2 M44 9 L 74 16" stroke="#8A6A33" strokeWidth="1" fill="none" opacity="0.75" />
                    <text x="80" y="5" fontSize="8.5" fill="#8A6A33" fontFamily="monospace" letterSpacing="1.5">
                      FOR
                    </text>
                    <text x="80" y="17" fontSize="8.5" fill="#8A6A33" fontFamily="monospace" letterSpacing="1.5">
                      AGAINST
                    </text>
                  </svg>
                )}
              </div>

              {/* B selected：summary 就地展开（§20：非弹卡） */}
              {isSelected && state.name === "selected" && (
                <div
                  className="mt-5 max-w-[300px]"
                  style={{ animation: "editorial-summary-in 520ms cubic-bezier(0.22,1,0.36,1)" }}
                  onPointerEnter={(e) => e.stopPropagation()}
                >
                  {ann.kind === "unknown" ? (
                    <div className="font-mono text-[10.5px] leading-relaxed" style={{ color: "#8A6A33" }}>
                      <div>EVIDENCE INCOMPLETE —</div>
                      {selectedMissing.slice(0, 3).map((m) => (
                        <div key={m} className="mt-1 opacity-80">
                          · {m}
                        </div>
                      ))}
                    </div>
                  ) : (
                    selectedClaims.map((c, i) => (
                      <p
                        key={i}
                        className="mb-2 text-[13px] leading-relaxed"
                        style={{ color: "#2A2D35", textShadow: "0 1px 16px rgba(233,230,220,0.95)" }}
                      >
                        {c.text.slice(0, 76)}…
                      </p>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      enterReading(ann)
                    }}
                    className="mt-1 font-mono text-[11px] tracking-[0.2em] text-[#3E6B99] transition hover:opacity-75"
                  >
                    EXPLORE →
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* 证据脚注（§25 editorial footnote，世界态挂在 focal 下方） */}
        {state.name === "world" &&
          footnotes.map((f, i) => (
            <div
              key={f.index}
              className="absolute font-mono"
              style={{ left: `${9.5 + i * 15}%`, top: `${49 + i * 9}%`, opacity: 0.78 }}
            >
              <div className="text-[9px] tracking-[0.24em]" style={{ color: "#565A64" }}>
                {f.index}
              </div>
              <div className="mt-0.5 text-[11px] tracking-wide" style={{ color: "#2A2D35" }}>
                {f.title}
              </div>
              <div className="text-[17px]" style={{ color: "#14161B", fontVariantNumeric: "tabular-nums" }}>
                {f.value}
              </div>
              <svg width="96" height="6" className="mt-1">
                <line x1="0" y1="3" x2="88" y2="3" stroke="#3A3D45" strokeWidth="1" opacity="0.5" />
                <circle cx="92" cy="3" r="2.2" fill="#3E6B99" />
              </svg>
            </div>
          ))}
      </div>

      {/* 顶部 chrome（§52：plain text + metadata，去 SaaS pill） */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between px-8 pt-6 font-mono text-[10px] tracking-[0.24em]"
        style={{ color: "#3A3D45", opacity: reading ? 0 : 1, transition: "opacity 520ms ease-out" }}
      >
        <div>STOCKLENS — EDITORIAL RESEARCH WORLD</div>
        <div className="text-right">
          {payload ? `${payload.company.stockCode} · ${INDUSTRY_EN[payload.company.industryName ?? ""] ?? payload.company.industryName}` : "…"}
        </div>
      </div>

      {/* Company map title（§12/§49：56px+） */}
      <div
        className="pointer-events-none absolute bottom-8 left-9 z-40"
        style={{ opacity: reading ? 0.12 : 1, transition: "opacity 620ms ease-out" }}
      >
        <div
          className="text-[64px] font-light leading-none tracking-[0.04em]"
          style={{ color: "#1C1E24", textShadow: "0 2px 30px rgba(233,230,220,0.9)" }}
        >
          {payload ? payload.company.stockName.toUpperCase() : "—"}
        </div>
        <div className="mt-2 font-mono text-[10.5px] tracking-[0.26em]" style={{ color: "#565A64" }}>
          {payload ? `${payload.company.stockCode} · ${INDUSTRY_EN[payload.company.industryName ?? ""] ?? payload.company.industryName ?? ""}` : "—"}
          <span className="ml-3 opacity-70">DRAG TO EXPLORE · CLICK TO FOCUS</span>
        </div>
      </div>

      {/* Command Lens 轻量态（§51：保留但更轻，不是页面最重对象） */}
      {!reading && (
        <div className="pointer-events-none absolute bottom-9 left-1/2 z-30 -translate-x-1/2 font-mono text-[10px] tracking-[0.22em]" style={{ color: "#565A64", opacity: 0.5 }}>
          ⌘K — ASK · EXPLORE
        </div>
      )}

      {/* C reading（§27–§31） */}
      {reading && payload && selectedDimension && (
        <EditorialReading
          space={payload as never}
          dimension={selectedDimension as never}
          flipFromRect={flipFromRect}
          onBack={backToWorld}
        />
      )}

      {failed && (
        <div className="absolute inset-0 z-50 flex items-center justify-center text-[14px]">Fixture 不可用</div>
      )}

      <style jsx global>{`
        @keyframes editorial-summary-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  )
}
