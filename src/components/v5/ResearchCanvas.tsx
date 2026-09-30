"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import { computeFitCamera, panCamera, screenToWorld, zoomAtPointer, boundsOfObjects, type CameraState } from "@/lib/spatial/camera"
import {
  DESIGN,
  ambientLabels,
  buildTrace,
  composeCanvas,
  evidenceAnnotations,
  gatherTargets,
  tierFont,
  type AnchorSpec,
} from "@/lib/v5/canvas"

// Research Canvas（Task 15.3 / 15.3A）——按规格与参考稿实现，不做设计决策。
// 本轮：初始 scale 1.00（§3–§5）、soft focal（§7–§9）、全部核心交互接通（§17–§42）。

const ReadingV3 = dynamic(() => import("@/components/v3/ReadingV3"), { ssr: false })

const C = {
  bg: "#F5F7FA",
  ink: "#11151B",
  secondary: "#6D7480",
  hair: "rgba(17,21,27,0.12)",
  blue: "#2F66FF",
  violet: "#7659E8",
  amber: "#B4802A",
  coral: "#D9534F",
} as const

const FOCUS_DIM = 0.1
const DRAG_THRESHOLD = 5

interface PinnedNote {
  id: string
  title: string
  summary: string
  x: number
  y: number
}

interface AskState {
  anchorId: string
  question: string
  status: "idle" | "loading" | "done" | "failed"
  summary?: string
  confirmed?: string[]
  unknowns?: string[]
  message?: string
}

