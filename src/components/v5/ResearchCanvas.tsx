"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import { computeFitCamera, panCamera, screenToWorld, zoomAtPointer, boundsOfObjects, type CameraState } from "@/lib/spatial/camera"
import {
  DESIGN,
  ambientLabels,
  anchorBoxSize,
  buildTrace,
  composeCanvas,
  evidenceAnnotations,
  gatherTargets,
  tierFont,
  type AnchorSpec,
} from "@/lib/v5/canvas"
import {
  apertureRectFor,
  apertureSizeFor,
  fixedExclusionZones,
  rectsIntersect,
  resolveApertureCollisions,
  type Rect,
} from "@/lib/v5/aperture"

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

type AiScopeType = "company" | "dimension" | "claim" | "evidence"

interface AiScope {
  type: AiScopeType
  dimensionId?: string
  claimId?: string
  evidenceId?: string
}

interface AiEntry {
  id: string
  question: string
  scopeType: AiScopeType
  scopeLabel: string
  status: "loading" | "done" | "failed"
  summary?: string
  confirmed?: string[]
  unknowns?: string[]
  evidenceIds: string[]
  message?: string
}

function aiSuggestionsFor(scope: AiScope, payload: ResearchSpacePayload | null): string[] {
  if (!payload) return []
  if (scope.type === "dimension") {
    const dim = payload.dimensions.find((d) => d.dimensionId === scope.dimensionId)
    const dimClaims = payload.claims.filter((c) => c.dimensionId === scope.dimensionId)
    const out: string[] = []
    if (dimClaims.some((c) => c.signal === "conflict")) out.push("这个冲突主要来自什么？")
    out.push("为什么利润增速弱于收入？", "有哪些证据还缺失？")
    void dim
    return out.slice(0, 3)
  }
  if (scope.type === "claim") return ["这个结论最关键的依据是什么？", "有哪些反向信号？"].slice(0, 3)
  if (scope.type === "evidence") return ["这个数值是如何计算的？", "它的口径与期间是什么？"].slice(0, 3)
  return [
    `${payload.company.stockName}现在最值得关注什么？`,
    "估值处于什么位置？",
    "目前有哪些证据不足？",
  ].slice(0, 3)
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
  /** §5：click → Focus Aperture（替代原先的原地堆叠 Peek） */
  const [apertureId, setApertureId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  /** §20：thread 按公司隔离（Map<stockCode, entries>） */
  const [aiThreads, setAiThreads] = useState<Record<string, AiEntry[]>>({})
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInput, setAiInput] = useState("")
  const [aiStatus, setAiStatus] = useState<"idle" | "loading">("idle")
  /** §6：scope 自动来自 activeCompany / dimension / claim / evidence */
  const [aiScopeOverride, setAiScopeOverride] = useState<AiScope | null>(null)
  const [aiDebugOn, setAiDebugOn] = useState(false)
  const aiInputRef = useRef<HTMLTextAreaElement>(null)
  /** 最近一次 Aperture 的客观度量（§43/§49：碰撞前后数量、位移对象数） */
  const [apertureMetrics, setApertureMetrics] = useState<{
    rect: Rect
    displaced: Record<string, { x: number; y: number }>
    collisionsBefore: number
    collisionsAfter: number
    ownClashes: boolean
  } | null>(null)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  /** §9：Aperture 打开时的局部磁性位移（关闭即恢复；不写回 manual） */
  const [displaced, setDisplaced] = useState<Record<string, { x: number; y: number }>>({})
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
      setAiDebugOn(params.get("aiDebug") === "1")
      try {
        const res =
          params.get("live") === "1"
            ? await fetch("/api/research/init", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stockCode: "000333.SZ" }),
              })
            : await fetch(`/api/observatory/fixture?name=${params.get("fixture") ?? "midea-artdirection"}`)
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
  /** 轻量检查目标（hover）；无 hover 时为 null（§1：默认不再自动展开） */
  const activeId = hoverId
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

  const basePos = useCallback((a: AnchorSpec) => positions[a.dimensionId] ?? { x: a.x, y: a.y }, [positions])
  const anchorPos = useCallback(
    (a: AnchorSpec) => displaced[a.dimensionId] ?? basePos(a),
    [displaced, basePos],
  )

  // ---------- Focus Aperture（§5–§11/§29–§32） ----------
  const closeAperture = useCallback(() => {
    setApertureId(null)
    setDisplaced({})
    setMenuOpen(false)
    setAsk(null)
  }, [])

  /** 世界坐标 ↔ 屏幕坐标（camera 数学） */
  const toScreenRect = useCallback(
    (r: Rect): Rect => ({
      x: (r.x - camera.x) * camera.scale + viewport.width / 2,
      y: (r.y - camera.y) * camera.scale + viewport.height / 2,
      width: r.width * camera.scale,
      height: r.height * camera.scale,
    }),
    [camera, viewport],
  )
  const toWorldPoint = useCallback(
    (p: { x: number; y: number }) => ({
      x: camera.x + (p.x - viewport.width / 2) / camera.scale,
      y: camera.y + (p.y - viewport.height / 2) / camera.scale,
    }),
    [camera, viewport],
  )

  const openAperture = useCallback(
    (a: AnchorSpec) => {
      const zones = fixedExclusionZones(viewport)
      const size = apertureSizeFor(viewport)
      const pos = basePos(a)
      const box = anchorBoxSize(a.label, a.tier)
      const anchorRectScreen = toScreenRect({ x: pos.x, y: pos.y, width: box.width, height: box.height })
      const apertureScreen = apertureRectFor({ anchorRect: anchorRectScreen, size, viewport, fixedExclusionZones: zones })
      const result = resolveApertureCollisions({
        aperture: apertureScreen,
        dimensions: anchors
          .filter((x) => x.dimensionId !== a.dimensionId && !parked.includes(x.dimensionId))
          .map((x) => {
            const p = positions[x.dimensionId] ?? { x: x.x, y: x.y }
            const b = anchorBoxSize(x.label, x.tier)
            return {
              id: x.dimensionId,
              rect: toScreenRect({ x: p.x, y: p.y, width: b.width, height: b.height }),
              manual: positions[x.dimensionId],
            }
          }),
        fixedExclusionZones: zones,
        viewport,
      })
      const displacedWorld: Record<string, { x: number; y: number }> = {}
      for (const [id, pt] of Object.entries(result.displaced)) displacedWorld[id] = toWorldPoint(pt)
      const originWorld = toWorldPoint({ x: apertureScreen.x, y: apertureScreen.y })
      const apertureWorld: Rect = {
        x: originWorld.x,
        y: originWorld.y,
        width: apertureScreen.width / camera.scale,
        height: apertureScreen.height / camera.scale,
      }
      result.displaced = displacedWorld
      const ownClashes = zones.some((z) =>
        rectsIntersect({ x: apertureScreen.x, y: apertureScreen.y, width: apertureScreen.width, height: apertureScreen.height }, z, 0),
      )
      setApertureMetrics({
        rect: apertureWorld,
        displaced: result.displaced,
        collisionsBefore: result.collisionsBefore,
        collisionsAfter: result.collisionsAfter,
        ownClashes,
      })
      setDisplaced(result.displaced)
      setApertureId(a.dimensionId)
      setMenuOpen(false)
      setAsk(null)
    },
    [viewport, basePos, anchors, parked, positions, toScreenRect, toWorldPoint, camera.scale],
  )

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
        if (lensOpen) { setLensOpen(false); return }
        if (aiOpen) { setAiOpen(false); return }
        closeAperture()
        setSuggestOpen(null)
        setAsk(null)
        setAddAngle(null)
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault()
        focusAiLens(null)
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
      if (!anchorEl && !e.shiftKey) {
        // §18：点击空白 → 关闭 Aperture 并恢复被位移对象
        if (apertureId) closeAperture()
      }
      if (anchorEl && !spaceRef.current) {
        const id = anchorEl.getAttribute("data-anchor-id")!
        const a = anchors.find((x) => x.dimensionId === id)
        const pos = positions[id] ?? { x: a?.x ?? 0, y: a?.y ?? 0 }
        const world = screenToWorld(camera, viewport, e.clientX - rect.left, e.clientY - rect.top)
        // §26：拖动选中对象时关闭 Aperture（拖动结束后不自动重开）
        if (apertureId === id) closeAperture()
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
        // §25：多选优先，先关闭 Aperture
        closeAperture()
        const local = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        marqueeRef.current = { x0: local.x, y0: local.y, x1: local.x, y1: local.y }
        setMarquee(marqueeRef.current)
        return
      }
      panRef.current = { lastX: e.clientX, lastY: e.clientY }
      setGrabbing(true)
    },
    [anchors, positions, camera, viewport, apertureId, closeAperture],
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
        // §17/§18：位移 ≤ 5px = click → 打开 Focus Aperture（关闭旧的、恢复旧位移）
        const target = anchors.find((a) => a.dimensionId === dd.id)
        if (target) {
          if (apertureId === dd.id) closeAperture()
          else openAperture(target)
        }
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
  }, [camera, viewport, anchors, positions, apertureId, openAperture, closeAperture])

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

  const park = useCallback(
    (dimensionId: string) => {
      setParked((p) => (p.includes(dimensionId) ? p : [...p, dimensionId]))
      closeAperture()
    },
    [closeAperture],
  )

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
        // §6：新维度原地转为 ready/partial/unknown；不自动打开 Aperture（保持标签可见）
        setApertureId(null)
        setDisplaced({})
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
      setDisplaced({})
      setApertureId(null)
      setAsk(null)
    },
    [anchorPos],
  )

  // ---------- §7/§8：scope 自动推导 + 唯一 handleAskAI ----------
  const aiScope: AiScope = useMemo(() => {
    if (aiScopeOverride) return aiScopeOverride
    if (readingEvidenceId) return { type: "evidence", evidenceId: readingEvidenceId }
    if (readingId) return { type: "dimension", dimensionId: readingId }
    if (apertureId) return { type: "dimension", dimensionId: apertureId }
    return { type: "company" }
  }, [aiScopeOverride, readingEvidenceId, readingId, apertureId])

  const scopeEvidenceIds = useCallback(
    (scope: AiScope): string[] => {
      if (!payload) return []
      if (scope.type === "evidence" && scope.evidenceId) return [scope.evidenceId]
      if (scope.type === "claim" && scope.claimId) {
        return payload.claims.find((c) => c.claimId === scope.claimId)?.evidenceIds ?? []
      }
      if (scope.type === "dimension" && scope.dimensionId) {
        return payload.dimensions.find((d) => d.dimensionId === scope.dimensionId)?.evidenceIds.slice(0, 6) ?? []
      }
      return payload.evidence.slice(0, 6).map((e) => e.evidenceId)
    },
    [payload],
  )

  const scopeLabel = useCallback(
    (scope: AiScope): string => {
      if (!payload) return ""
      const company = payload.company.stockName
      if (scope.type === "evidence" && scope.evidenceId) {
        const dim = payload.evidence.find((e) => e.evidenceId === scope.evidenceId)?.dimension
        return `${dim ? dim + " / " : ""}Evidence`
      }
      if (scope.type === "claim" && scope.claimId) {
        const claim = payload.claims.find((c) => c.claimId === scope.claimId)
        const label = claim ? payload.dimensions.find((d) => d.dimensionId === claim.dimensionId)?.label ?? "" : ""
        return `${label} / Claim`
      }
      if (scope.type === "dimension" && scope.dimensionId) {
        return `${company} / ${payload.dimensions.find((d) => d.dimensionId === scope.dimensionId)?.label ?? ""}`
      }
      return company
    },
    [payload],
  )

  const scopePlaceholder = useCallback((): string => {
    if (!payload) return "问 StockLens…"
    if (aiScope.type === "evidence") return "询问这条证据…"
    if (aiScope.type === "claim") return "追问这条结论…"
    if (aiScope.type === "dimension") {
      const label = payload.dimensions.find((d) => d.dimensionId === aiScope.dimensionId)?.label ?? ""
      return `追问「${label}」…`
    }
    return `问 StockLens 关于${payload.company.stockName}的问题…`
  }, [payload, aiScope])

  /** §8：唯一 AI handler。§9：直接复用 POST /api/followup（无 /api/v5、无 mock） */
  const handleAskAI = useCallback(
    async (question: string, scope: AiScope) => {
      const q = question.trim()
      if (!payload || q.length === 0) return
      const stockCode = payload.company.stockCode
      const evidenceIds = scopeEvidenceIds(scope)
      const entry: AiEntry = {
        id: `ai-${Date.now()}`,
        question: q,
        scopeType: scope.type,
        scopeLabel: scopeLabel(scope),
        status: "loading",
        evidenceIds,
      }
      setAiThreads((t) => ({ ...t, [stockCode]: [...(t[stockCode] ?? []), entry] }))
      setAiInput("")
      setAiStatus("loading")
      setAiOpen(true)
      try {
        const res = await fetch("/api/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockCode, question: q, evidenceIds }),
        })
        const body = await res.json()
        const patch = (updates: Partial<AiEntry>) =>
          setAiThreads((t) => ({
            ...t,
            [stockCode]: (t[stockCode] ?? []).map((x) => (x.id === entry.id ? { ...x, ...updates } : x)),
          }))
        if (!res.ok) {
          patch({ status: "failed", message: body?.error ?? `服务返回 ${res.status}` })
          return
        }
        if (body.mode === "compliance_redirect") {
          patch({ status: "done", summary: body.compliance?.message ?? "不提供买卖建议。" })
          return
        }
        const syn = body.synthesis
        patch({
          status: "done",
          summary: syn?.summary?.text,
          confirmed: (syn?.confirmedFacts ?? []).map((x: { text: string; evidenceIds?: string[] }) => x.text),
          unknowns: (syn?.unknowns ?? []).map((x: { text: string }) => x.text),
        })
      } catch {
        setAiThreads((t) => ({
          ...t,
          [stockCode]: (t[stockCode] ?? []).map((x) =>
            x.id === entry.id ? { ...x, status: "failed", message: "AI interpretation is temporarily unavailable." } : x,
          ),
        }))
      } finally {
        setAiStatus("idle")
      }
    },
    [payload, scopeEvidenceIds, scopeLabel],
  )

  /** §23–§25：所有 Ask 入口只改变 scope 并聚焦同一个 Lens */
  const focusAiLens = useCallback((scope: AiScope | null, preset?: string) => {
    setAiScopeOverride(scope)
    setAiOpen(true)
    if (preset !== undefined) setAiInput(preset)
    window.setTimeout(() => aiInputRef.current?.focus(), 60)
  }, [])

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
      setApertureId(null)
      setDisplaced({})
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
        { label: `Focus selected (${selection.length})`, run: () => { closeAperture(); setFocusSet(true) } },
        {
          label: "Gather",
          run: () => {
            closeAperture()
            setPositions((p) => {
              const targets = gatherTargets(selection)
              return { ...p, ...(targets as Record<string, { x: number; y: number }>) }
            })
          },
        },
        {
          label: "Spread",
          run: () => {
            closeAperture()
            setPositions((p) => {
              const next = { ...p }
              selection.forEach((id) => delete next[id])
              return next
            })
          },
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
  }, [selection, active, focalId, parked, fitAll, openReading, pinNote, park, closeAperture])

  useEffect(() => {
    addDimensionRef.current = addDimension
  }, [addDimension])

  // ---- derived ----
  const transform = `translate3d(${-camera.x * camera.scale}px, ${-camera.y * camera.scale}px, 0) scale(${camera.scale})`
  const zoomPct = Math.round(camera.scale * 100)
  const panelW = readingId ? Math.round(Math.max(viewport.width * 0.3, 300)) : viewport.width
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
    <main className="relative h-screen w-screen select-none overflow-hidden overflow-x-hidden" style={{ background: C.bg, color: C.ink }}>
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
                const isActive = activeId === a.dimensionId || apertureId === a.dimensionId
                return (
                  <g key={a.dimensionId}>
                    {trace.edges.map((e, i) => (
                      <path
                        key={i}
                        d={e.path}
                        fill="none"
                        stroke={isActive ? "#6F87B5" : C.ink}
                        strokeWidth={isActive ? 1.1 : 0.8}
                        opacity={isActive ? 0.5 : 0.05}
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
                          opacity={isReadingEvidence ? 1 : isActive ? 0.75 : 0.06}
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
                  opacity: focusDim ? FOCUS_DIM : othersDim ? 0.36 : isActive ? 1 : 0.92,
                  transition: "opacity 320ms ease-out",
                  zIndex: isActive || selected ? 20 : 10,
                  padding: "14px 20px 16px 0",
                  marginLeft: -10,
                  width: "max-content",
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
                    transform: `scale(${isActive ? 1.08 : 1})`,
                    transformOrigin: "left top",
                    transition: "transform 320ms cubic-bezier(0.22,1,0.36,1)",
                    display: apertureId === a.dimensionId ? "none" : undefined,
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



                  {/* §3：hover 轻量——一句摘要 + ≤2 条微证据（无动作行、无长 leader） */}
                  {isActive && hoverId === a.dimensionId && (
                    <div className="mt-2.5 w-[290px]" style={{ animation: "v5-in 200ms ease-out" }}>
                      {summary && !isUnknown && (
                        <p className="text-[12.5px] leading-relaxed" style={{ color: C.secondary }}>
                          {trimSummary(summary, 42)}
                        </p>
                      )}
                      {!isUnknown && payload && (
                        <div className="mt-2 space-y-1">
                          {evidenceAnnotations(payload, a.dimensionId, 2).map((r) => (
                            <div key={r.index} className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
                              <span style={{ color: C.secondary }}>{r.name}</span>
                              <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {isUnknown && dim?.missingInformation && (
                        <ul className="space-y-0.5">
                          {dim.missingInformation.slice(0, 2).map((m) => (
                            <li key={m} className="font-mono text-[10.5px]" style={{ color: C.amber }}>
                              · {m}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )
          })}

          {/* Focus Aperture（§5–§14/§33）：专属排除区 + 半透明白面，非 SaaS 卡 */}
          {apertureId && apertureMetrics && (() => {
            const a = anchors.find((x) => x.dimensionId === apertureId)
            if (!a) return null
            const f = tierFont(a.tier)
            const summary = payload?.claims.find((c) => c.dimensionId === a.dimensionId && c.type !== "unknown")?.text ?? ""
            const rows = payload ? evidenceAnnotations(payload, a.dimensionId, 3) : []
            const missing = payload?.dimensions.find((d) => d.dimensionId === a.dimensionId)?.missingInformation ?? []
            return (
              <div
                data-aperture={a.dimensionId}
                data-collisions-before={apertureMetrics.collisionsBefore}
                data-collisions-after={apertureMetrics.collisionsAfter}
                data-displaced-count={Object.keys(apertureMetrics.displaced).length}
                className="absolute"
                style={{
                  left: apertureMetrics.rect.x,
                  top: apertureMetrics.rect.y,
                  width: apertureMetrics.rect.width,
                  minHeight: apertureMetrics.rect.height,
                  zIndex: 30,
                  background: "rgba(255,255,255,0.62)",
                  border: "1px solid rgba(17,21,27,0.06)",
                  padding: "16px 20px 14px",
                  animation: "v5-aperture-in 380ms cubic-bezier(0.22,1,0.36,1)",
                  transition: "left 400ms cubic-bezier(0.22,1,0.36,1), top 400ms cubic-bezier(0.22,1,0.36,1)",
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between">
                  <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: C.secondary }}>
                    {a.index} / {a.tier.toUpperCase()}
                  </div>
                  <button
                    type="button"
                    data-aperture-menu
                    onClick={() => setMenuOpen((v) => !v)}
                    className="px-2 leading-none"
                    style={{ color: C.secondary, minWidth: 36, minHeight: 36 }}
                    title="More"
                  >
                    •••
                  </button>
                </div>
                <div className="mt-1 font-medium leading-tight tracking-[-0.01em]" style={{ fontSize: f.size + 4, color: C.ink }}>
                  {a.label}
                </div>
                {a.status === "unknown" ? (
                  <ul className="mt-3 space-y-1 text-[12.5px] leading-relaxed" style={{ color: C.secondary }}>
                    <li style={{ color: C.amber }}>Evidence incomplete</li>
                    {missing.slice(0, 4).map((m) => (
                      <li key={m}>· {m}</li>
                    ))}
                  </ul>
                ) : (
                  <>
                    {summary && (
                      <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: C.secondary }}>
                        {trimSummary(summary, 58)}
                      </p>
                    )}
                    <div className="mt-3 space-y-1.5">
                      {rows.map((r) => (
                        <div key={r.index} className="flex items-baseline justify-between gap-4">
                          <span className="text-[12px]" style={{ color: C.secondary, whiteSpace: "nowrap" }}>
                            {r.name}
                          </span>
                          <span className="font-mono text-[12.5px]" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                            {r.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  data-aperture-explore
                  onClick={() => openReading(a)}
                  className="mt-3 rounded-[4px] px-3.5 font-mono text-[11px] tracking-[0.06em] text-white"
                  style={{ background: C.blue, minHeight: 40 }}
                >
                  Explore research →
                </button>

                {ask?.anchorId === a.dimensionId && (
                  <div className="mt-3 border-t pt-2.5" style={{ borderColor: C.hair }}>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={ask.question}
                        onChange={(e) => setAsk({ ...ask, question: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void runAsk(a)
                        }}
                        placeholder="沿这个研究角度继续问…"
                        className="min-w-0 flex-1 bg-transparent pb-1 text-[12.5px] outline-none"
                        style={{ borderBottom: `1px solid ${C.hair}`, minHeight: 34 }}
                      />
                      <button
                        type="button"
                        onClick={() => void runAsk(a)}
                        className="rounded-[4px] px-3 text-white"
                        style={{ background: C.blue, minHeight: 34 }}
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

                {menuOpen && (
                  <div
                    data-aperture-context-menu
                    className="absolute right-3 top-12 w-[168px] border bg-white py-1"
                    style={{ borderColor: C.hair, zIndex: 40, boxShadow: "0 8px 24px rgba(17,21,27,0.10)" }}
                  >
                    {[
                      { label: "Pin summary", key: "pin", run: () => pinNote(a) },
                      { label: "Ask about this", key: "ask", run: () => focusAiLens({ type: "dimension", dimensionId: a.dimensionId }) },
                      { label: "Park", key: "park", run: () => park(a.dimensionId) },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        data-menu-item={item.key}
                        onClick={() => {
                          item.run()
                          setMenuOpen(false)
                        }}
                        className="block w-full px-3 text-left font-mono text-[11px] hover:bg-black/[0.04]"
                        style={{ color: C.ink, minHeight: 36 }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

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
            onAsk={(claimId) => focusAiLens({ type: "claim", claimId })}
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
            className="pointer-events-auto absolute left-8 top-16 font-mono text-[11px] tracking-[0.14em]"
            style={{ color: C.secondary, minHeight: 36 }}
          >
            ← {payload.company.stockName} / <span style={{ color: C.ink }}>{readingDimension?.label}</span>
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

      {/* §2/§37：AI Research Lens（真输入框；与 Command Palette 分离） */}
      <div
        data-ui
        data-ai-lens
        className="absolute bottom-6 z-[55] flex items-center gap-3 rounded-full border px-4 backdrop-blur"
        style={{
          left: readingId ? panelW / 2 : viewport.width / 2,
          transform: "translateX(-50%)",
          width: 580,
          height: 50,
          borderColor: C.hair,
          background: "rgba(255,255,255,0.86)",
        }}
      >
        <span aria-hidden style={{ color: C.blue }}>
          ✦
        </span>
        <span className="font-mono text-[10px] tracking-[0.14em]" style={{ color: C.secondary, whiteSpace: "nowrap" }}>
          {payload ? scopeLabel(aiScope) : ""}
        </span>
        <textarea
          ref={aiInputRef}
          rows={1}
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          onFocus={() => setAiOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void handleAskAI(aiInput, aiScope)
            }
            if (e.key === "Enter" && e.shiftKey) return
          }}
          placeholder={scopePlaceholder()}
          className="min-w-0 flex-1 resize-none bg-transparent py-3 text-[12.5px] outline-none"
          style={{ color: C.ink, maxHeight: 44 }}
          aria-label="AI Research Lens"
        />
        <button
          type="button"
          data-ai-send
          onClick={() => void handleAskAI(aiInput, aiScope)}
          className="font-mono text-[12px]"
          style={{ color: aiInput.trim() ? C.blue : C.secondary, minWidth: 28, minHeight: 36 }}
          title="Send (Enter)"
        >
          ↵
        </button>
        <button
          type="button"
          data-command-hint
          onClick={() => setLensOpen(true)}
          className="font-mono text-[10px] tracking-[0.12em]"
          style={{ color: C.secondary, opacity: 0.75, minHeight: 36, whiteSpace: "nowrap" }}
        >
          ⌘K Commands
        </button>
      </div>

      {/* §30：聚焦后的建议问题（最多 3，随 scope 变化） */}
      {aiOpen && aiInput.length === 0 && aiStatus === "idle" && (
        <div
          data-ui
          data-ai-suggestions
          className="absolute z-[55] flex flex-col gap-1"
          style={{ left: readingId ? panelW / 2 : viewport.width / 2, transform: "translateX(-50%)", bottom: 68, width: 580 }}
        >
          {aiSuggestionsFor(aiScope, payload).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => focusAiLens(aiScope, q)}
              className="w-fit rounded-full border px-3 text-left font-mono text-[11px] backdrop-blur"
              style={{ borderColor: C.hair, background: "rgba(255,255,255,0.8)", color: C.secondary, minHeight: 30 }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* §14/§15：Research Thread（editorial；向上展开；单一 thread 模型） */}
      {aiOpen && payload && (aiThreads[payload.company.stockCode]?.length ?? 0) > 0 && (
        <div
          data-ui
          data-ai-thread
          className="absolute z-[54] overflow-y-auto border px-5 py-4"
          style={{
            left: readingId ? Math.min(panelW / 2, viewport.width / 2 - 300) : viewport.width / 2 - 320,
            bottom: 108,
            width: 640,
            maxHeight: 366,
            borderColor: C.hair,
            background: "rgba(255,255,255,0.94)",
          }}
        >
          {aiThreads[payload.company.stockCode].map((entry, i, arr) => (
            <div key={entry.id} className="mb-4 last:mb-0">
              {i > 0 && arr[i - 1].scopeLabel !== entry.scopeLabel && (
                <div className="mb-2 font-mono text-[9.5px] tracking-[0.18em]" style={{ color: C.secondary, opacity: 0.8 }}>
                  CONTEXT CHANGED → {entry.scopeLabel}
                </div>
              )}
              <p className="text-[13px] font-medium" style={{ color: C.ink }}>
                {entry.question}
              </p>
              <div className="mt-1.5 h-px w-full" style={{ background: C.hair }} />
              {entry.status === "loading" && (
                <p className="mt-2 font-mono text-[11px]" style={{ color: C.secondary }}>
                  Reviewing current evidence…
                </p>
              )}
              {entry.status === "failed" && (
                <p className="mt-2 text-[12px] leading-relaxed" style={{ color: C.secondary }}>
                  AI interpretation is temporarily unavailable. Current evidence remains available.
                </p>
              )}
              {entry.status === "done" && (
                <div className="mt-2 space-y-2 text-[12.5px] leading-relaxed" style={{ color: C.secondary }}>
                  {entry.summary && <p style={{ color: C.ink }}>{entry.summary}</p>}
                  {entry.confirmed?.length ? (
                    <div>
                      <div className="font-mono text-[9.5px] tracking-[0.18em]">可以确认</div>
                      {entry.confirmed.slice(0, 3).map((c, j) => (
                        <p key={j} className="mt-0.5">
                          {c}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {entry.unknowns?.length ? (
                    <div>
                      <div className="font-mono text-[9.5px] tracking-[0.18em]">暂时不能确认</div>
                      {entry.unknowns.slice(0, 2).map((c, j) => (
                        <p key={j} className="mt-0.5">
                          {c}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {/* §16：回答内 Evidence anchors 可点 → Canvas 高亮 + Inspector */}
                  {entry.evidenceIds.length > 0 && (
                    <div className="flex items-center gap-2 pt-0.5">
                      {entry.evidenceIds.slice(0, 4).map((id, j) => (
                        <button
                          key={id}
                          type="button"
                          data-ai-anchor={id}
                          onClick={() => {
                            setReadingEvidenceId(id)
                            const ev = payload.evidence.find((e) => e.evidenceId === id)
                            if (ev) {
                              const dim = payload.dimensions.find((d) => d.label === ev.dimension)
                              if (dim) {
                                setReadingId(dim.dimensionId)
                                return
                              }
                            }
                          }}
                          className="font-mono text-[13px]"
                          style={{ color: C.blue, minWidth: 24, minHeight: 28 }}
                          title={id}
                        >
                          {["①", "②", "③", "④"][j]}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setAiOpen(false)}
                        className="ml-auto font-mono text-[10px]"
                        style={{ color: C.secondary, minHeight: 28 }}
                      >
                        Collapse
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* §52：?aiDebug=1 */}
      {aiDebugOn && (
        <div
          className="pointer-events-none absolute bottom-24 left-8 z-[70] rounded border px-3 py-2 font-mono text-[10px] leading-relaxed"
          data-ai-debug
          style={{ borderColor: C.hair, background: "rgba(255,255,255,0.92)", color: C.secondary }}
        >
          <div>scope: {aiScope.type}</div>
          <div>stockCode: {payload?.company.stockCode ?? "—"}</div>
          <div>dimensionId: {aiScope.dimensionId ?? "—"}</div>
          <div>claimId: {aiScope.claimId ?? "—"}</div>
          <div>evidenceId: {aiScope.evidenceId ?? "—"}</div>
          <div>followup: {aiStatus === "loading" ? "in-flight" : (aiThreads[payload?.company.stockCode ?? ""]?.slice(-1)[0]?.status ?? "idle")}</div>
        </div>
      )}

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
        @keyframes v5-aperture-in {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes v5-sheet-in {
          from { opacity: 0.4; transform: translateX(3%); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </main>
  )
}

/** 摘要截断：优先在句读处收束，不留半个括号（§35 可读性） */
function trimSummary(text: string, limit: number): string {
  const cleaned = text.replace(/（[^）]*）\s*$/, "").trim()
  if (cleaned.length <= limit) return cleaned
  const cut = cleaned.slice(0, limit)
  const lastPunct = Math.max(cut.lastIndexOf("，"), cut.lastIndexOf("；"), cut.lastIndexOf("。"))
  const base = lastPunct > limit * 0.45 ? cut.slice(0, lastPunct) : cut
  return `${base}。`
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
