"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { IDENTITY_CAMERA, computeFitCamera, isCameraDeviated, panCamera, screenToWorld, worldToScreen, zoomAtPointer, boundsOfObjects, type CameraState } from "@/lib/spatial/camera"
import { V3_PALETTE, paintCoolMedia } from "@/lib/v3/media"
import { SCENE, WORLD, assignSlots, gatherTargets, tierStyle, type ObjectSlot } from "@/lib/v3/layout"
import { loadWorld, saveWorld, withVisitedCompany, worldCompanies } from "@/lib/world/my-world"
import type { LocalResearchWorld } from "@/lib/world/types"
import type { ResearchSpacePayload } from "@/components/observatory/theme"

// Editorial Research Canvas（Task 15.2 UI RESET）：/observatory-v3。
// 照搬 Cosmos 语法（冷白 field + 非等大对象随手散布 + 对象即入口），交互内核沿用既有实现
// （camera 数学 / 拖拽仲裁 / marquee / 语义层）。生产 /observatory 不在此文件内改动。

const ReadingV3 = dynamic(() => import("./ReadingV3"), { ssr: false })

/** fixture 即真实 API 响应形态（midea-artdirection 由真实载荷合成） */
type FixturePayload = ResearchSpacePayload
interface PinnedNote {
  id: string
  title: string
  summary: string
  claims: { text: string; type: string; signal: string }[]
  x: number
  y: number
  collapsed: boolean
}

type View = { kind: "world" } | { kind: "reading"; dimensionId: string; claimId: string | null } | { kind: "myworld" }

const INDUSTRY_EN: Record<string, string> = { 白色家电: "WHITE GOODS" }

/** 世界坐标 → 屏幕（供 marquee/hit test） */
function objectRect(slot: ObjectSlot): { x: number; y: number; width: number; height: number } {
  return { x: slot.x, y: slot.y, width: slot.w, height: slot.h }
}