export default function ResearchCanvas() {
  const [payload, setPayload] = useState<ResearchSpacePayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [camera, setCamera] = useState<CameraState>({ x: DESIGN.width / 2, y: DESIGN.height / 2, scale: 1 })
  const [viewport, setViewport] = useState({ width: 1440, height: 900 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [peekId, setPeekId] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [selection, setSelection] = useState<string[]>([])
  const [focusSet, setFocusSet] = useState(false)
  const [parked, setParked] = useState<string[]>([])
  const [notes, setNotes] = useState<PinnedNote[]>([])
  const [suggestOpen, setSuggestOpen] = useState<string | null>(null)
  const [suggestDrag, setSuggestDrag] = useState<{ label: string; x: number; y: number; over: boolean } | null>(null)
  const [adding, setAdding] = useState<{ label: string; x: number; y: number } | null>(null)
  const [ask, setAsk] = useState<AskState | null>(null)
  const [lensOpen, setLensOpen] = useState(false)
  const [lensText, setLensText] = useState("")
  const [addAngle, setAddAngle] = useState<string | null>(null)
  const [readingId, setReadingId] = useState<string | null>(null)
  const [readingEvidenceId, setReadingEvidenceId] = useState<string | null>(null)
  const [flipFrom, setFlipFrom] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [companyQuery, setCompanyQuery] = useState<string | null>(null)
  const [companyResults, setCompanyResults] = useState<{ stockCode: string; stockName: string }[]>([])
  const [hitAreas, setHitAreas] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean } | null>(null)
  const noteDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const suggestRef = useRef<{ label: string; clientX: number; clientY: number } | null>(null)
  const spaceRef = useRef(false)
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const suggestDragRef = useRef<{ label: string; x: number; y: number; over: boolean } | null>(null)
  const addDimensionRef = useRef<((label: string, sx?: number, sy?: number) => Promise<void>) | null>(null)

  // ---- fixture ----
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      const params = new URLSearchParams(window.location.search)
      setHitAreas(params.get("hitAreas") === "1")
      try {
        const res =
          params.get("live") === "1"
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
    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      setViewport({ width: w, height: h })
      // §5：仅 viewport < 1200px 自动 fit；1440×900 保持 scale 1.00
      if (w < 1200) {
        setCamera(computeFitCamera(boundsOfObjects([{ x: 0, y: 0, width: DESIGN.width, height: DESIGN.height }])!, { width: w, height: h }, 60))
      }
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const anchors: AnchorSpec[] = useMemo(() => (payload ? composeCanvas(payload) : []), [payload])
  const labels = useMemo(() => ambientLabels(), [])
  const focalId = useMemo(
    () => anchors.find((a) => a.isFocalCandidate)?.dimensionId ?? anchors[0]?.dimensionId ?? null,
    [anchors],
  )
  const activeId = hoverId ?? peekId ?? focalId
  const active = anchors.find((a) => a.dimensionId === activeId) ?? null

  const fitAll = useCallback(() => {
    setCamera(computeFitCamera(boundsOfObjects([{ x: 0, y: 0, width: DESIGN.width, height: DESIGN.height }])!, viewport, 60))
  }, [viewport])
  const resetZoom = useCallback(() => setCamera((c) => ({ ...c, scale: 1 })), [])
  const zoomBy = useCallback(
    (factor: number) => {
      setCamera((c) => zoomAtPointer(c, viewport, { x: viewport.width / 2, y: viewport.height / 2 }, factor))
    },
    [viewport],
  )

  const anchorPos = useCallback((a: AnchorSpec) => positions[a.dimensionId] ?? { x: a.x, y: a.y }, [positions])

  const fitSelection = useCallback(() => {
    if (selection.length === 0) return
    const pts = selection.map((id) => {
      const a = anchors.find((x) => x.dimensionId === id)
      const p = positions[id] ?? { x: a?.x ?? 0, y: a?.y ?? 0 }
      return { x: p.x, y: p.y, width: 320, height: 200 }
    })
    const bounds = boundsOfObjects(pts)
    if (bounds) setCamera(computeFitCamera(bounds, viewport, 120))
  }, [selection, anchors, positions, viewport])

  // ---- keyboard（§33/§38/§39/§2 Space-pan） ----
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setLensOpen((v) => !v)
      }
      if (e.key === "Escape") {
        setLensOpen(false)
        setPeekId(null)
        setSuggestOpen(null)
        setAsk(null)
        setAddAngle(null)
      }
      if (e.key === " " && !e.repeat) {
        spaceRef.current = true
        setSpaceDown(true)
      }
      if (e.shiftKey && (e.key === "!" || e.code === "Digit1")) {
        fitAll()
      }
      if (e.shiftKey && (e.key === "@" || e.code === "Digit2")) {
        fitSelection()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceRef.current = false
        setSpaceDown(false)
      }
    }
    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
    }
  }, [fitAll, fitSelection])

  // ---- pointer 仲裁（§17：5px 阈值，click 与 drag 分离） ----
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement
      if (target.closest("[data-ui]")) return
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // 合成事件下可能失败
      }
      const anchorEl = target.closest("[data-anchor-id]") as HTMLElement | null
      if (anchorEl && !spaceRef.current) {
        const id = anchorEl.getAttribute("data-anchor-id")!
        const a = anchors.find((x) => x.dimensionId === id)
        const pos = positions[id] ?? { x: a?.x ?? 0, y: a?.y ?? 0 }
        const world = screenToWorld(camera, viewport, e.clientX - rect.left, e.clientY - rect.top)
        dragRef.current = {
          id,
          offsetX: world.x - pos.x,
          offsetY: world.y - pos.y,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
        }
        setGrabbing(true)
        return
      }
      if (e.shiftKey) {
        const local = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        marqueeRef.current = { x0: local.x, y0: local.y, x1: local.x, y1: local.y }
        setMarquee(marqueeRef.current)
        return
      }
      panRef.current = { lastX: e.clientX, lastY: e.clientY }
      setGrabbing(true)
    },
    [anchors, positions, camera, viewport],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const local = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const dd = dragRef.current
      if (dd) {
        if (Math.hypot(e.clientX - dd.startX, e.clientY - dd.startY) > DRAG_THRESHOLD) dd.moved = true
        if (dd.moved) {
          const world = screenToWorld(camera, viewport, local.x, local.y)
          setPositions((p) => ({ ...p, [dd.id]: { x: world.x - dd.offsetX, y: world.y - dd.offsetY } }))
        }
        return
      }
      const nd = noteDragRef.current
      if (nd) {
        const world = screenToWorld(camera, viewport, local.x, local.y)
        setNotes((ns) => ns.map((n) => (n.id === nd.id ? { ...n, x: world.x - nd.offsetX, y: world.y - nd.offsetY } : n)))
        return
      }
      const sg = suggestRef.current
      if (sg) {
        const over = local.x > DESIGN.width * 0.2 && local.x < DESIGN.width * 0.95 && local.y > DESIGN.height * 0.06 && local.y < DESIGN.height * 0.94
        const next = { label: sg.label, x: local.x, y: local.y, over }
        suggestDragRef.current = next
        setSuggestDrag(next)
        return
      }
      if (marqueeRef.current) {
        marqueeRef.current = { ...marqueeRef.current, x1: local.x, y1: local.y }
        setMarquee(marqueeRef.current)
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
    const dd = dragRef.current
    if (dd) {
      if (!dd.moved) {
        // §18：位移 ≤ 5px = click → Peek
        setPeekId((cur) => (cur === dd.id ? null : dd.id))
        setAsk(null)
      }
      dragRef.current = null
    }
    if (suggestRef.current) {
      const sd = suggestDragRef.current
      const label = suggestRef.current.label
      suggestRef.current = null
      suggestDragRef.current = null
      setSuggestDrag(null)
      if (sd?.over) void addDimensionRef.current?.(label, sd.x, sd.y)
    }
    if (marqueeRef.current) {
      const m = marqueeRef.current
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        const a = screenToWorld(camera, viewport, m.x0, m.y0)
        const b = screenToWorld(camera, viewport, m.x1, m.y1)
        const hits = anchors
          .filter((anc) => {
            const p = positions[anc.dimensionId] ?? { x: anc.x, y: anc.y }
            return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
          })
          .map((x) => x.dimensionId)
        if (hits.length > 0) setSelection((sel) => Array.from(new Set([...sel, ...hits])))
      }
      marqueeRef.current = null
      setMarquee(null)
    }
    panRef.current = null
    noteDragRef.current = null
    setGrabbing(false)
  }, [camera, viewport, anchors, positions])

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const factor = Math.exp(-e.deltaY * 0.0014)
      setCamera((c) => zoomAtPointer(c, viewport, { x: e.clientX - rect.left, y: e.clientY - rect.top }, factor))
    },
    [viewport],
  )

  // ---- actions ----
  const pinNote = useCallback(
    (a: AnchorSpec) => {
      setNotes((ns) => {
        if (ns.some((n) => n.id === a.dimensionId)) return ns
        const pos = anchorPos(a)
        const summary = payload?.claims.find((c) => c.dimensionId === a.dimensionId && c.type !== "unknown")?.text ?? ""
        return [...ns, { id: a.dimensionId, title: `${a.label}摘要`, summary: summary.slice(0, 64), x: pos.x + 40, y: pos.y + 250 }].slice(0, 3)
      })
    },
    [anchorPos, payload],
  )

  const park = useCallback((dimensionId: string) => {
    setParked((p) => (p.includes(dimensionId) ? p : [...p, dimensionId]))
    setPeekId(null)
  }, [])

  /** §30：Add Dimension —— anchor 出现在操作位置；先 resolving 再由 API 结果定态 */
  const addDimension = useCallback(
    async (label: string, screenX?: number, screenY?: number) => {
      const sx = screenX ?? viewport.width / 2
      const sy = screenY ?? viewport.height / 2
      setAdding({ label, x: sx, y: sy })
      setAddAngle(null)
      try {
        const res = await fetch("/api/research/dimension", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stockCode: payload?.company.stockCode ?? "000333.SZ",
            dimensionText: label,
            currentDimensions: anchors.map((a) => a.label),
          }),
        })
        const body = (await res.json()) as {
          mode?: string
          dimension?: ResearchSpacePayload["dimensions"][number] | null
          claims?: ResearchSpacePayload["claims"]
          evidence?: ResearchSpacePayload["evidence"]
        }
        if (body.mode === "compliance_redirect" || !body.dimension) {
          setAdding(null)
          return
        }
        const dim = body.dimension
        const rect = containerRef.current?.getBoundingClientRect()
        const world = rect
          ? screenToWorld(camera, viewport, sx - rect.left, sy - rect.top)
          : { x: DESIGN.width / 2, y: DESIGN.height / 2 }
        setPayload((prev) =>
          prev
            ? {
                ...prev,
                dimensions: [...prev.dimensions, dim],
                claims: [...prev.claims, ...(body.claims ?? [])],
                evidence: [
                  ...prev.evidence,
                  ...(body.evidence ?? []).filter((e) => !prev.evidence.some((x) => x.evidenceId === e.evidenceId)),
                ],
              }
            : prev,
        )
        setPositions((p) => ({ ...p, [dim.dimensionId]: { x: world.x, y: world.y } }))
        setPeekId(dim.dimensionId)
        setAdding(null)
      } catch {
        setAdding(null)
      }
    },
    [payload, anchors, camera, viewport],
  )

  const runAsk = useCallback(
    async (a: AnchorSpec) => {
      if (!ask || ask.anchorId !== a.dimensionId || ask.question.trim().length === 0) return
      const dim = payload?.dimensions.find((d) => d.dimensionId === a.dimensionId)
      setAsk({ ...ask, status: "loading" })
      try {
        const res = await fetch("/api/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stockCode: payload?.company.stockCode ?? "000333.SZ",
            question: ask.question.trim(),
            evidenceIds: dim?.evidenceIds.slice(0, 4) ?? [],
          }),
        })
        const body = await res.json()
        if (!res.ok) {
          setAsk({ ...ask, status: "failed", message: body?.error ?? `服务返回 ${res.status}` })
          return
        }
        if (body.mode === "compliance_redirect") {
          setAsk({ ...ask, status: "done", summary: body.compliance?.message })
          return
        }
        const s = body.synthesis
        setAsk({
          ...ask,
          status: "done",
          summary: s?.summary?.text,
          confirmed: (s?.confirmedFacts ?? []).map((x: { text: string }) => x.text),
          unknowns: (s?.unknowns ?? []).map((x: { text: string }) => x.text),
        })
      } catch {
        setAsk({ ...ask, status: "failed", message: "追问服务暂时未响应，已验证证据仍可查看。" })
      }
    },
    [ask, payload],
  )

  const openReading = useCallback(
    (a: AnchorSpec) => {
      const el = document.querySelector(`[data-anchor-id="${a.dimensionId}"] [data-anchor-title]`) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        setFlipFrom({ x: r.x, y: r.y, width: r.width, height: r.height })
      } else setFlipFrom(null)
      const pos = anchorPos(a)
      setCamera({ x: pos.x, y: pos.y + 80, scale: 0.9 })
      setReadingId(a.dimensionId)
      setPeekId(null)
      setAsk(null)
    },
    [anchorPos],
  )

  const closeReading = useCallback(() => {
    setReadingId(null)
    setReadingEvidenceId(null)
    setCamera({ x: DESIGN.width / 2, y: DESIGN.height / 2, scale: 1 })
  }, [])

  const searchCompany = useCallback(async (q: string) => {
    setCompanyQuery(q)
    if (q.trim().length === 0) {
      setCompanyResults([])
      return
    }
    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q.trim())}`)
      const body = await res.json()
      const items = (body.items ?? body.results ?? body ?? []) as { stockCode: string; stockName: string }[]
      setCompanyResults(Array.isArray(items) ? items.slice(0, 5) : [])
    } catch {
      setCompanyResults([])
    }
  }, [])

  const switchCompany = useCallback(async (stockCode: string) => {
    setCompanyQuery(null)
    setCompanyResults([])
    try {
      const res = await fetch("/api/research/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode }),
      })
      if (!res.ok) return
      const data = (await res.json()) as ResearchSpacePayload
      setPayload(data)
      setPositions({})
      setSelection([])
      setParked([])
      setNotes([])
      setPeekId(null)
      setReadingId(null)
      setCamera({ x: DESIGN.width / 2, y: DESIGN.height / 2, scale: 1 })
    } catch {
      // 切换失败保持当前公司
    }
  }, [])

  // ---- lens（§34 context-sensitive） ----
  const lensItems = useMemo(() => {
    const out: { label: string; run: () => void }[] = []
    if (selection.length > 0) {
      out.push(
        { label: `Focus selected (${selection.length})`, run: () => setFocusSet(true) },
        {
          label: "Gather",
          run: () =>
            setPositions((p) => {
              const targets = gatherTargets(selection)
              return { ...p, ...(targets as Record<string, { x: number; y: number }>) }
            }),
        },
        {
          label: "Spread",
          run: () =>
            setPositions((p) => {
              const next = { ...p }
              selection.forEach((id) => delete next[id])
              return next
            }),
        },
        { label: "Clear selection", run: () => { setSelection([]); setFocusSet(false) } },
      )
    } else if (active) {
      out.push(
        { label: `Explore · ${active.label}`, run: () => openReading(active) },
        { label: "Ask", run: () => setAsk({ anchorId: active.dimensionId, question: "", status: "idle" }) },
        { label: "Pin", run: () => pinNote(active) },
        { label: "Park", run: () => park(active.dimensionId) },
      )
    } else {
      out.push(
        { label: "Ask company", run: () => setAsk({ anchorId: focalId ?? "", question: "", status: "idle" }) },
        { label: "Fit view", run: fitAll },
      )
    }
    out.push({ label: "Add research angle", run: () => setAddAngle("") })
    if (parked.length > 0) out.push({ label: `Restore all parked (${parked.length})`, run: () => setParked([]) })
    out.push({ label: "Change company", run: () => setCompanyQuery("") })
    return out
  }, [selection, active, focalId, parked, fitAll, openReading, pinNote, park])

  useEffect(() => {
    addDimensionRef.current = addDimension
  }, [addDimension])

  // ---- derived ----
  const transform = `translate3d(${-camera.x * camera.scale}px, ${-camera.y * camera.scale}px, 0) scale(${camera.scale})`
  const zoomPct = Math.round(camera.scale * 100)
  const panelW = readingId ? Math.round(viewport.width * 0.36) : viewport.width
  const visible = anchors.filter((a) => !parked.includes(a.dimensionId))
  const suggestions = (payload?.suggestions ?? []).slice(0, 2)
  const readingDimension = payload && readingId ? payload.dimensions.find((d) => d.dimensionId === readingId) ?? null : null
  const hitStyle = (on: boolean) => (on ? { outline: "1px dashed rgba(47,102,255,0.6)", outlineOffset: 2, background: "rgba(47,102,255,0.06)" } : undefined)

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
    <main className="relative h-screen w-screen select-none overflow-hidden" style={{ background: C.bg, color: C.ink }}>
      {/* 画布底纹（§12） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(17,21,27,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(17,21,27,0.028) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
          maskImage: "radial-gradient(125% 105% at 50% 45%, black 42%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(125% 105% at 50% 45%, black 42%, transparent 100%)",
        }}
      />

      {/* CANVAS PANE（§21：Reading 时压缩到 36%，仍可 hover / 可点面包屑） */}
      <div
        ref={containerRef}
        className="absolute left-0 top-0 h-full"
        style={{
          width: panelW,
          cursor: grabbing ? "grabbing" : spaceDown ? "grab" : "default",
          transition: "width 560ms cubic-bezier(0.22,1,0.36,1)",
          overflow: "hidden",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform, transformOrigin: "0 0", transition: "transform 560ms cubic-bezier(0.22,1,0.36,1)" }}
        >
          {/* Evidence Trace（§13） */}
          <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible" width={DESIGN.width} height={DESIGN.height}>
            <path d="M 300 900 Q 700 700 1120 820 T 1700 620" fill="none" stroke={C.ink} strokeWidth="0.8" strokeDasharray="2 8" opacity="0.06" />
            {payload &&
              visible.map((a) => {
                const pos = anchorPos(a)
                const dimEvidenceIds = payload.dimensions.find((d) => d.dimensionId === a.dimensionId)?.evidenceIds ?? []
                // §24：Reading 中选中的证据必须出现在该维度的 trace 里（即使在默认 4 个之外）
                const traceIds =
                  readingEvidenceId && a.dimensionId === readingId && !dimEvidenceIds.slice(0, 4).includes(readingEvidenceId)
                    ? [readingEvidenceId, ...dimEvidenceIds]
                    : dimEvidenceIds
                const trace = buildTrace({ x: pos.x, y: pos.y, dimensionId: a.dimensionId }, traceIds, 5)
                const isActive = activeId === a.dimensionId
                return (
                  <g key={a.dimensionId}>
                    {trace.edges.map((e, i) => (
                      <path
                        key={i}
                        d={e.path}
                        fill="none"
                        stroke={isActive ? "#6F87B5" : C.ink}
                        strokeWidth={isActive ? 1.1 : 0.8}
                        opacity={isActive ? 0.55 : 0.08}
                        strokeDasharray={a.status === "unknown" ? "3 6" : undefined}
                        style={{ transition: "opacity 320ms ease-out" }}
                      />
                    ))}
                    {trace.nodes.map((n) => {
                      const isReadingEvidence = readingEvidenceId !== null && n.evidenceId === readingEvidenceId
                      return (
                        <circle
                          key={n.evidenceId}
                          data-evidence-node={n.evidenceId}
                          cx={n.x}
                          cy={n.y}
                          r={isReadingEvidence ? 5.5 : isActive ? 3.6 : 2.6}
                          fill={isReadingEvidence ? C.blue : a.status === "unknown" ? C.amber : isActive ? "#4E7BD4" : C.ink}
                          opacity={isReadingEvidence ? 1 : isActive ? 0.8 : 0.18}
                          style={{ transition: "opacity 300ms ease-out" }}
                        />
                      )
                    })}
                  </g>
                )
              })}
          </svg>

          {labels.map((l) => (
            <div
              key={l.text}
              className="pointer-events-none absolute font-mono text-[10px] tracking-[0.34em]"
              style={{ left: l.x, top: l.y, color: C.secondary, opacity: 0.32 }}
            >
              {l.text}
            </div>
          ))}

          {/* Research Anchors */}
          {visible.map((a) => {
            const pos = anchorPos(a)
            const f = tierFont(a.tier)
            const isUnknown = a.status === "unknown"
            const isActive = activeId === a.dimensionId
            const selected = selection.includes(a.dimensionId)
            const othersDim = hoverId !== null && hoverId !== a.dimensionId
            const focusDim = focusSet && selection.length > 0 && !selected
            const summary = payload?.claims.find((c) => c.dimensionId === a.dimensionId && c.type !== "unknown")?.text ?? ""
            const dim = payload?.dimensions.find((d) => d.dimensionId === a.dimensionId)
            return (
              <div
                key={a.dimensionId}
                data-anchor-id={a.dimensionId}
                data-hit="anchor"
                className="absolute"
                style={{
                  left: pos.x,
                  top: pos.y,
                  opacity: focusDim ? FOCUS_DIM : othersDim ? 0.25 : isActive ? 1 : 0.88,
                  transition: "opacity 320ms ease-out",
                  zIndex: isActive || selected ? 20 : 1,
                  padding: "14px 20px 16px 0",
                  marginLeft: -10,
                  cursor: "pointer",
                  ...hitStyle(hitAreas),
                }}
                onPointerEnter={() => setHoverId(a.dimensionId)}
                onPointerLeave={() => setHoverId(null)}
                onClick={(e) => {
                  if (e.shiftKey) {
                    setSelection((sel) => (sel.includes(a.dimensionId) ? sel.filter((x) => x !== a.dimensionId) : [...sel, a.dimensionId]))
                  }
                }}
              >
                <div className="font-mono text-[10px] tracking-[0.2em]" style={{ color: C.secondary, opacity: 0.85 }}>
                  {a.index}
                </div>

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
                    transform: `scale(${isActive ? 1.06 : 1})`,
                    transformOrigin: "left top",
                    transition: "transform 320ms cubic-bezier(0.22,1,0.36,1)",
                  }}
                >
                  <div className="flex items-baseline gap-2.5">
                    {selected && <span aria-hidden style={{ width: 2, height: f.size * 0.86, background: C.blue, display: "inline-block" }} />}
                    <span
                      data-anchor-title
                      className="font-medium leading-tight tracking-[-0.01em]"
                      style={{ fontSize: f.size, color: isUnknown ? C.amber : C.ink, whiteSpace: "nowrap" }}
                    >
                      {a.label}
                    </span>
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
                        {!a.hasInterpretation && <span>AI interpretation temporarily unavailable</span>}
                      </>
                    )}
                  </div>

                  {a.aspects.length > 0 && (
                    <div className="mt-2.5 space-y-1">
                      {a.aspects.map((t) => (
                        <div key={t} className="text-[12.5px] leading-snug" style={{ color: C.secondary, whiteSpace: "nowrap" }}>
                          {t}
                        </div>
                      ))}
                    </div>
                  )}

                  {isActive && !isUnknown && summary && (
                    <p className="mt-3 w-[300px] text-[13px] leading-relaxed" style={{ color: C.secondary, animation: "v5-in 240ms ease-out" }}>
                      {summary.slice(0, 60)}。
                    </p>
                  )}

                  {/* Contextual actions（§15/§19：命中高度 ≥40px） */}
                  {isActive && (
                    <div
                      data-ui
                      data-hit="action"
                      className="mt-2 flex items-center gap-1"
                      onPointerDown={(e) => e.stopPropagation()}
                      style={hitStyle(hitAreas)}
                    >
                      <button
                        type="button"
                        data-action-explore
                        onClick={(e) => {
                          e.stopPropagation()
                          openReading(a)
                        }}
                        className="rounded-[4px] px-3 text-white"
                        style={{ background: C.blue, minHeight: 40, fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.08em" }}
                      >
                        Explore →
                      </button>
                      {[
                        { label: "Pin", key: "pin", run: () => pinNote(a) },
                        { label: "Ask", key: "ask", run: () => setAsk({ anchorId: a.dimensionId, question: "", status: "idle" }) },
                        { label: "Park", key: "park", run: () => park(a.dimensionId) },
                      ].map((act) => (
                        <button
                          key={act.label}
                          type="button"
                          data-action={act.key}
                          onClick={(e) => {
                            e.stopPropagation()
                            act.run()
                          }}
                          className="rounded-[4px] px-3 hover:bg-black/[0.04]"
                          style={{ minHeight: 40, color: C.secondary, fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.08em" }}
                        >
                          {act.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Peek（§18/§19/§31） */}
                  {peekId === a.dimensionId && (
                    <div
                      data-peek
                      className="mt-3 w-[320px] border-t pt-3"
                      style={{ borderColor: C.hair, animation: "v5-in 260ms ease-out" }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {isUnknown ? (
                        <>
                          <div className="font-mono text-[10.5px] tracking-[0.18em]" style={{ color: C.amber }}>
                            EVIDENCE INCOMPLETE
                          </div>
                          <ul className="mt-2 space-y-1 text-[12px] leading-relaxed" style={{ color: C.secondary }}>
                            {(dim?.missingInformation ?? []).slice(0, 4).map((m) => (
                              <li key={m}>· {m}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <>
                          {(payload?.claims ?? [])
                            .filter((c) => c.dimensionId === a.dimensionId)
                            .slice(0, 3)
                            .map((c, i) => (
                              <p key={c.claimId} className="mb-1.5 text-[12.5px] leading-relaxed" style={{ color: C.ink }}>
                                <span className="mr-1.5 font-mono text-[10px]" style={{ color: C.secondary }}>
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                {c.text.slice(0, 74)}
                              </p>
                            ))}
                          <div className="mt-2 font-mono text-[10.5px] tracking-[0.14em]" style={{ color: C.secondary }}>
                            {a.evidenceCount} verified · {a.conflictCount} conflict ·{" "}
                            {(payload?.claims ?? []).filter((c) => c.dimensionId === a.dimensionId && c.type === "unknown").length} unknown
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Ask（§25） */}
                  {ask?.anchorId === a.dimensionId && (
                    <div
                      data-ui
                      data-ask
                      className="mt-3 w-[320px] border-t pt-3"
                      style={{ borderColor: C.hair, animation: "v5-in 220ms ease-out" }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <div className="font-mono text-[10px] tracking-[0.18em]" style={{ color: C.secondary }}>
                        ASK · {a.label}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          autoFocus
                          value={ask.question}
                          onChange={(e) => setAsk({ ...ask, question: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void runAsk(a)
                          }}
                          placeholder="沿这个研究角度继续问…"
                          className="min-w-0 flex-1 bg-transparent pb-1 text-[12.5px] outline-none"
                          style={{ borderBottom: `1px solid ${C.hair}`, minHeight: 36 }}
                        />
                        <button
                          type="button"
                          data-ask-submit
                          onClick={() => void runAsk(a)}
                          className="rounded-[4px] px-3 text-white"
                          style={{ background: C.blue, minHeight: 36 }}
                        >
                          {ask.status === "loading" ? "…" : "Ask →"}
                        </button>
                      </div>
                      {ask.status !== "idle" && ask.status !== "loading" && (
                        <div className="mt-2 space-y-1 text-[12px] leading-relaxed" style={{ color: C.secondary }}>
                          {ask.summary && <p style={{ color: C.ink }}>{ask.summary}</p>}
                          {ask.confirmed?.length ? <p>可以确认：{ask.confirmed.slice(0, 2).join("；")}</p> : null}
                          {ask.unknowns?.length ? <p>不能确认：{ask.unknowns.slice(0, 2).join("；")}</p> : null}
                          {ask.message && <p>{ask.message}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {isActive && !isUnknown && payload && (
                  <Annotations payload={payload} anchor={a} hitAreas={hitAreas} onOpen={() => setPeekId(a.dimensionId)} />
                )}
              </div>
            )
          })}

          {/* AI Suggested Dimension（§28/§29/§47） */}
          {suggestions.map((s, i) => (
            <div
              key={s.label}
              data-suggestion={s.label}
              data-hit="suggestion"
              className="absolute"
              style={{ left: 150 + i * 250, top: 806, opacity: i === 0 ? 0.95 : 0.6, zIndex: 5, ...hitStyle(hitAreas) }}
              onPointerDown={(e) => {
                e.stopPropagation()
                suggestRef.current = { label: s.label, clientX: e.clientX, clientY: e.clientY }
                try {
                  ;(e.currentTarget.parentElement as HTMLElement)?.setPointerCapture?.(e.pointerId)
                } catch {
                  // 合成事件下可能失败
                }
              }}
            >
              <button
                type="button"
                data-ui
                data-suggestion-trigger={s.label}
                onClick={(e) => {
                  e.stopPropagation()
                  setSuggestOpen((cur) => (cur === s.label ? null : s.label))
                }}
                className="flex items-baseline gap-2"
                style={{ minHeight: 36, cursor: "pointer" }}
              >
                <span className="text-[15px]" style={{ color: C.blue }}>
                  +
                </span>
                <span className="whitespace-nowrap text-[15px]" style={{ color: C.ink, borderBottom: "1px dashed rgba(17,21,27,0.28)", paddingBottom: 2 }}>
                  {s.label}
                </span>
              </button>
              <div className="whitespace-nowrap pl-5 font-mono text-[10px] tracking-[0.18em]" style={{ color: C.secondary, opacity: 0.8 }}>
                suggested research
              </div>
              {suggestOpen === s.label && (
                <div
                  data-ui
                  data-suggest-pop
                  className="mt-2 w-[300px] border-l pl-3"
                  style={{ borderColor: "rgba(17,21,27,0.2)", animation: "v5-in 220ms ease-out" }}
                >
                  <p className="text-[12px] leading-relaxed" style={{ color: C.secondary }}>
                    {s.rationale || "该研究方向由 StockLens 依据当前证据结构建议。"}
                  </p>
                  <div className="mt-1.5 font-mono text-[10px] tracking-[0.16em]" style={{ color: C.secondary }}>
                    {s.capabilityRefs?.length ? `${s.capabilityRefs.length} CAPABILITIES` : "CAPABILITY: PARTIAL"}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      data-suggest-add
                      onClick={() => void addDimension(s.label)}
                      className="rounded-[4px] px-3 text-white"
                      style={{ background: C.blue, minHeight: 36, fontSize: 11 }}
                    >
                      Add to research
                    </button>
                    <button type="button" onClick={() => setSuggestOpen(null)} className="font-mono text-[10.5px]" style={{ color: C.secondary, minHeight: 36 }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* suggestion 拖动 ghost */}
          {suggestDrag && (
            <div className="pointer-events-none absolute" style={{ left: suggestDrag.x - 60, top: suggestDrag.y - 14, zIndex: 40 }}>
              <span
                className="whitespace-nowrap rounded-[4px] px-2 py-1 text-[13px]"
                style={{
                  background: suggestDrag.over ? C.blue : "rgba(255,255,255,0.92)",
                  color: suggestDrag.over ? "#fff" : C.ink,
                  border: `1px solid ${C.hair}`,
                }}
              >
                {suggestDrag.over ? "Release to add" : suggestDrag.label}
              </span>
            </div>
          )}

          {/* Add Dimension resolving 态（§30） */}
          {adding && (
            <div className="pointer-events-none absolute" style={{ left: adding.x - 20, top: adding.y - 20, zIndex: 30 }}>
              <div className="font-mono text-[10px]" style={{ color: C.secondary }}>
                08
              </div>
              <div className="text-[22px] font-medium" style={{ color: C.ink }}>
                {adding.label}
              </div>
              <div className="mt-1 font-mono text-[10.5px] tracking-[0.16em]" style={{ color: C.blue }}>
                resolving…
              </div>
            </div>
          )}

          {/* Pinned notes（§26） */}
          {notes.map((n) => (
            <div
              key={n.id}
              data-note-id={n.id}
              data-hit="note"
              className="absolute w-[250px]"
              style={{ left: n.x, top: n.y, cursor: "move", ...hitStyle(hitAreas) }}
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
                <div className="mt-1 text-[13.5px] font-medium">{n.title}</div>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: C.secondary }}>
                  {n.summary}
                </p>
              </div>
            </div>
          ))}
        </div>

        {marquee && (
          <div
            className="pointer-events-none absolute z-30"
            style={{
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
              border: `1px solid ${C.blue}`,
              background: "rgba(47,102,255,0.06)",
            }}
          />
        )}
      </div>

      {/* READING SHEET（§21–§24：复用 Claim Spine / Evidence / Ask / Challenge） */}
      {readingId && payload && readingDimension && (
        <div
          data-reading-sheet
          className="absolute right-0 top-0 z-40 h-full overflow-hidden"
          style={{
            width: `calc(100% - ${panelW}px)`,
            background: C.bg,
            boxShadow: "-30px 0 80px rgba(17,21,27,0.10)",
            animation: "v5-sheet-in 560ms cubic-bezier(0.22,1,0.36,1)",
            transition: "width 560ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <ReadingV3
            space={payload}
            dimension={readingDimension}
            flipTitleFrom={flipFrom}
            initialClaimId={null}
            initialEvidenceId={readingEvidenceId}
            onEvidenceFocus={setReadingEvidenceId}
            onBack={closeReading}
          />
        </div>
      )}

      {/* ---- CHROME ---- */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between px-8 py-6">
        <span className="font-mono text-[11px] tracking-[0.3em]" style={{ color: C.ink }}>
          STOCKLENS
        </span>
        {readingId && payload ? (
          <button
            type="button"
            data-ui
            data-breadcrumb
            onClick={closeReading}
            className="pointer-events-auto font-mono text-[11px] tracking-[0.14em]"
            style={{ color: C.secondary, minHeight: 36 }}
          >
            {payload.company.stockName} / <span style={{ color: C.ink }}>{readingDimension?.label}</span> ✕
          </button>
        ) : (
          <div data-ui className="pointer-events-auto relative flex items-center gap-5 font-mono text-[12px] tracking-[0.14em]" style={{ color: C.secondary }}>
            <SearchGlyph />
            <span data-ticker style={{ color: C.ink }}>
              {payload ? payload.company.stockCode : "—"}
            </span>
            <button
              type="button"
              data-change-company
              onClick={() => setCompanyQuery((q) => (q === null ? "" : null))}
              className="transition hover:opacity-100"
              style={{ minHeight: 36 }}
            >
              更换公司 →
            </button>
            {companyQuery !== null && (
              <div data-company-search className="absolute right-0 top-10 w-[320px] border bg-white p-3" style={{ borderColor: C.hair }}>
                <input
                  autoFocus
                  value={companyQuery}
                  onChange={(e) => void searchCompany(e.target.value)}
                  placeholder="搜索公司 / 代码"
                  className="w-full pb-2 text-[12.5px] outline-none"
                  style={{ borderBottom: `1px solid ${C.hair}`, minHeight: 36 }}
                />
                <ul className="mt-2">
                  {companyResults.map((r) => (
                    <li key={r.stockCode}>
                      <button
                        type="button"
                        data-company-result={r.stockCode}
                        onClick={() => void switchCompany(r.stockCode)}
                        className="w-full px-2 text-left text-[12px] hover:bg-black/[0.04]"
                        style={{ minHeight: 36, color: C.ink }}
                      >
                        {r.stockName}{" "}
                        <span className="font-mono text-[10.5px]" style={{ color: C.secondary }}>
                          {r.stockCode}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </header>

      {payload && !readingId && (
        <div className="pointer-events-none absolute left-8 top-[112px] z-20 max-w-[320px]">
          <h1 className="text-[64px] font-semibold leading-[0.98] tracking-[-0.02em]">{payload.company.stockName}</h1>
          <div className="mt-3 font-mono text-[16px] tracking-[0.34em]" style={{ color: C.secondary }}>
            {payload.company.stockName === "美的集团" ? "MIDEA GROUP" : payload.company.stockName.toUpperCase().slice(0, 14)}
          </div>
          <div className="mt-2 font-mono text-[12.5px] tracking-[0.2em]" style={{ color: C.secondary }}>
            {payload.company.stockCode} · {payload.company.industryName ?? "—"}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-6 left-8 z-50 font-mono text-[11px] tracking-[0.26em]" style={{ color: C.secondary }}>
        {payload
          ? `${payload.company.industryName === "白色家电" ? "WHITE GOODS" : (payload.company.industryName ?? "").toUpperCase()} · ${anchors.length} RESEARCH DIMENSIONS`
          : "—"}
      </div>

      <button
        type="button"
        data-ui
        data-lens-trigger
        onClick={() => setLensOpen(true)}
        className="absolute bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border px-5 backdrop-blur"
        style={{
          borderColor: C.hair,
          background: "rgba(255,255,255,0.8)",
          color: C.secondary,
          minHeight: 40,
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          letterSpacing: "0.18em",
        }}
      >
        ⌘K&nbsp;&nbsp;Explore · Focus · Add
      </button>

      <div
        data-ui
        data-hit="zoom"
        className="absolute bottom-6 right-8 z-50 flex items-center gap-1 rounded-full border px-2"
        style={{ borderColor: C.hair, background: "rgba(255,255,255,0.8)", color: C.secondary, minHeight: 40, ...hitStyle(hitAreas) }}
      >
        <button type="button" data-zoom-out onClick={() => zoomBy(1 / 1.25)} className="px-2" style={{ minWidth: 36, minHeight: 36 }}>
          −
        </button>
        <button
          type="button"
          data-zoom-pct
          onClick={resetZoom}
          className="px-1 font-mono text-[11px]"
          style={{ color: C.ink, minWidth: 46, minHeight: 36, fontVariantNumeric: "tabular-nums" }}
          title="Reset to 100%"
        >
          <span data-zoom-value>{zoomPct}</span>%
        </button>
        <button type="button" data-zoom-in onClick={() => zoomBy(1.25)} className="px-2" style={{ minWidth: 36, minHeight: 36 }}>
          +
        </button>
        <span aria-hidden style={{ width: 1, height: 14, background: C.hair, display: "inline-block", margin: "0 3px" }} />
        <button type="button" data-zoom-fit onClick={fitSelection} className="px-2" style={{ minWidth: 36, minHeight: 36 }} title="Fit selection (Shift+2)">
          ⛶
        </button>
        <button
          type="button"
          data-zoom-fit-all
          onClick={fitAll}
          className="px-2 font-mono text-[10px]"
          style={{ minWidth: 36, minHeight: 36 }}
          title="Fit all (Shift+1)"
        >
          ALL
        </button>
      </div>

      {parked.length > 0 && (
        <div className="absolute bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4">
          {parked.map((id) => {
            const a = anchors.find((x) => x.dimensionId === id)
            return (
              <button
                key={id}
                type="button"
                data-ui
                data-parked={id}
                onClick={() => setParked((p) => p.filter((x) => x !== id))}
                className="font-mono text-[11px] tracking-[0.14em]"
                style={{ color: C.secondary, minHeight: 36, borderBottom: `1px dashed ${C.hair}` }}
              >
                {a?.label ?? id} · parked
              </button>
            )
          })}
        </div>
      )}

      {lensOpen && (
        <div
          data-ui
          data-lens
          className="absolute bottom-20 left-1/2 z-[60] w-[400px] -translate-x-1/2 border bg-white p-3"
          style={{ borderColor: C.hair, boxShadow: "0 12px 40px rgba(17,21,27,0.12)" }}
        >
          <input
            autoFocus
            value={lensText}
            onChange={(e) => setLensText(e.target.value)}
            placeholder="Research commands"
            className="w-full px-1 pb-2 text-[13px] outline-none"
            style={{ borderBottom: `1px solid ${C.hair}`, minHeight: 36, color: C.ink }}
          />
          <ul className="mt-2">
            {lensItems
              .filter((i) => lensText.trim().length === 0 || i.label.toLowerCase().includes(lensText.toLowerCase()))
              .map((i) => (
                <li key={i.label}>
                  <button
                    type="button"
                    data-lens-item={i.label}
                    onClick={() => {
                      i.run()
                      setLensOpen(false)
                      setLensText("")
                    }}
                    className="w-full px-2 text-left font-mono text-[11.5px] hover:bg-black/[0.04]"
                    style={{ color: C.ink, minHeight: 40 }}
                  >
                    {i.label}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {addAngle !== null && (
        <div
          data-ui
          data-add-angle
          className="absolute left-1/2 top-1/2 z-[60] w-[360px] -translate-x-1/2 -translate-y-1/2 border bg-white p-3"
          style={{ borderColor: C.hair, boxShadow: "0 12px 40px rgba(17,21,27,0.12)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.18em]" style={{ color: C.secondary }}>
            ADD RESEARCH ANGLE
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              autoFocus
              value={addAngle}
              onChange={(e) => setAddAngle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && addAngle.trim()) void addDimension(addAngle.trim())
              }}
              placeholder="例如：库存压力 / 海外业务"
              className="min-w-0 flex-1 pb-1 text-[12.5px] outline-none"
              style={{ borderBottom: `1px solid ${C.hair}`, minHeight: 36 }}
            />
            <button
              type="button"
              data-add-submit
              onClick={() => addAngle.trim() && void addDimension(addAngle.trim())}
              className="rounded-[4px] px-3 text-white"
              style={{ background: C.blue, minHeight: 36 }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes v5-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes v5-sheet-in {
          from { opacity: 0.4; transform: translateX(3%); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </main>
  )
}

/** Evidence annotations（§14：整块可点，命中 ≥36px） */
function Annotations({
  payload,
  anchor,
  hitAreas,
  onOpen,
}: {
  payload: ResearchSpacePayload
  anchor: AnchorSpec
  hitAreas: boolean
  onOpen: () => void
}) {
  const rows = evidenceAnnotations(payload, anchor.dimensionId, 3)
  if (rows.length === 0) return null
  const rowH = 66
  return (
    <div
      data-hit="evidence"
      className="absolute"
      style={{
        left: 372,
        top: -16,
        width: 304,
        animation: "v5-in 260ms ease-out",
        ...(hitAreas ? { outline: "1px dashed rgba(47,102,255,0.6)", outlineOffset: 2 } : {}),
      }}
    >
      <svg aria-hidden width="380" height={rows.length * rowH + 40} className="pointer-events-none absolute" style={{ left: -380, top: 0, overflow: "visible" }}>
        {rows.map((r, i) => {
          const y = 26 + i * rowH
          return (
            <path
              key={r.index}
              d={`M 0 22 C 110 22, 220 ${y - 18}, 380 ${y}`}
              fill="none"
              stroke={r.type === "inference" ? "#9E8FE0" : "#8FA6D8"}
              strokeWidth="0.9"
              opacity="0.8"
            />
          )
        })}
      </svg>
      {rows.map((r) => (
        <button
          key={r.index}
          type="button"
          data-evidence-annotation={r.evidenceId}
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          className="mb-2 flex w-full items-start gap-2.5 rounded-[5px] px-1.5 py-1 text-left hover:bg-black/[0.035]"
          style={{ minHeight: 52 }}
        >
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] border font-mono text-[10.5px]"
            style={{ borderColor: C.hair, background: "rgba(255,255,255,0.72)", color: r.type === "inference" ? C.violet : C.blue }}
          >
            {r.index}
          </span>
          <div className="flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px]" style={{ color: C.ink }}>
                {r.name}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[12.5px]" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                {r.value}
                <TrendGlyph negative={r.value.trim().startsWith("-")} />
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[10px] tracking-[0.12em]" style={{ color: C.secondary }}>
              {r.periodLine || "—"}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

function BarGlyph() {
  return (
    <svg width="12" height="10" aria-hidden>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 4} y={6 - i * 2.4} width="2.4" height={4 + i * 2.4} fill={C.secondary} opacity={0.55} />
      ))}
    </svg>
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

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="6" cy="6" r="4.2" fill="none" stroke={C.secondary} strokeWidth="1.2" />
      <line x1="9.2" y1="9.2" x2="12.4" y2="12.4" stroke={C.secondary} strokeWidth="1.2" />
    </svg>
  )
}
