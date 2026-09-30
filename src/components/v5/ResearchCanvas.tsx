"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import { IDENTITY_CAMERA, computeFitCamera, panCamera, screenToWorld, zoomAtPointer, boundsOfObjects, type CameraState } from "@/lib/spatial/camera"
import {
  CANVAS,
  ambientLabels,
  buildTrace,
  composeCanvas,
  evidenceAnnotations,
  tierFont,
  type AnchorSpec,
} from "@/lib/v5/canvas"

// Research Canvas（Task 15.3）——按规格与参考图实现，不做设计决策。
// 本 Gate 仅实现（§34）：Company Canvas / Research Anchors / Pan / Zoom / Dimension drag /
// Dimension hover / Evidence Trace / Contextual actions。Peek / Reading V5 / My World V5 不实现（§37）。

const C = {
  bg: "#F5F7FA",
  ink: "#11151B",
  secondary: "#6D7480",
  hair: "rgba(17,21,27,0.10)",
  blue: "#2F66FF",
  violet: "#7659E8",
  amber: "#B4802A",
  coral: "#D9534F",
} as const

interface PinnedNote {
  id: string
  title: string
  summary: string
  x: number
  y: number
}

export default function ResearchCanvas() {
  const [payload, setPayload] = useState<ResearchSpacePayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [camera, setCamera] = useState<CameraState>({ ...IDENTITY_CAMERA })
  const [viewport, setViewport] = useState({ width: 1440, height: 900 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [dragging, setDragging] = useState(false)
  const [parked, setParked] = useState<string[]>([])
  const [notes, setNotes] = useState<PinnedNote[]>([])
  const [lensOpen, setLensOpen] = useState(false)
  const [lensText, setLensText] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const noteDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      const live = new URLSearchParams(window.location.search).get("live") === "1"
      try {
        const res = live
          ? await fetch("/api/research/init", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ stockCode: "000333.SZ" }),
            })
          : await fetch("/api/observatory/fixture?name=midea-artdirection")
        if (!res.ok) throw new Error()
        const data = (await res.json()) as ResearchSpacePayload
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setLensOpen((v) => !v)
      }
      if (e.key === "Escape") setLensOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const anchors: AnchorSpec[] = useMemo(() => (payload ? composeCanvas(payload) : []), [payload])
  const labels = useMemo(() => (payload ? ambientLabels(payload) : []), [payload])

  const fit = useCallback(() => {
    if (anchors.length === 0) return
    const bounds = boundsOfObjects(anchors.map((a) => ({ x: a.x, y: a.y, width: 300, height: 150 })))
    if (bounds) setCamera(computeFitCamera(bounds, viewport, 80))
  }, [anchors, viewport])

  useEffect(() => {
    if (anchors.length === 0) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      fit()
    })()
    return () => {
      cancelled = true
    }
  }, [anchors, fit])

  const zoomBy = useCallback(
    (factor: number) => {
      setCamera((c) => zoomAtPointer(c, viewport, { x: viewport.width / 2, y: viewport.height / 2 }, factor))
    },
    [viewport],
  )

  // ---- Pan / Zoom / Dimension drag（§9） ----
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-ui]")) return
    panRef.current = { lastX: e.clientX, lastY: e.clientY }
    setDragging(true)
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // 合成事件下可能失败
    }
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const local = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const dd = dragRef.current
      if (dd) {
        const world = screenToWorld(camera, viewport, local.x, local.y)
        setPositions((p) => ({ ...p, [dd.id]: { x: world.x - dd.offsetX, y: world.y - dd.offsetY } }))
        return
      }
      const nd = noteDragRef.current
      if (nd) {
        const world = screenToWorld(camera, viewport, local.x, local.y)
        setNotes((ns) => ns.map((n) => (n.id === nd.id ? { ...n, x: world.x - nd.offsetX, y: world.y - nd.offsetY } : n)))
        return
      }
      const pan = panRef.current
      if (!pan) return
      const dx = e.clientX - pan.lastX
      const dy = e.clientY - pan.lastY
      pan.lastX = e.clientX
      pan.lastY = e.clientY
      setCamera((c) => panCamera(c, dx, dy))
    },
    [camera, viewport],
  )

  const onPointerUp = useCallback(() => {
    panRef.current = null
    dragRef.current = null
    noteDragRef.current = null
    setDragging(false)
  }, [])

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const factor = Math.exp(-e.deltaY * 0.0014)
      setCamera((c) => zoomAtPointer(c, viewport, { x: e.clientX - rect.left, y: e.clientY - rect.top }, factor))
    },
    [viewport],
  )

  const anchorPos = useCallback((a: AnchorSpec) => positions[a.dimensionId] ?? { x: a.x, y: a.y }, [positions])
  const visible = anchors.filter((a) => !parked.includes(a.dimensionId))
  const focused = hoverId ? visible.find((a) => a.dimensionId === hoverId) ?? null : null

  const pinNote = useCallback(
    (a: AnchorSpec) => {
      setNotes((ns) => {
        if (ns.some((n) => n.id === a.dimensionId)) return ns
        const pos = positions[a.dimensionId] ?? { x: a.x, y: a.y }
        const summary = payload?.claims.find((c) => c.dimensionId === a.dimensionId && c.type !== "unknown")?.text ?? ""
        return [...ns, { id: a.dimensionId, title: `${a.label}摘要`, summary: summary.slice(0, 64), x: pos.x + 60, y: pos.y + 210 }].slice(0, 3)
      })
      setHoverId(null)
    },
    [positions, payload],
  )
  const park = useCallback((dimensionId: string) => {
    setParked((p) => (p.includes(dimensionId) ? p : [...p, dimensionId]))
    setHoverId(null)
  }, [])

  const lensItems = useMemo(() => {
    const base = [{ label: "Fit view", run: fit }]
    if (focused) {
      return [
        { label: `Pin note · ${focused.label}`, run: () => pinNote(focused) },
        { label: `Park · ${focused.label}`, run: () => park(focused.dimensionId) },
        ...base,
      ]
    }
    if (parked.length > 0) return [{ label: `Restore all parked (${parked.length})`, run: () => setParked([]) }, ...base]
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinNote/park 语义稳定
  }, [focused, parked, fit])

  const transform = `translate3d(${-camera.x * camera.scale}px, ${-camera.y * camera.scale}px, 0) scale(${camera.scale})`
  const zoomPct = Math.round(camera.scale * 100)
  const suggestions = (payload?.suggestions ?? []).slice(0, 2)

  if (failed) {
    return (
      <main className="flex h-screen w-screen items-center justify-center" style={{ background: C.bg, color: C.ink }}>
        <div className="font-mono text-[12px]" style={{ color: C.secondary }}>
          RESEARCH SPACE UNAVAILABLE
        </div>
      </main>
    )
  }

  return (
    <main
      ref={containerRef}
      className="relative h-screen w-screen select-none overflow-hidden"
      style={{ background: C.bg, color: C.ink, cursor: dragging ? "grabbing" : "default" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    >
      {/* 画布底纹（参考图：极淡方格） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(17,21,27,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(17,21,27,0.035) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
          maskImage: "radial-gradient(120% 100% at 50% 45%, black 40%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(120% 100% at 50% 45%, black 40%, transparent 100%)",
        }}
      />

      {/* CANVAS WORLD LAYER */}
      <div className="absolute left-1/2 top-1/2" style={{ transform, transformOrigin: "0 0", transition: dragging ? "none" : "transform 140ms linear" }}>
        {/* Evidence Trace（§11：默认几乎不可见；hover 显现）——曲线网络 + 环境弧 */}
        <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={CANVAS.width} height={CANVAS.height}>
          <path d="M 320 980 Q 760 700 1180 860 T 1880 640" fill="none" stroke={C.ink} strokeWidth="0.8" strokeDasharray="2 8" opacity="0.07" />
          <path d="M 180 300 Q 620 520 1080 300 T 1900 460" fill="none" stroke={C.ink} strokeWidth="0.8" strokeDasharray="2 8" opacity="0.05" />
          {payload &&
            visible.map((a) => {
              const pos = anchorPos(a)
              const trace = buildTrace(
                { ...a, x: pos.x, y: pos.y },
                payload.dimensions.find((d) => d.dimensionId === a.dimensionId)?.evidenceIds ?? [],
              )
              const active = hoverId === a.dimensionId
              return (
                <g key={a.dimensionId}>
                  {trace.edges.map((e, i) => (
                    <path
                      key={i}
                      d={e.path}
                      fill="none"
                      stroke={active ? "#7E93B8" : C.ink}
                      strokeWidth={active ? 1.1 : 0.7}
                      opacity={active ? 0.6 : 0.11}
                      strokeDasharray={a.status === "unknown" ? "3 6" : undefined}
                      style={{ transition: "opacity 320ms ease-out" }}
                    />
                  ))}
                  {trace.nodes.map((n) => (
                    <circle
                      key={n.evidenceId}
                      cx={n.x}
                      cy={n.y}
                      r={active ? 3 : 2.2}
                      fill={a.status === "unknown" ? C.amber : active ? "#4E7BD4" : C.ink}
                      opacity={active ? 0.8 : 0.16}
                      style={{ transition: "opacity 320ms ease-out" }}
                    />
                  ))}
                </g>
              )
            })}
        </svg>

        {/* 环境区域标签（参考图：极淡 caps 语境层） */}
        {labels.map((l) => (
          <div
            key={l.text}
            className="pointer-events-none absolute font-mono text-[10px] tracking-[0.34em]"
            style={{ left: l.x, top: l.y, color: C.secondary, opacity: 0.3 }}
          >
            {l.text}
          </div>
        ))}

        {/* Research Anchors（§6/§7 + 参考图：序号 / 标题 / 计数 / 子条目；hover：摘要 + 动作行） */}
        {visible.map((a) => {
          const pos = anchorPos(a)
          const f = tierFont(a.tier)
          const isUnknown = a.status === "unknown"
          const active = hoverId === a.dimensionId
          const dimmed = hoverId !== null && !active
          const summary = payload?.claims.find((c) => c.dimensionId === a.dimensionId && c.type !== "unknown")?.text ?? ""
          return (
            <div
              key={a.dimensionId}
              data-anchor-id={a.dimensionId}
              className="absolute"
              style={{ left: pos.x, top: pos.y, opacity: dimmed ? 0.25 : 1, transition: "opacity 320ms ease-out", zIndex: active ? 20 : 1 }}
              onPointerEnter={() => setHoverId(a.dimensionId)}
              onPointerLeave={() => setHoverId(null)}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return
                const world = screenToWorld(camera, viewport, e.clientX - rect.left, e.clientY - rect.top)
                dragRef.current = { id: a.dimensionId, offsetX: world.x - pos.x, offsetY: world.y - pos.y }
                try {
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                } catch {
                  // 合成事件下可能失败
                }
              }}
            >
              <div className="font-mono text-[9.5px] tracking-[0.2em]" style={{ color: C.secondary, opacity: 0.8 }}>
                {a.index}
              </div>

              {/* UNKNOWN：锚点后的局部柔化（§24：非大面积 amber，非岛屿） */}
              {isUnknown && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{
                    left: -40,
                    top: -26,
                    width: 300,
                    height: 150,
                    backdropFilter: "blur(9px)",
                    WebkitBackdropFilter: "blur(9px)",
                    maskImage: "radial-gradient(ellipse 60% 58% at 50% 50%, black 30%, transparent 78%)",
                    WebkitMaskImage: "radial-gradient(ellipse 60% 58% at 50% 50%, black 30%, transparent 78%)",
                  }}
                />
              )}

              <div
                style={{
                  transform: `scale(${active ? 1.1 : 1})`,
                  transformOrigin: "left top",
                  transition: "transform 320ms cubic-bezier(0.22,1,0.36,1)",
                  cursor: "grab",
                }}
              >
                <div
                  className="mt-1.5 font-medium leading-tight tracking-[-0.01em]"
                  style={{ fontSize: f.size, color: isUnknown ? C.amber : C.ink, whiteSpace: "nowrap" }}
                >
                  {a.label}
                </div>

                <div className="mt-1.5 flex items-center gap-2.5 font-mono" style={{ fontSize: f.meta, color: C.secondary }}>
                  {isUnknown ? (
                    <span style={{ color: C.amber }}>Evidence incomplete</span>
                  ) : (
                    <>
                      <span>{a.evidenceCount} evidence</span>
                      <BarGlyph />
                      {a.conflictCount > 0 && (
                        <span className="flex items-center gap-1.5" style={{ color: C.coral }}>
                          <span aria-hidden style={{ width: 5, height: 5, borderRadius: 1, background: C.coral, display: "inline-block" }} />
                          {a.conflictCount} conflict
                        </span>
                      )}
                    </>
                  )}
                  {/* §32：局部 AI 失败提示（无全局 banner） */}
                  {!a.hasInterpretation && !isUnknown && <span>AI interpretation temporarily unavailable</span>}
                </div>

                {/* 子条目（参考图：标题下 3 行研究方向；真实 metric 名称） */}
                {a.aspects.length > 0 && (
                  <div className="mt-2.5 space-y-1">
                    {a.aspects.map((t) => (
                      <div key={t} className="text-[11.5px] leading-snug" style={{ color: C.secondary, whiteSpace: "nowrap" }}>
                        {t}
                      </div>
                    ))}
                  </div>
                )}

                {/* hover：摘要 + 动作行（§10 + 参考图：Explore 为主按钮，其余文字动作） */}
                {active && !isUnknown && (
                  <div className="mt-4 w-[320px]" style={{ animation: "v5-in 240ms ease-out" }}>
                    {summary && (
                      <p className="text-[12.5px] leading-relaxed" style={{ color: C.secondary }}>
                        {summary.slice(0, 62)}。
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-3.5" onPointerDown={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-[4px] px-3 py-1.5 font-mono text-[10.5px] tracking-[0.08em] text-white"
                        style={{ background: C.blue }}
                      >
                        Explore →
                      </button>
                      {[
                        { label: "Pin", run: () => pinNote(a) },
                        { label: "Ask", run: () => undefined },
                        { label: "Park", run: () => park(a.dimensionId) },
                      ].map((act) => (
                        <button
                          key={act.label}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            act.run()
                          }}
                          className="font-mono text-[10.5px] tracking-[0.08em] transition hover:opacity-100"
                          style={{ color: C.secondary, opacity: 0.9 }}
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Evidence annotations（§11 + 参考图：锚点右侧一列，曲线 leader 连接） */}
              {active && !isUnknown && payload && <Annotations payload={payload} anchor={a} />}
            </div>
          )
        })}

        {/* AI Suggested Dimension（§22：画布边缘 ghost，无卡片） */}
        {suggestions.map((s, i) => (
          <div key={s.label} className="absolute" style={{ left: 168, top: 900 + i * 84 }} title={s.rationale}>
            <div className="flex items-baseline gap-2">
              <span className="text-[15px]" style={{ color: C.blue }}>
                +
              </span>
              <span
                className="whitespace-nowrap text-[15px]"
                style={{ color: C.ink, borderBottom: "1px dashed rgba(17,21,27,0.28)", paddingBottom: 2, opacity: 0.85 }}
              >
                {s.label}
              </span>
            </div>
            <div className="mt-1 pl-5 font-mono text-[10px] tracking-[0.18em]" style={{ color: C.secondary, opacity: 0.8 }}>
              suggested research
            </div>
          </div>
        ))}

        {/* Pinned research notes（§26） */}
        {notes.map((n) => (
          <div
            key={n.id}
            className="absolute w-[240px]"
            style={{ left: n.x, top: n.y, cursor: "move" }}
            onPointerDown={(e) => {
              e.stopPropagation()
              const rect = containerRef.current?.getBoundingClientRect()
              if (!rect) return
              const world = screenToWorld(camera, viewport, e.clientX - rect.left, e.clientY - rect.top)
              noteDragRef.current = { id: n.id, offsetX: world.x - n.x, offsetY: world.y - n.y }
              try {
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              } catch {
                // 合成事件下可能失败
              }
            }}
          >
            <div className="border-l pl-3" style={{ borderColor: "rgba(17,21,27,0.2)" }}>
              <div className="font-mono text-[9.5px] tracking-[0.2em]" style={{ color: C.secondary }}>
                RESEARCH NOTE
              </div>
              <div className="mt-1 text-[13px] font-medium">{n.title}</div>
              <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: C.secondary }}>
                {n.summary}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ---- UI CHROME（参考图：四角，极少） ---- */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-8 py-6">
        <span className="font-mono text-[11px] tracking-[0.3em]" style={{ color: C.ink }}>
          STOCKLENS
        </span>
        <div
          data-ui
          className="pointer-events-auto flex items-center gap-5 font-mono text-[11px] tracking-[0.14em]"
          style={{ color: C.secondary }}
        >
          <SearchGlyph />
          <span style={{ color: C.ink }}>{payload ? payload.company.stockCode : "—"}</span>
          <span>更换公司 →</span>
        </div>
      </header>

      {/* Company Identity（§4：左侧，56–72px） */}
      {payload && (
        <div className="pointer-events-none absolute left-8 top-24 z-20 max-w-[330px]">
          <h1 className="text-[68px] font-semibold leading-[0.98] tracking-[-0.02em]">{payload.company.stockName}</h1>
          <div className="mt-3 font-mono text-[12px] tracking-[0.34em]" style={{ color: C.secondary }}>
            {payload.company.stockName === "美的集团" ? "MIDEA GROUP" : payload.company.stockName.toUpperCase().slice(0, 14)}
          </div>
          <div className="mt-2 font-mono text-[11.5px] tracking-[0.2em]" style={{ color: C.secondary }}>
            {payload.company.stockCode} · {payload.company.industryName ?? "—"}
          </div>
        </div>
      )}

      {/* 底部左：行业 · 维度数 */}
      <div
        className="pointer-events-none absolute bottom-6 left-8 z-30 font-mono text-[10px] tracking-[0.26em]"
        style={{ color: C.secondary, opacity: 0.8 }}
      >
        {payload
          ? `${payload.company.industryName === "白色家电" ? "WHITE GOODS" : (payload.company.industryName ?? "").toUpperCase()} · ${anchors.length} RESEARCH DIMENSIONS`
          : "—"}
      </div>

      {/* 底部中：Command Lens 入口（§28：轻量 pill） */}
      <button
        type="button"
        data-ui
        onClick={() => setLensOpen(true)}
        className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full border px-5 py-2.5 font-mono text-[10.5px] tracking-[0.18em] backdrop-blur"
        style={{ borderColor: C.hair, background: "rgba(255,255,255,0.72)", color: C.secondary }}
      >
        ⌘K&nbsp;&nbsp;Explore · Focus · Add
      </button>

      {/* 底部右：Zoom 控件 */}
      <div
        data-ui
        className="absolute bottom-6 right-8 z-30 flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[10.5px]"
        style={{ borderColor: C.hair, background: "rgba(255,255,255,0.72)", color: C.secondary }}
      >
        <button type="button" onClick={() => zoomBy(1 / 1.25)} className="px-2 py-1 transition hover:opacity-70">
          −
        </button>
        <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{zoomPct}%</span>
        <button type="button" onClick={() => zoomBy(1.25)} className="px-2 py-1 transition hover:opacity-70">
          +
        </button>
        <span aria-hidden style={{ width: 1, height: 12, background: C.hair, display: "inline-block", margin: "0 4px" }} />
        <button type="button" onClick={fit} className="px-2 py-1 transition hover:opacity-70" title="Fit view">
          ⛶
        </button>
      </div>

      {/* Parked（§27：边缘小文本，可恢复） */}
      {parked.length > 0 && (
        <div className="absolute bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4">
          {parked.map((id) => {
            const a = anchors.find((x) => x.dimensionId === id)
            return (
              <button
                key={id}
                type="button"
                data-ui
                onClick={() => setParked((p) => p.filter((x) => x !== id))}
                className="font-mono text-[10.5px] tracking-[0.14em]"
                style={{ color: C.secondary, opacity: 0.85 }}
              >
                {a?.label ?? id} · parked
              </button>
            )
          })}
        </div>
      )}

      {/* Command Lens（§28：轻量、上下文相关、非中央菜单） */}
      {lensOpen && (
        <div
          data-ui
          className="absolute bottom-20 left-1/2 z-40 w-[380px] -translate-x-1/2 border p-3 backdrop-blur"
          style={{ borderColor: C.hair, background: "rgba(255,255,255,0.9)" }}
        >
          <input
            autoFocus
            value={lensText}
            onChange={(e) => setLensText(e.target.value)}
            placeholder="Research commands"
            className="w-full bg-transparent px-1 pb-2 text-[13px] outline-none"
            style={{ borderBottom: "1px solid rgba(17,21,27,0.12)", color: C.ink }}
          />
          <ul className="mt-2">
            {lensItems
              .filter((i) => lensText.trim().length === 0 || i.label.toLowerCase().includes(lensText.toLowerCase()))
              .map((i) => (
                <li key={i.label}>
                  <button
                    type="button"
                    onClick={() => {
                      i.run()
                      setLensOpen(false)
                      setLensText("")
                    }}
                    className="w-full px-2 py-1.5 text-left font-mono text-[11.5px] transition hover:bg-black/[0.04]"
                    style={{ color: C.ink }}
                  >
                    {i.label}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <style jsx global>{`
        @keyframes v5-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  )
}

/** 参考图：元数据行内的迷你条形图标 */
function BarGlyph() {
  return (
    <svg width="12" height="10" aria-hidden>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 4} y={6 - i * 2.4} width="2.4" height={4 + i * 2.4} fill={C.secondary} opacity={0.55} />
      ))}
    </svg>
  )
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="6" cy="6" r="4.2" fill="none" stroke={C.secondary} strokeWidth="1.2" />
      <line x1="9.2" y1="9.2" x2="12.4" y2="12.4" stroke={C.secondary} strokeWidth="1.2" />
    </svg>
  )
}

/** Evidence annotations（§11 + 参考图）：编号徽标 / 名称 / 数值 / 期间行 + 曲线 leader */
function Annotations({ payload, anchor }: { payload: ResearchSpacePayload; anchor: AnchorSpec }) {
  const rows = evidenceAnnotations(payload, anchor.dimensionId, 3)
  if (rows.length === 0) return null
  const rowH = 62
  return (
    <div className="absolute" style={{ left: 400, top: -18, width: 300, animation: "v5-in 260ms ease-out" }}>
      <svg
        aria-hidden
        width="400"
        height={rows.length * rowH + 40}
        className="pointer-events-none absolute"
        style={{ left: -400, top: 0, overflow: "visible" }}
      >
        {rows.map((r, i) => {
          const y = 24 + i * rowH
          return (
            <path
              key={r.index}
              d={`M 0 20 C 120 20, 240 ${y - 20}, 400 ${y}`}
              fill="none"
              stroke={r.type === "inference" ? "#9E8FE0" : "#8FA6D8"}
              strokeWidth="0.9"
              opacity="0.8"
            />
          )
        })}
      </svg>
      {rows.map((r) => (
        <div key={r.index} className="mb-3 flex items-start gap-2.5" style={{ minHeight: rowH - 12 }}>
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border font-mono text-[10px]"
            style={{ borderColor: C.hair, background: "rgba(255,255,255,0.72)", color: r.type === "inference" ? C.violet : C.blue }}
          >
            {r.index}
          </span>
          <div className="flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px]" style={{ color: C.ink }}>
                {r.name}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[12px]" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                {r.value}
                <TrendGlyph negative={r.value.trim().startsWith("-")} />
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[9.5px] tracking-[0.14em]" style={{ color: C.secondary, opacity: 0.85 }}>
              {r.periodLine || "—"}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TrendGlyph({ negative }: { negative: boolean }) {
  return (
    <svg width="14" height="10" aria-hidden>
      {negative ? (
        <path d="M0 7 Q 4 3 7 6 T 13 4" fill="none" stroke={C.coral} strokeWidth="1.2" />
      ) : (
        <>
          <rect x="0" y="5" width="2.6" height="4" fill={C.blue} opacity="0.5" />
          <rect x="4" y="3" width="2.6" height="6" fill={C.blue} opacity="0.7" />
          <rect x="8" y="1" width="2.6" height="8" fill={C.blue} />
        </>
      )}
    </svg>
  )
}