export default function ObservatoryV3() {
  const [payload, setPayload] = useState<FixturePayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>({ kind: "world" })
  const [camera, setCamera] = useState<CameraState>({ ...IDENTITY_CAMERA })
  const [viewport, setViewport] = useState({ width: 1440, height: 900 })
  const [manual, setManual] = useState<Record<string, { x: number; y: number }>>({})
  const [selection, setSelection] = useState<string[]>([])
  const [focusSet, setFocusSet] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [peekId, setPeekId] = useState<string | null>(null)
  const [parked, setParked] = useState<string[]>([])
  const [notes, setNotes] = useState<PinnedNote[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandText, setCommandText] = useState("")
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [flipFrom, setFlipFrom] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [localWorld, setLocalWorld] = useState<LocalResearchWorld>({ recentCompanies: [], savedCompanies: [] })
  const [sceneIndex, setSceneIndex] = useState(0)
  const [loadingTarget, setLoadingTarget] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ kind: "pan" | "object" | "marquee" | "note" | "suggest"; id?: string; lastX: number; lastY: number; moved: boolean } | null>(null)
  const addDimensionRef = useRef<((text: string) => Promise<void>) | null>(null)
  const noteDragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const shiftRef = useRef(false)
  const [suggestDragPos, setSuggestDragPos] = useState<{ label: string; x: number; y: number } | null>(null)
  const [dragKind, setDragKind] = useState<string | null>(null)
  const hydratedRef = useRef(false)

  // ---------- fixture / query ----------
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

  useEffect(() => {
    if (hydratedRef.current) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      hydratedRef.current = true
      setLocalWorld(loadWorld())
    })()
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    if (hydratedRef.current) saveWorld(localWorld)
  }, [localWorld])

  // ---------- 布局 ----------
  const slots = useMemo(() => (payload ? assignSlots(payload.dimensions) : []), [payload])
  const slotById = useMemo(() => new Map(slots.map((s) => [s.dimensionId, s.slot])), [slots])

  // 初始 fit（§36）
  useEffect(() => {
    if (slots.length === 0) return
    let cancelled = false
    void (async () => {
      await Promise.resolve() // 异步边界：避免 effect 内同步 setState
      if (cancelled) return
      const bounds = boundsOfObjects(slots.map((s) => objectRect(s.slot)))
      if (bounds) setCamera(computeFitCamera(bounds, viewport, 180))
    })()
    return () => {
      cancelled = true
    }
  }, [slots, viewport])

  const fit = useCallback(() => {
    const bounds = boundsOfObjects(slots.map((s) => objectRect(s.slot)))
    if (bounds) setCamera(computeFitCamera(bounds, viewport, 180))
  }, [slots, viewport])

  const resetLayout = useCallback(() => {
    setManual({})
    setFocusSet(false)
    setSelection([])
    setParked([])
    fit()
  }, [fit])

  const gather = useCallback(() => {
    if (selection.length === 0) return
    const targets = gatherTargets(selection)
    setManual((m) => ({ ...m, ...targets }))
    fit()
  }, [selection, fit])

  const spread = useCallback(() => {
    setManual({})
    fit()
  }, [fit])

  const positionOf = useCallback(
    (dimensionId: string, slot: ObjectSlot) => manual[dimensionId] ?? { x: slot.x, y: slot.y },
    [manual],
  )

  // ---------- 相机交互 ----------
  const toScreen = useCallback(
    (wx: number, wy: number) => worldToScreen(camera, viewport, wx, wy),
    [camera, viewport],
  )

  const pickObjectAt = useCallback(
    (clientX: number, clientY: number): string | null => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return null
      const local = { x: clientX - rect.left, y: clientY - rect.top }
      const world = screenToWorld(camera, viewport, local.x, local.y)
      // 逆序遍历（后绘制的在上层）
      for (let i = slots.length - 1; i >= 0; i--) {
        const { dimensionId, slot } = slots[i]
        const p = manual[dimensionId] ?? { x: slot.x, y: slot.y }
        if (Math.abs(world.x - p.x) <= slot.w / 2 && Math.abs(world.y - p.y) <= slot.h / 2) return dimensionId
      }
      return null
    },
    [slots, manual, camera, viewport],
  )

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const factor = Math.exp(-e.deltaY * 0.0016)
      setCamera((c) => zoomAtPointer(c, viewport, { x: e.clientX - rect.left, y: e.clientY - rect.top }, factor))
    },
    [viewport],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const local = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      shiftRef.current = e.shiftKey
      const objId = pickObjectAt(e.clientX, e.clientY)
      const noteEl = (e.target as HTMLElement).closest("[data-note-id]") as HTMLElement | null
      const suggestEl = (e.target as HTMLElement).closest("[data-suggest-label]") as HTMLElement | null
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // 合成事件下可能失败，不影响主流程
      }
      if (noteEl) {
        setDragKind("note")
        const id = noteEl.getAttribute("data-note-id")!
        const note = notes.find((n) => n.id === id)
        if (!note) return
        const world = screenToWorld(camera, viewport, local.x, local.y)
        dragRef.current = { kind: "note", id, lastX: e.clientX, lastY: e.clientY, moved: false }
        noteDragRef.current = { id, dx: world.x - note.x, dy: world.y - note.y }
        return
      }
      if (suggestEl) {
        setDragKind("suggest")
        const label = suggestEl.getAttribute("data-suggest-label")!
        dragRef.current = { kind: "suggest", id: label, lastX: e.clientX, lastY: e.clientY, moved: false }
        return
      }
      // shift + 点对象 = 多选切换（§2 Multi-select）
      if (objId && e.shiftKey) {
        setSelection((sel) => (sel.includes(objId) ? sel.filter((x) => x !== objId) : [...sel, objId]))
        return
      }
      if (objId) {
        setDragKind("object")
        const slot = slotById.get(objId)
        if (!slot) return
        const world = screenToWorld(camera, viewport, local.x, local.y)
        const pos = positionOf(objId, slot)
        dragRef.current = { kind: "object", id: objId, lastX: e.clientX, lastY: e.clientY, moved: false }
        ;(containerRef.current as unknown as { __objOffset?: { x: number; y: number } }).__objOffset = {
          x: world.x - pos.x,
          y: world.y - pos.y,
        }
        return
      }
      shiftRef.current = e.shiftKey
      if (e.shiftKey) {
        setDragKind("marquee")
        dragRef.current = { kind: "marquee", lastX: e.clientX, lastY: e.clientY, moved: false }
        setMarquee({ x0: local.x, y0: local.y, x1: local.x, y1: local.y })
        return
      }
      setPeekId(null)
      setDragKind("pan")
      dragRef.current = { kind: "pan", lastX: e.clientX, lastY: e.clientY, moved: false }
    },
    [pickObjectAt, notes, camera, viewport, slotById, positionOf],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = e.clientX - drag.lastX
      const dy = e.clientY - drag.lastY
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const local = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      if (drag.kind === "pan") {
        setCamera((c) => panCamera(c, dx, dy))
        drag.lastX = e.clientX
        drag.lastY = e.clientY
        return
      }
      if (drag.kind === "object" && drag.id) {
        const offset = (containerRef.current as unknown as { __objOffset?: { x: number; y: number } }).__objOffset ?? { x: 0, y: 0 }
        const world = screenToWorld(camera, viewport, local.x, local.y)
        setManual((m) => ({ ...m, [drag.id!]: { x: world.x - offset.x, y: world.y - offset.y } }))
        return
      }
      if (drag.kind === "marquee") {
        setMarquee((mq) => (mq ? { ...mq, x1: local.x, y1: local.y } : mq))
        return
      }
      if (drag.kind === "note" && drag.id) {
        const nd = noteDragRef.current
        if (!nd) return
        const world = screenToWorld(camera, viewport, local.x, local.y)
        setNotes((ns) => ns.map((n) => (n.id === drag.id ? { ...n, x: world.x - nd.dx, y: world.y - nd.dy } : n)))
        return
      }
      if (drag.kind === "suggest" && drag.id) {
        setSuggestDragPos({ label: drag.id, x: e.clientX - rect.left, y: e.clientY - rect.top })
        return
      }
    },
    [camera, viewport],
  )

  const onPointerUp = useCallback(
    () => {
      const drag = dragRef.current
      dragRef.current = null
      setDragKind(null)
      noteDragRef.current = null
      if (!drag) return
      // 对象点击（pointer capture 会吞掉原生 click，这里做判定）
      if (drag.kind === "object" && drag.id && !drag.moved) {
        if (shiftRef.current) {
          setSelection((sel) => (sel.includes(drag.id!) ? sel.filter((x) => x !== drag.id) : [...sel, drag.id!]))
        } else {
          setPeekId((cur) => (cur === drag.id ? null : drag.id!))
        }
        return
      }
      if (drag.kind === "marquee" && marquee) {
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const a = screenToWorld(camera, viewport, marquee.x0, marquee.y0)
          const b = screenToWorld(camera, viewport, marquee.x1, marquee.y1)
          const hit = slots
            .filter(({ dimensionId, slot }) => {
              const p = positionOf(dimensionId, slot)
              return (
                p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
              )
            })
            .map((s) => s.dimensionId)
          if (hit.length > 0) setSelection(hit)
        }
        setMarquee(null)
        return
      }
      if (drag.kind === "suggest" && drag.id && suggestDragPos) {
        // 拖入主 field（中部区域）→ 触发既有 Add 逻辑（§61）
        const inField = suggestDragPos.x > viewport.width * 0.18 && suggestDragPos.x < viewport.width * 0.9 && suggestDragPos.y > viewport.height * 0.12
        setSuggestDragPos(null)
        if (inField) {
          setDismissed((d) => [...d, drag.id!])
          void addDimensionRef.current?.(drag.id!)
        }
        return
      }
      setSuggestDragPos(null)
    },
    [marquee, camera, viewport, slots, positionOf, suggestDragPos],
  )

  // ---------- Add dimension（既有 Add API，§61） ----------
  const addDimension = useCallback(
    async (text: string) => {
      if (!payload) return
      setAdding(text)
      setToast(null)
      try {
        const res = await fetch("/api/research/dimension", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stockCode: payload.company.stockCode,
            dimensionText: text,
            currentDimensions: payload.dimensions.map((d) => d.label),
          }),
        })
        const body = (await res.json()) as {
          mode?: string
          compliance?: { message?: string }
          dimension?: ResearchSpacePayload["dimensions"][number] | null
          claims?: ResearchSpacePayload["claims"]
          evidence?: ResearchSpacePayload["evidence"]
        }
        if (body.mode === "compliance_redirect") {
          setToast(body.compliance?.message ?? "不提供买卖建议。")
          setAdding(null)
          return
        }
        if (!body.dimension) {
          setToast("该研究角度暂未加入，请稍后重试。")
          setAdding(null)
          return
        }
        setPayload((prev) =>
          prev
            ? {
                ...prev,
                dimensions: [...prev.dimensions, body.dimension!],
                claims: [...prev.claims, ...(body.claims ?? [])],
                evidence: [...prev.evidence, ...(body.evidence ?? []).filter((e) => !prev.evidence.some((x) => x.evidenceId === e.evidenceId))],
              }
            : prev,
        )
        setAdding(null)
        setToast(body.dimension.status === "unknown" ? "该研究方向当前证据不足——已创建为待验证对象。" : "研究角度已加入空间。")
      } catch {
        setAdding(null)
        setToast("研究服务暂时未响应。")
      }
    },
    [payload],
  )

  useEffect(() => {
    addDimensionRef.current = addDimension
  }, [addDimension])

  // ---------- ⌘K ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((v) => !v)
      }
      if (e.key === "Escape") {
        setCommandOpen(false)
        setPeekId(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ---------- Enter company（My World → Company World，§48） ----------
  const enterCompany = useCallback(
    async (stockCode: string, stockName: string, industryName?: string) => {
      setLocalWorld((w) => withVisitedCompany(w, { stockCode, stockName, ...(industryName ? { industryName } : {}) }, new Date().toISOString()))
      if (stockCode === "000333.SZ") {
        setSceneIndex(0)
        setView({ kind: "world" })
        return
      }
      setLoadingTarget(stockCode)
      try {
        const res = await fetch("/api/research/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockCode }),
        })
        if (!res.ok) throw new Error()
        const data = (await res.json()) as FixturePayload
        setPayload(data)
        setManual({})
        setSelection([])
        setParked([])
        setNotes([])
        setView({ kind: "world" })
      } catch {
        setToast("该公司的研究空间暂未建立，可稍后重试。")
      } finally {
        setLoadingTarget(null)
      }
    },
    [],
  )

  // ---------- derived ----------
  const dimsById = useMemo(() => new Map((payload?.dimensions ?? []).map((d) => [d.dimensionId, d])), [payload])
  const topClaimOf = useCallback(
    (dimensionId: string) => (payload?.claims ?? []).find((c) => c.dimensionId === dimensionId && c.type !== "unknown") ?? null,
    [payload],
  )
  const activeIds = focusSet && selection.length > 0 ? selection : []
  const selectedReadingDimension =
    payload && view.kind === "reading" ? payload.dimensions.find((d) => d.dimensionId === view.dimensionId) ?? null : null

  const commands = useMemo(() => {
    const base: { label: string; run: () => void }[] = []
    if (view.kind === "world") {
      base.push(
        { label: "Gather selected", run: () => { gather(); setCommandOpen(false) } },
        { label: "Spread layout", run: () => { spread(); setCommandOpen(false) } },
        { label: "Fit view", run: () => { fit(); setCommandOpen(false) } },
        { label: "Reset layout", run: () => { resetLayout(); setCommandOpen(false) } },
        { label: "Focus set", run: () => { setFocusSet(true); setCommandOpen(false) } },
        { label: "Show all", run: () => { setFocusSet(false); setSelection([]); setCommandOpen(false) } },
        { label: "Clear selection", run: () => { setSelection([]); setFocusSet(false); setCommandOpen(false) } },
        { label: "My World", run: () => { setView({ kind: "myworld" }); setCommandOpen(false) } },
      )
    } else {
      base.push({ label: "Back to company world", run: () => { setView({ kind: "world" }); setCommandOpen(false) } })
    }
    if (peekId) {
      base.unshift({
        label: `Explore ${dimsById.get(peekId)?.label ?? ""}`,
        run: () => {
          openReading(peekId, null)
          setCommandOpen(false)
        },
      })
    }
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openReading 语义稳定
  }, [view.kind, gather, spread, fit, resetLayout, peekId, dimsById])

  const openReading = useCallback(
    (dimensionId: string, claimId: string | null) => {
      const el = document.querySelector(`[data-object-id="${dimensionId}"] .v3-title`) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        setFlipFrom({ x: r.x, y: r.y, width: r.width, height: r.height })
      } else {
        setFlipFrom(null)
      }
      setView({ kind: "reading", dimensionId, claimId })
      setPeekId(null)
    },
    [],
  )

  const suggestions = (payload?.suggestions ?? []).filter((s) => !dismissed.includes(s.label)).slice(0, 3)
  const worldCompaniesList = worldCompanies(localWorld)

  // ---------- render ----------
  if (failed) {
    return (
      <main className="flex h-screen w-screen items-center justify-center" style={{ background: V3_PALETTE.bg, color: V3_PALETTE.ink }}>
        <div className="text-[14px]">Fixture 不可用</div>
      </main>
    )
  }

  return (
    <main
      ref={containerRef}
      className="relative h-screen w-screen select-none overflow-hidden"
      style={{ background: V3_PALETTE.bg, color: V3_PALETTE.ink, cursor: dragKind === "pan" ? "grabbing" : "grab" }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onDoubleClick={() => setView({ kind: "world" })}
    >
      {/* 顶部 chrome（§64：plain typography，无 pill） */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between px-7 py-5 font-mono text-[10.5px] tracking-[0.26em]">
        <span>STOCKLENS</span>
        {payload && view.kind !== "myworld" ? (
          <span style={{ color: V3_PALETTE.secondary }}>
            {payload.company.stockName.toUpperCase().slice(0, 12)} / {payload.company.stockCode}
          </span>
        ) : (
          <span style={{ color: V3_PALETTE.secondary }}>MY WORLD</span>
        )}
      </header>

      {view.kind === "world" && payload && (
        <WorldField
          payload={payload}
          camera={camera}
          viewport={viewport}
          slots={slots}
          manual={manual}
          hoverId={hoverId}
          setHoverId={setHoverId}
          peekId={peekId}
          setPeekId={setPeekId}
          selection={selection}
          activeIds={activeIds}
          focusSet={focusSet}
          parked={parked}
          setParked={setParked}
          notes={notes}
          setNotes={setNotes}
          topClaimOf={topClaimOf}
          suggestions={suggestions}
          suggestDragPos={suggestDragPos}
          adding={adding}
          onExplore={openReading}
          worldCompaniesList={worldCompaniesList}
          positionOf={positionOf}
          toScreen={toScreen}
        />
      )}

      {view.kind === "myworld" && (
        <MyWorldScenes
          companies={worldCompaniesList}
          sceneIndex={sceneIndex}
          setSceneIndex={setSceneIndex}
          onEnter={(code, name, industry) => void enterCompany(code, name, industry)}
          loadingTarget={loadingTarget}
          onBack={() => setView({ kind: "world" })}
        />
      )}

      {view.kind === "reading" && payload && selectedReadingDimension && (
        <ReadingV3
          space={payload}
          dimension={selectedReadingDimension}
          flipTitleFrom={flipFrom}
          initialClaimId={view.claimId}
          onBack={() => setView({ kind: "world" })}
        />
      )}

      {/* marquee */}
      {marquee && (
        <div
          className="pointer-events-none absolute z-30"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
            border: `1px solid ${V3_PALETTE.blue}`,
            background: "rgba(41,98,255,0.06)",
          }}
        />
      )}

      {/* Command Lens（§62–63：半透明冷表面 + 细边框，不是大黑块） */}
      {view.kind === "world" && !commandOpen && (
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="absolute bottom-7 left-1/2 z-40 -translate-x-1/2 rounded-full border px-5 py-2 font-mono text-[10.5px] tracking-[0.24em] backdrop-blur"
          style={{ borderColor: "rgba(16,19,24,0.16)", background: "rgba(255,255,255,0.66)", color: V3_PALETTE.secondary }}
        >
          ⌘K — EXPLORE · FOCUS · ADD
        </button>
      )}
      {commandOpen && (
        <div
          className="absolute bottom-7 left-1/2 z-40 w-[460px] -translate-x-1/2 rounded-lg border p-3 backdrop-blur"
          style={{ borderColor: "rgba(16,19,24,0.14)", background: "rgba(255,255,255,0.82)" }}
        >
          <input
            autoFocus
            value={commandText}
            onChange={(e) => setCommandText(e.target.value)}
            placeholder="Explore · Focus · Add — 输入或选择动作"
            className="w-full bg-transparent px-1 pb-2 text-[13px] outline-none"
            style={{ borderBottom: "1px solid rgba(16,19,24,0.12)" }}
          />
          <ul className="mt-2 max-h-[280px] overflow-y-auto">
            {commands
              .filter((c) => commandText.trim().length === 0 || c.label.toLowerCase().includes(commandText.toLowerCase()))
              .map((c) => (
                <li key={c.label}>
                  <button
                    type="button"
                    onClick={c.run}
                    className="w-full rounded px-2 py-2 text-left text-[12.5px] transition hover:bg-[rgba(41,98,255,0.06)]"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {toast && (
        <div
          className="absolute bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full border px-4 py-2 text-[12px]"
          style={{ borderColor: "rgba(16,19,24,0.14)", background: "rgba(255,255,255,0.9)", color: V3_PALETTE.secondary }}
        >
          {toast}
        </div>
      )}

      {loadingTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(245,247,250,0.86)" }}>
          <div className="font-mono text-[11px] tracking-[0.24em]" style={{ color: V3_PALETTE.secondary }}>
            RESOLVING {loadingTarget} …
          </div>
        </div>
      )}
    </main>
  )
}

// ---------- World Field（媒体 + 散布对象 + annotations + notes + suggestions） ----------

function WorldField({
  payload,
  camera,
  viewport,
  slots,
  manual,
  hoverId,
  setHoverId,
  peekId,
  setPeekId,
  selection,
  activeIds,
  focusSet,
  parked,
  setParked,
  notes,
  setNotes,
  topClaimOf,
  suggestions,
  suggestDragPos,
  adding,
  onExplore,
  worldCompaniesList,
  positionOf,
  toScreen,
}: {
  payload: FixturePayload
  camera: CameraState
  viewport: { width: number; height: number }
  slots: { dimensionId: string; slot: ObjectSlot }[]
  manual: Record<string, { x: number; y: number }>
  hoverId: string | null
  setHoverId: (id: string | null) => void
  peekId: string | null
  setPeekId: (id: string | null) => void
  selection: string[]
  activeIds: string[]
  focusSet: boolean
  parked: string[]
  setParked: (ids: string[]) => void
  notes: PinnedNote[]
  setNotes: React.Dispatch<React.SetStateAction<PinnedNote[]>>
  topClaimOf: (dimensionId: string) => FixturePayload["claims"][number] | null
  suggestions: { label: string; rationale: string }[]
  suggestDragPos: { label: string; x: number; y: number } | null
  adding: string | null
  onExplore: (dimensionId: string, claimId: string | null) => void
  worldCompaniesList: { stockCode: string; stockName: string; industryName?: string; exploredDimensionCount?: number }[]
  positionOf: (dimensionId: string, slot: ObjectSlot) => { x: number; y: number }
  toScreen: (x: number, y: number) => { x: number; y: number }
}) {
  const mediaRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = mediaRef.current
    if (!c) return
    c.width = Math.round(WORLD.width * 1.05)
    c.height = Math.round(WORLD.height * 1.05)
    const ctx = c.getContext("2d")
    if (!ctx) return
    paintCoolMedia(ctx, c.width, c.height, 20261001)
  }, [])

  const company = payload.company
  const industryEn = INDUSTRY_EN[company.industryName ?? ""] ?? company.industryName ?? ""
  const dims = payload.dimensions.filter((d) => !parked.includes(d.dimensionId))

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* media field（§28：主 visual 50–65%；随相机平移缩放；以视口中心为世界原点） */}
      <canvas
        ref={mediaRef}
        className="absolute left-1/2 top-1/2 origin-top-left"
        style={{
          width: `${WORLD.width * 1.05}px`,
          height: `${WORLD.height * 1.05}px`,
          transform: `translate3d(${-camera.x * camera.scale}px, ${-camera.y * camera.scale}px, 0) scale(${camera.scale})`,
          transition: "transform 120ms linear",
        }}
      />

      {/* 散布对象层（世界坐标；与 camera 数学同约定：视口中心 = 世界原点） */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: `translate3d(${-camera.x * camera.scale}px, ${-camera.y * camera.scale}px, 0) scale(${camera.scale})`,
          transformOrigin: "0 0",
          transition: "transform 120ms linear",
        }}
      >
        {dims.map((dim) => {
          const slot = slots.find((s) => s.dimensionId === dim.dimensionId)?.slot
          if (!slot) return null
          const pos = positionOf(dim.dimensionId, slot)
          const claim = topClaimOf(dim.dimensionId)
          const ts = tierStyle(slot.tier)
          const isHover = hoverId === dim.dimensionId
          const isSelected = selection.includes(dim.dimensionId)
          const dimmed = (focusSet && activeIds.length > 0 && !activeIds.includes(dim.dimensionId)) || (hoverId !== null && hoverId !== dim.dimensionId)
          const isUnknown = dim.status === "unknown"
          return (
            <div
              key={dim.dimensionId}
              data-object-id={dim.dimensionId}
              onPointerEnter={() => setHoverId(dim.dimensionId)}
              onPointerLeave={() => setHoverId(null)}
              className="absolute cursor-pointer"
              style={{
                left: pos.x - slot.w / 2,
                top: pos.y - slot.h / 2,
                width: slot.w,
                transform: `rotate(${slot.rot}deg) ${isHover ? "scale(1.035)" : "scale(1)"}`,
                transition: "transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 320ms ease-out",
                opacity: dimmed ? 0.32 : 1,
                zIndex: isSelected || isHover ? 10 : 1,
              }}
            >
              {/* 对象表面：白面 + 细边（§30，几乎无 card 感） */}
              <div
                className="relative overflow-hidden"
                style={{
                  background: V3_PALETTE.surface,
                  border: `1px solid ${isSelected ? V3_PALETTE.blue : "rgba(16,19,24,0.1)"}`,
                  borderRadius: 10,
                  padding: ts.pad,
                  minHeight: slot.h * 0.86,
                  boxShadow: isHover ? "0 18px 50px rgba(24,32,48,0.14)" : "0 6px 22px rgba(24,32,48,0.07)",
                }}
              >
                {/* UNKNOWN 衬底（§57：blur 语义，非虚线圈） */}
                {isUnknown && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: "repeating-linear-gradient(45deg, rgba(180,128,42,0.05) 0 8px, rgba(180,128,42,0) 8px 18px)",
                    }}
                  />
                )}
                <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.22em]" style={{ color: V3_PALETTE.secondary }}>
                  <span>{dim.status === "unknown" ? "UNRESOLVED" : dim.priority === 0 ? "PRIMARY" : `0${dim.priority + 1}`}</span>
                  <span>{dim.evidenceIds.length} EVIDENCE</span>
                </div>
                <h3
                  className="v3-title mt-2 font-medium leading-tight tracking-[-0.01em]"
                  style={{ fontSize: ts.title, wordBreak: "keep-all", color: isUnknown ? V3_PALETTE.amber : V3_PALETTE.ink }}
                >
                  {dim.label}
                </h3>
                {!isUnknown && claim && (
                  <p className="mt-2 leading-relaxed" style={{ fontSize: ts.claim, color: V3_PALETTE.secondary }}>
                    {claim.text.slice(0, slot.tier === "focal" ? 92 : 68)}
                    {claim.text.length > 68 ? "…" : ""}
                  </p>
                )}
                {isUnknown && (
                  <p className="mt-2 text-[12px] leading-relaxed" style={{ color: V3_PALETTE.amber }}>
                    Evidence incomplete — 当前公开证据不足以验证该研究方向。
                  </p>
                )}
                {/* 下划线 + ↘（Cosmos/Unseen 语法；hover 展开） */}
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="h-px flex-1 origin-left transition-transform duration-500"
                    style={{ background: "rgba(16,19,24,0.2)", transform: isHover || isSelected ? "scaleX(1)" : "scaleX(0.55)" }}
                  />
                  <span className="font-mono text-[11px]" style={{ color: V3_PALETTE.secondary }}>
                    ↘
                  </span>
                </div>

                {/* Peek：inline 生长（§41–42，非白色 SaaS card） */}
                {peekId === dim.dimensionId && (
                  <div className="mt-4 border-t pt-3" style={{ borderColor: "rgba(16,19,24,0.12)", animation: "v3-peek-in 320ms cubic-bezier(0.22,1,0.36,1)" }}>
                    {!isUnknown ? (
                      <>
                        {(payload.claims.filter((c) => c.dimensionId === dim.dimensionId).slice(0, 2)).map((c, i) => (
                          <p key={i} className="mb-1.5 text-[12px] leading-relaxed" style={{ color: V3_PALETTE.ink }}>
                            {c.text.slice(0, 88)}…
                          </p>
                        ))}
                        <div className="mt-2 flex items-center justify-between font-mono text-[9.5px] tracking-[0.18em]" style={{ color: V3_PALETTE.secondary }}>
                          <span>
                            {dim.evidenceIds.length} VERIFIED
                            {payload.claims.some((c) => c.dimensionId === dim.dimensionId && c.signal === "conflict") && (
                              <span style={{ color: V3_PALETTE.coral }}> · 1 CONFLICT</span>
                            )}
                          </span>
                          <span className="flex gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setNotes((ns) => [
                                  ...ns,
                                  {
                                    id: `note-${dim.dimensionId}`,
                                    title: dim.label,
                                    summary: dim.researchQuestion ?? "",
                                    claims: payload.claims.filter((c) => c.dimensionId === dim.dimensionId).slice(0, 3).map((c) => ({ text: c.text, type: c.type, signal: c.signal })),
                                    x: 980,
                                    y: 240,
                                    collapsed: false,
                                  },
                                ])
                                setPeekId(null)
                              }}
                              style={{ color: V3_PALETTE.secondary }}
                            >
                              PIN NOTE
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setParked([...parked, dim.dimensionId])
                                setPeekId(null)
                              }}
                              style={{ color: V3_PALETTE.secondary }}
                            >
                              PARK
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onExplore(dim.dimensionId, null)
                              }}
                              style={{ color: V3_PALETTE.blue }}
                            >
                              EXPLORE →
                            </button>
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-mono text-[9.5px] tracking-[0.2em]" style={{ color: V3_PALETTE.amber }}>
                          EVIDENCE INCOMPLETE
                        </div>
                        <ul className="mt-2 space-y-1 text-[11.5px]" style={{ color: V3_PALETTE.secondary }}>
                          {(dim.missingInformation ?? []).slice(0, 3).map((m) => (
                            <li key={m}>· {m}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Evidence technical annotations（§38：01 / 名称 / 数值 / ──●）—— 悬停时在对象右侧展开 */}
              {!isUnknown && isHover && (
                <div className="absolute left-full top-6 ml-4 w-[240px]">
                  <EvidenceAnnotations payload={payload} dimensionId={dim.dimensionId} />
                </div>
              )}
            </div>
          )
        })}

        {/* Parked markers（§2：Park/Restore） */}
        {parked.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setParked(parked.filter((p) => p !== id))
            }}
            className="absolute flex h-8 w-8 items-center justify-center rounded-full border font-mono text-[11px]"
            style={{
              left: 90 + i * 44,
              top: WORLD.height - 120,
              borderColor: "rgba(16,19,24,0.18)",
              background: "rgba(255,255,255,0.85)",
              color: V3_PALETTE.secondary,
            }}
            title={`恢复 ${id}`}
          >
            {(payload.dimensions.find((x) => x.dimensionId === id)?.label ?? id).slice(0, 1)}
          </button>
        ))}

        {/* Pinned research notes（§43：editorial note） */}
        {notes.map((note) => (
          <div
            key={note.id}
            data-note-id={note.id}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute w-[300px] cursor-move"
            style={{ left: note.x, top: note.y }}
          >
            <div className="border-l pl-4" style={{ borderColor: "rgba(16,19,24,0.2)" }}>
              <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.22em]" style={{ color: V3_PALETTE.secondary }}>
                <span>RESEARCH NOTE</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNotes((ns) => ns.map((n) => (n.id === note.id ? { ...n, collapsed: !n.collapsed } : n)))}
                    style={{ color: V3_PALETTE.secondary }}
                  >
                    {note.collapsed ? "EXPAND" : "COLLAPSE"}
                  </button>
                  <button type="button" onClick={() => setNotes((ns) => ns.filter((n) => n.id !== note.id))} style={{ color: V3_PALETTE.secondary }}>
                    ✕
                  </button>
                </span>
              </div>
              <h4 className="mt-1.5 text-[16px] font-medium">{note.title}</h4>
              {!note.collapsed && (
                <>
                  <p className="mt-1 text-[12px] leading-relaxed" style={{ color: V3_PALETTE.secondary }}>
                    {note.summary}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {note.claims.map((c, i) => (
                      <li key={i} className="text-[11.5px] leading-snug" style={{ color: V3_PALETTE.secondary }}>
                        <span className="mr-1.5 font-mono text-[9px]" style={{ color: V3_PALETTE.secondary }}>
                          {c.type.toUpperCase()}
                        </span>
                        {c.text.slice(0, 54)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Adding seed（§61：拖入后调既有 Add 逻辑，RESOLVING 态） */}
      {adding && (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border px-4 py-3 font-mono text-[10px] tracking-[0.2em]"
          style={{ left: "44%", top: "38%", borderColor: V3_PALETTE.blue, background: "rgba(255,255,255,0.88)", color: V3_PALETTE.blue, borderStyle: "dashed" }}
        >
          RESOLVING — {adding}
        </div>
      )}

      {/* Company Identity（§27：左上/左侧，48–72px） */}
      <div className="pointer-events-none absolute left-8 top-1/2 z-30 max-w-[380px] -translate-y-1/2" style={{ opacity: 0.96 }}>
        <h1 className="text-[58px] font-medium leading-[0.98] tracking-[-0.02em]">
          {company.stockName.toUpperCase().slice(0, 6) === company.stockName.toUpperCase() ? company.stockName : company.stockName}
        </h1>
        <div className="mt-3 text-[19px]" style={{ color: V3_PALETTE.secondary }}>
          {company.stockName} · {company.stockCode}
        </div>
        <div className="mt-1 font-mono text-[10.5px] tracking-[0.24em]" style={{ color: V3_PALETTE.secondary }}>
          {industryEn} · {payload.dimensions.length} RESEARCH DIMENSIONS
        </div>
        <div className="mt-5 font-mono text-[10px] tracking-[0.22em]" style={{ color: V3_PALETTE.secondary, opacity: 0.7 }}>
          DRAG TO EXPLORE · CLICK TO FOCUS · ⇧+DRAG SELECT
        </div>
      </div>

      {/* Suggestion ghosts（§60：边缘 ghost annotation） */}
      {suggestions.map((s, i) => {
        const spots = [
          { x: 56, y: viewport.height - 84 },
          { x: 40, y: 96 },
          { x: viewport.width - 300, y: viewport.height - 64 },
        ]
        const spot = spots[i % spots.length]
        const dragging = suggestDragPos?.label === s.label
        return (
          <div
            key={s.label}
            data-suggest-label={s.label}
            className="absolute z-20 cursor-grab"
            style={{
              left: dragging ? suggestDragPos!.x - 90 : spot.x,
              top: dragging ? suggestDragPos!.y - 18 : spot.y,
              transition: dragging ? "none" : "left 320ms ease-out, top 320ms ease-out",
            }}
            title={s.rationale}
          >
            <div className="font-mono text-[9px] tracking-[0.22em]" style={{ color: V3_PALETTE.secondary }}>
              + SUGGESTED RESEARCH
            </div>
            <div className="mt-1 text-[15px]" style={{ color: V3_PALETTE.graphite, borderBottom: "1px dashed rgba(16,19,24,0.22)", paddingBottom: 3 }}>
              {s.label}
            </div>
          </div>
        )
      })}

      {/* My World 入口（§44） */}
      <button
        type="button"
        onClick={() => {/* handled by parent via double click / command */}}
        className="pointer-events-none absolute bottom-7 right-8 z-30 font-mono text-[10.5px] tracking-[0.24em]"
        style={{ color: V3_PALETTE.secondary, opacity: 0.75 }}
      >
        {worldCompaniesList.length} COMPANIES · ⌘K → MY WORLD
      </button>

      {/* 小地图（§36：camera deviated 时出现） */}
      {camera.scale > 0.82 && isCameraDeviated(camera) && (
        <MiniMap camera={camera} viewport={viewport} slots={slots} manual={manual} toScreen={toScreen} />
      )}

      <style jsx global>{`
        @keyframes v3-peek-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/** §38：technical annotation（01 / 名称 / 数值 / ──●），从真实证据取数 */
function EvidenceAnnotations({ payload, dimensionId }: { payload: FixturePayload; dimensionId: string }) {
  const dim = payload.dimensions.find((d) => d.dimensionId === dimensionId)
  if (!dim) return null
  type Row = { index: string; title: string; value: string; type: string }
  const rows: Row[] = []
  dim.evidenceIds.slice(0, 2).forEach((id, i) => {
    const ev = payload.evidence.find((e) => e.evidenceId === id)
    const metric = payload.metrics.find((m) => ev && m.metricId === ev.metricIds[0])
    if (!ev || !metric) return
    rows.push({ index: String(i + 1).padStart(2, "0"), title: metric.name, value: formatMetric(metric), type: String(ev.type) })
  })
  if (rows.length === 0) return null
  return (
    <div className="mt-3 space-y-2" style={{ animation: "v3-peek-in 300ms ease-out" }}>
      {rows.map((r) => (
        <div key={r.index} className="flex items-end gap-2 pl-1">
          <span className="w-4 font-mono text-[9px]" style={{ color: V3_PALETTE.secondary }}>
            {r.index}
          </span>
          <span className="text-[10.5px]" style={{ color: V3_PALETTE.secondary }}>
            {r.title}
          </span>
          <span className="ml-auto font-mono text-[12px]" style={{ color: V3_PALETTE.ink, fontVariantNumeric: "tabular-nums" }}>
            {r.value}
          </span>
          <svg width="34" height="6">
            <line x1="0" y1="3" x2="26" y2="3" stroke="rgba(16,19,24,0.4)" strokeWidth="1" />
            <circle cx="30" cy="3" r="2" fill={r.type === "inference" ? V3_PALETTE.violet : V3_PALETTE.blue} />
          </svg>
        </div>
      ))}
    </div>
  )
}

function formatMetric(m: import("@/lib/metrics/types").MetricResult): string {
  const v = m.value
  if (v === null || v === undefined) return "—"
  const unit = m.unit === "%" ? "%" : m.unit === "pct" ? " pct" : ""
  return `${typeof v === "number" ? (Math.abs(v) < 100 ? v.toFixed(2) : v.toFixed(0)) : v}${unit}`
}

function MiniMap({
  camera,
  viewport,
  slots,
  manual,
  toScreen,
}: {
  camera: CameraState
  viewport: { width: number; height: number }
  slots: { dimensionId: string; slot: ObjectSlot }[]
  manual: Record<string, { x: number; y: number }>
  toScreen: (x: number, y: number) => { x: number; y: number }
}) {
  const scale = 0.09
  return (
    <div
      className="absolute bottom-16 right-8 z-30 rounded border"
      style={{ width: WORLD.width * scale, height: WORLD.height * scale, borderColor: "rgba(16,19,24,0.14)", background: "rgba(255,255,255,0.7)", backdropFilter: "blur(4px)" }}
    >
      <svg width={WORLD.width * scale} height={WORLD.height * scale}>
        {slots.map(({ dimensionId, slot }) => {
          const p = manual[dimensionId] ?? { x: slot.x, y: slot.y }
          return <rect key={dimensionId} x={p.x * scale - 3} y={p.y * scale - 2} width={6} height={4} fill="rgba(16,19,24,0.4)" />
        })}
        <rect
          x={(camera.x - viewport.width / (2 * camera.scale)) * scale}
          y={(camera.y - viewport.height / (2 * camera.scale)) * scale}
          width={(viewport.width / camera.scale) * scale}
          height={(viewport.height / camera.scale) * scale}
          fill="none"
          stroke={V3_PALETTE.blue}
          strokeWidth="1"
        />
      </svg>
      <span className="sr-only">{toScreen(0, 0).x}</span>
    </div>
  )
}

// ---------- My World（§44–§48：Oryzo 拼贴 + OceanX 横移） ----------

function MyWorldScenes({
  companies,
  sceneIndex,
  setSceneIndex,
  onEnter,
  loadingTarget,
  onBack,
}: {
  companies: { stockCode: string; stockName: string; industryName?: string; exploredDimensionCount?: number }[]
  sceneIndex: number
  setSceneIndex: (i: number) => void
  onEnter: (code: string, name: string, industry?: string) => void
  loadingTarget: string | null
  onBack: () => void
}) {
  const dragRef = useRef<{ x: number; index: number } | null>(null)
  const [sceneDragging, setSceneDragging] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setSceneIndex(Math.min(sceneIndex + 1, companies.length - 1))
      if (e.key === "ArrowLeft") setSceneIndex(Math.max(sceneIndex - 1, 0))
      if (e.key === "Escape") onBack()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [sceneIndex, companies.length, setSceneIndex, onBack])

  return (
    <div
      className="absolute inset-0 z-30 overflow-hidden"
      style={{ background: V3_PALETTE.bg, cursor: sceneDragging ? "grabbing" : "grab" }}
      onPointerDown={(e) => {
        dragRef.current = { x: e.clientX, index: sceneIndex }
        setSceneDragging(true)
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = dragRef.current
        if (!d) return
        const dx = e.clientX - d.x
        if (Math.abs(dx) < 140) return
        const next = Math.max(0, Math.min(companies.length - 1, d.index + (dx < 0 ? 1 : -1)))
        if (next !== sceneIndex) setSceneIndex(next)
        dragRef.current = { x: e.clientX, index: next }
      }}
      onPointerUp={() => {
        dragRef.current = null
        setSceneDragging(false)
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="absolute left-7 top-16 z-40 font-mono text-[10.5px] tracking-[0.24em]"
        style={{ color: V3_PALETTE.secondary }}
      >
        ← BACK TO COMPANY WORLD
      </button>
      <div
        className="absolute top-1/2 flex -translate-y-1/2 items-center"
        style={{
          left: viewportMid() - SCENE.width / 2 - sceneIndex * (SCENE.width + SCENE.gap),
          transition: "left 620ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {companies.map((c, i) => (
          <SceneCard
            key={c.stockCode}
            company={c}
            active={i === sceneIndex}
            neighbour={Math.abs(i - sceneIndex) === 1}
            onEnter={() => onEnter(c.stockCode, c.stockName, c.industryName)}
            loading={loadingTarget === c.stockCode}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 font-mono text-[10.5px] tracking-[0.24em]" style={{ color: V3_PALETTE.secondary }}>
        DRAG / ← → TO TRAVERSE
      </div>
    </div>
  )
}

function viewportMid(): number {
  return typeof window === "undefined" ? 720 : window.innerWidth / 2
}

function SceneCard({
  company,
  active,
  neighbour,
  onEnter,
  loading,
}: {
  company: { stockCode: string; stockName: string; industryName?: string; exploredDimensionCount?: number }
  active: boolean
  neighbour: boolean
  onEnter: () => void
  loading: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = SCENE.width
    c.height = SCENE.height
    const ctx = c.getContext("2d")
    if (!ctx) return
    void import("@/lib/v3/media").then((m) => m.paintSceneMedia(ctx, c.width, c.height, company.stockCode))
  }, [company.stockCode])

  return (
    <div
      className="relative shrink-0"
      style={{
        width: SCENE.width,
        height: SCENE.height,
        marginRight: SCENE.gap,
        transform: `scale(${active ? 1 : neighbour ? 0.9 : 0.84})`,
        opacity: active ? 1 : neighbour ? 0.72 : 0.5,
        transition: "transform 620ms cubic-bezier(0.22,1,0.36,1), opacity 620ms ease-out",
      }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-xl border" style={{ borderColor: "rgba(16,19,24,0.12)" }}>
        <canvas ref={ref} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(245,247,250,0.1) 0%, rgba(245,247,250,0.86) 78%, rgba(245,247,250,0.96) 100%)" }} />
        <div className="absolute bottom-0 left-0 right-0 p-9">
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: V3_PALETTE.secondary }}>
            {company.stockCode} · {company.industryName ?? "—"} · {company.exploredDimensionCount ?? 0} DIMENSIONS EXPLORED
          </div>
          <h2 className="mt-2 text-[44px] font-medium leading-none tracking-[-0.02em]">{company.stockName}</h2>
          {active && (
            <button
              type="button"
              onClick={onEnter}
              className="mt-5 font-mono text-[11.5px] tracking-[0.22em] transition hover:opacity-70"
              style={{ color: V3_PALETTE.blue }}
            >
              {loading ? "RESOLVING …" : "ENTER RESEARCH →"}
            </button>
          )}
        </div>
        <div className="absolute right-7 top-7 flex h-11 w-11 items-center justify-center rounded-full border font-mono text-[10px]" style={{ borderColor: "rgba(16,19,24,0.18)", background: "rgba(255,255,255,0.7)" }}>
          №{(company.exploredDimensionCount ?? 0) + 1}
        </div>
      </div>
    </div>
  )
}
