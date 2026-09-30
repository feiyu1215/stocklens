"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  CONSTELLATION,
  computeDimensionLayout,
  type DimensionLayout,
} from "@/lib/presentation/constellation-layout"
import {
  computeFitCamera,
  boundsOfObjects,
  isCameraDeviated,
  panCamera,
  screenToWorld,
  viewportWorldRect,
  worldToMiniMap,
  worldToScreen,
  zoomAtPointer,
  IDENTITY_CAMERA,
  type CameraState,
} from "@/lib/spatial/camera"
import {
  applyManualPositions,
  findProximityTarget,
  gatherLayout,
  isInsideFocusZone,
  parkDimension,
  restoreDimension,
  spreadLayout,
  type ManualPositions,
  type ParkedDimension,
} from "@/lib/spatial/layout-commands"
import {
  collapseSummaries,
  computePeekPosition,
  focusSelected,
  isInsideAddZone,
  marqueeHitTest,
  marqueeWorldRect,
  pinSummary,
  resolveDragTarget,
  showAll,
  toggleSelection,
  type FocusSetState,
  type PinnedSummary,
} from "@/lib/spatial/interaction"
import type { ResearchSpacePayload } from "./theme"
import { degradationForDimension } from "@/lib/experience/state"
import { getObjectDetailLevel, evidenceNodeBudget, shouldShowEvidenceLabels } from "@/lib/experience/detail"
import { COPY } from "@/lib/experience/copy"
import type { DimensionHandlers, SuggestionHandlers, WorldRenderer } from "./renderers/types"

// ResearchWorkspace（Task 13 §1）：Camera / SpatialState / Layout / Interaction / Objects / Renderer。
// 组件本身不包含任何视觉隐喻分支——所有外观经 WorldRenderer contract 输出。

export interface WorkspaceActions {
  gather: () => void
  spread: () => void
  fit: () => void
  resetLayout: () => void
  focusSelected: () => void
  showAll: () => void
  collapseSummaries: () => void
}

interface DragState {
  kind: "camera" | "object" | "marquee" | "suggestion" | "summary"
  // camera
  lastScreen?: { x: number; y: number }
  // object / suggestion
  dimensionId?: string
  suggestionLabel?: string
  offset?: { x: number; y: number }
  // marquee
  startScreen?: { x: number; y: number }
  currentScreen?: { x: number; y: number }
  // summary
  summaryId?: string
}

export function ResearchWorkspace({
  space,
  renderer,
  onOpenDimension,
  onAddDimension,
  onSuggestionAdd,
  dismissedSuggestions,
  onSuggestionDismiss,
  registerActions,
  onCameraSample,
  semanticState,
  onSemanticEvent,
  addLensOpen = false,
}: {
  space: ResearchSpacePayload
  renderer: WorldRenderer
  onOpenDimension: (dimensionId: string) => void
  onAddDimension: () => void
  onSuggestionAdd: (label: string) => void
  dismissedSuggestions: string[]
  onSuggestionDismiss: (label: string) => void
  registerActions?: (actions: WorkspaceActions) => void
  /** 仅开发/评审：把空间 camera 采样给 ?experienceDebug=1 面板（§99） */
  onCameraSample?: (camera: import("@/lib/spatial/camera").CameraState) => void
  /** Task 15：语义状态由 App 单一持有（§10），workspace 只派发事件 */
  semanticState?: import("@/lib/experience/state").ExperienceState
  onSemanticEvent?: (event: import("@/lib/experience/state").ExperienceEvent) => void
  addLensOpen?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerRect, setContainerRect] = useState({ left: 0, top: 0, width: 1440, height: 900 })
  const viewport = useMemo(
    () => ({ width: containerRect.width, height: containerRect.height }),
    [containerRect.width, containerRect.height],
  )
  const [camera, setCamera] = useState<CameraState>(IDENTITY_CAMERA)
  const [manualPositions, setManualPositions] = useState<ManualPositions>({})
  const [parked, setParked] = useState<ParkedDimension[]>([])
  const [focus, setFocus] = useState<FocusSetState>({ selected: [], focused: [] })
  const [hoveredDimensionId, setHoveredDimensionId] = useState<string | null>(null)
  const [hoveredSuggestion, setHoveredSuggestion] = useState<string | null>(null)
  const [selectedSummaryId, setSelectedSummaryId] = useState<string | null>(null)
  const [peekDimensionId, setPeekDimensionId] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<PinnedSummary[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const setDragState = useCallback((next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])
  const [dragPosition, setDragPosition] = useState<{ dimensionId: string; x: number; y: number } | null>(null)
  const [suggestionDrag, setSuggestionDrag] = useState<{ label: string; world: { x: number; y: number } } | null>(null)
  const [spreadVersion, setSpreadVersion] = useState(0)
  const [layoutMode, setLayoutMode] = useState<"initial" | "gather" | "spread">("initial")

  const tokens = renderer.tokens

  // 容器矩形（viewport 的唯一来源）；仅在 effect 中读取 ref（合法）
  useEffect(() => {
    const update = () => {
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setContainerRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [])

  function getContainerRect(): { left: number; top: number; width: number; height: number } {
    return containerRect
  }

  const toScreen = useCallback(
    (x: number, y: number) => worldToScreen(camera, viewport, x, y),
    [camera, viewport],
  )
  const toWorld = useCallback(
    (x: number, y: number) => screenToWorld(camera, viewport, x, y),
    [camera, viewport],
  )

  // ---- 布局：base（initial/gather/spread）+ manual overrides ----
  const baseLayouts: DimensionLayout[] = useMemo(() => {
    if (layoutMode === "gather") return gatherLayout(space.dimensions)
    if (layoutMode === "spread") return spreadLayout(space.dimensions)
    return computeDimensionLayout(space.dimensions)
    // spreadVersion 触发重新计算（命令语义）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space.dimensions, layoutMode, spreadVersion])

  const layouts = useMemo(
    () => applyManualPositions(baseLayouts, manualPositions),
    [baseLayouts, manualPositions],
  )
  const layoutById = useMemo(() => new Map(layouts.map((l) => [l.dimensionId, l] as const)), [layouts])

  const visibleDimensions = useMemo(
    () => space.dimensions.filter((d) => !parked.some((p) => p.dimensionId === d.dimensionId)),
    [space.dimensions, parked],
  )

  // ---- Initial fit（首次数据到达时） ----
  const didFitRef = useRef(false)
  useEffect(() => {
    if (didFitRef.current || layouts.length === 0) return
    let cancelled = false
    void (async () => {
      await Promise.resolve() // 异步边界：避免 effect 内同步 setState
      if (cancelled || didFitRef.current) return
      didFitRef.current = true
      const bounds = boundsOfObjects(layouts.map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height })))
      if (bounds) setCamera(computeFitCamera(bounds, viewport, 140))
    })()
    return () => {
      cancelled = true
    }
  }, [layouts, viewport])

  // ---- Fit / Reset ----
  const fit = useCallback(() => {
    const objects = layouts
      .filter((l) => visibleDimensions.some((d) => d.dimensionId === l.dimensionId))
      .map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height }))
    objects.push({ x: 0, y: 0, width: CONSTELLATION.CORE_SIZE, height: CONSTELLATION.CORE_SIZE })
    const bounds = boundsOfObjects(objects)
    if (bounds) setCamera(computeFitCamera(bounds, viewport, 140))
  }, [layouts, visibleDimensions, viewport])

  const resetLayout = useCallback(() => {
    didFitRef.current = false
    setManualPositions({})
    setLayoutMode("initial")
    setSpreadVersion((v) => v + 1)
    setParked([])
    setFocus(showAll())
    setPeekDimensionId(null)
    setSummaries(collapseSummaries())
    setCamera(IDENTITY_CAMERA)
  }, [])

  // ---- 注册 acciones（Command Lens 调用） ----
  useEffect(() => {
    registerActions?.({
      gather: () => {
        setManualPositions({})
        setLayoutMode("gather")
      },
      spread: () => {
        setManualPositions({})
        setLayoutMode("spread")
        setSpreadVersion((v) => v + 1)
      },
      fit,
      resetLayout,
      focusSelected: () => setFocus((f) => focusSelected(f.selected)),
      showAll: () => setFocus(showAll()),
      collapseSummaries: () => setSummaries(collapseSummaries()),
    })
  }, [registerActions, fit, resetLayout])

  // ---- Wheel zoom（§10，pointer-relative；trackpad 平滑） ----
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const factor = Math.exp(-e.deltaY * 0.0016)
      setCamera((c) => zoomAtPointer(c, { width: rect.width, height: rect.height }, pointer, factor))
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(() => {
    if (!onCameraSample) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (!cancelled) onCameraSample(camera)
    })()
    return () => {
      cancelled = true
    }
  }, [camera, onCameraSample])

  // ---- 指针事件：仲裁（§9） ----
  const pickObjectAt = (target: EventTarget | null): string | null => {
    let el = target as HTMLElement | null
    const root = containerRef.current
    while (el && el !== root) {
      const id = el.getAttribute?.("data-dimension-id")
      if (id) return id
      el = el.parentElement
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    const onDimension = pickObjectAt(e.target)
    const suggestionCard = target.closest("[data-suggestion-label]") as HTMLElement | null
    const summaryCard = target.closest("[data-summary-id]") as HTMLElement | null
    const kind = resolveDragTarget({
      onObject: Boolean(onDimension),
      onSuggestion: Boolean(suggestionCard),
      onSummary: Boolean(summaryCard),
      shiftKey: e.shiftKey,
    })
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // 合成事件 / 非活动指针时 setPointerCapture 可能失败：不影响交互主流程
    }


    if (kind === "summary" && summaryCard) {
      const s = summaries.find((x) => x.id === summaryCard.getAttribute("data-summary-id"))
      if (!s) return
      const world = toWorld(e.clientX - getContainerRect().left, e.clientY - getContainerRect().top)
      setDragState({ kind, summaryId: s.id, offset: { x: world.x - s.position.x, y: world.y - s.position.y } })
      return
    }
    if (kind === "suggestion" && suggestionCard) {
      const label = suggestionCard.getAttribute("data-suggestion-label") ?? ""
      const rect = getContainerRect()
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      setDragState({ kind, suggestionLabel: label })
      setSuggestionDrag({ label, world })
      return
    }
    if (kind === "object" && onDimension) {
      const l = layoutById.get(onDimension)
      const world = toWorld(e.clientX - getContainerRect().left, e.clientY - getContainerRect().top)
      setDragState({
        kind,
        dimensionId: onDimension,
        offset: l ? { x: l.x - world.x, y: l.y - world.y } : { x: 0, y: 0 },
      })
      setDragPosition(l ? { dimensionId: onDimension, x: l.x, y: l.y } : null)
      return
    }
    if (kind === "marquee") {
      const rect = getContainerRect()
      const start = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      setDragState({ kind, startScreen: start, currentScreen: start })
      return
    }
    setDragState({ kind: "camera", lastScreen: { x: e.clientX, y: e.clientY } })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const rect = getContainerRect()
    if (drag.kind === "camera" && drag.lastScreen) {
      const dx = e.clientX - drag.lastScreen.x
      const dy = e.clientY - drag.lastScreen.y
      setCamera((c) => panCamera(c, dx, dy))
      setDragState({ ...drag, lastScreen: { x: e.clientX, y: e.clientY } })
      return
    }
    if (drag.kind === "object" && drag.dimensionId && drag.offset) {
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      setDragPosition({ dimensionId: drag.dimensionId, x: world.x + drag.offset.x, y: world.y + drag.offset.y })
      return
    }
    if (drag.kind === "marquee" && drag.startScreen) {
      setDragState({ ...drag, currentScreen: { x: e.clientX - rect.left, y: e.clientY - rect.top } })
      return
    }
    if (drag.kind === "suggestion" && drag.suggestionLabel) {
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      setSuggestionDrag({ label: drag.suggestionLabel, world })
      return
    }
    if (drag.kind === "summary" && drag.summaryId && drag.offset) {
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      setSummaries((prev) =>
        prev.map((s) =>
          s.id === drag.summaryId ? { ...s, position: { x: world.x - drag.offset!.x, y: world.y - drag.offset!.y } } : s,
        ),
      )
      return
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const rect = getContainerRect()
    if (drag.kind === "object" && drag.dimensionId && dragPosition) {
      setManualPositions((prev) => ({ ...prev, [drag.dimensionId!]: { x: dragPosition.x, y: dragPosition.y } }))
    }
    if (drag.kind === "marquee" && drag.startScreen && drag.currentScreen) {
      const worldRect = marqueeWorldRect(drag.startScreen, drag.currentScreen, (p) => toWorld(p.x, p.y))
      const hit = marqueeHitTest(
        worldRect,
        layouts.map((l) => ({ dimensionId: l.dimensionId, x: l.x, y: l.y, width: l.width, height: l.height })),
      )
      setFocus((f) => ({ ...f, selected: hit }))
    }
    if (drag.kind === "suggestion" && drag.suggestionLabel) {
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      if (isInsideAddZone(world)) {
        onSuggestionAdd(drag.suggestionLabel)
      }
    }
    setDragState(null)
    setDragPosition(null)
    setSuggestionDrag(null)
  }

  // ---- 共享 handlers（组件作用域；id 从 data-* 读取，render 期不创建读 ref 的闭包） ----
  const dimensionHandlers = useMemo<DimensionHandlers>(() => ({
    onPointerDown: (e) => {
      if (e.shiftKey) return
      e.stopPropagation()
      const dimensionId = (e.currentTarget as HTMLElement).getAttribute("data-dimension-id")
      if (!dimensionId) return
      const layout = layoutById.get(dimensionId)
      const rect = getContainerRect()
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      setDragState({
        kind: "object",
        dimensionId,
        offset: layout ? { x: layout.x - world.x, y: layout.y - world.y } : { x: 0, y: 0 },
      })
      setDragPosition(layout ? { dimensionId, x: layout.x, y: layout.y } : null)
    },
    onClick: (e) => {
      e.stopPropagation()
      const dimensionId = (e.currentTarget as HTMLElement).getAttribute("data-dimension-id")
      if (!dimensionId) return
      if (e.shiftKey) {
        setFocus((f) => ({ ...f, selected: toggleSelection(f.selected, dimensionId) }))
        return
      }
      setPeekDimensionId((prev) => (prev === dimensionId ? null : dimensionId))
    },
    onMouseEnter: (e) => {
      const dimensionId = (e.currentTarget as HTMLElement).getAttribute("data-dimension-id")
      if (dimensionId) setHoveredDimensionId(dimensionId)
    },
    onMouseLeave: () => setHoveredDimensionId(null),
    // getContainerRect/setDragState 每次渲染重建但语义稳定（前者读 state、后者 useCallback 包装）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [layoutById, toWorld, containerRect])

  const suggestionHandlers = useMemo<SuggestionHandlers>(() => ({
    onPointerDown: (e) => {
      e.stopPropagation()
      const root = (e.currentTarget as HTMLElement).closest("[data-suggestion-label]") as HTMLElement | null
      const label = root?.getAttribute("data-suggestion-label")
      if (!label) return
      const rect = getContainerRect()
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      setDragState({ kind: "suggestion", suggestionLabel: label })
      setSuggestionDrag({ label, world })
    },
    onMouseEnter: (e) => {
      const root = (e.currentTarget as HTMLElement).closest("[data-suggestion-label]") as HTMLElement | null
      const label = root?.getAttribute("data-suggestion-label")
      if (label) setHoveredSuggestion(label)
    },
    onMouseLeave: () => setHoveredSuggestion(null),
    onAdd: (e) => {
      const root = (e.currentTarget as HTMLElement).closest("[data-suggestion-label]") as HTMLElement | null
      const label = root?.getAttribute("data-suggestion-label")
      if (label) onSuggestionAdd(label)
    },
    onDismiss: (e) => {
      const root = (e.currentTarget as HTMLElement).closest("[data-suggestion-label]") as HTMLElement | null
      const label = root?.getAttribute("data-suggestion-label")
      if (label) onSuggestionDismiss(label)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [toWorld, containerRect, onSuggestionAdd, onSuggestionDismiss])

  // ---- ESC / Enter（§27–§28） ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (peekDimensionId) setPeekDimensionId(null)
      }
      if (e.key === "Enter" && peekDimensionId) {
        onOpenDimension(peekDimensionId)
        setPeekDimensionId(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [peekDimensionId, onOpenDimension])

  // ---- Derived: focus zone / proximity / peek / minimap ----
  const focusZoneActive = useMemo(
    () => layouts.some((l) => isInsideFocusZone({ x: l.x, y: l.y })),
    [layouts],
  )
  const proximity = useMemo(() => {
    if (!dragPosition) return null
    return findProximityTarget(
      { dimensionId: dragPosition.dimensionId, x: dragPosition.x, y: dragPosition.y },
      layouts.map((l) => ({
        dimensionId: l.dimensionId,
        label: space.dimensions.find((d) => d.dimensionId === l.dimensionId)?.label ?? "",
        x: l.x,
        y: l.y,
      })),
    )
  }, [dragPosition, layouts, space.dimensions])

  const peekDimension = peekDimensionId ? space.dimensions.find((d) => d.dimensionId === peekDimensionId) ?? null : null
  const peekLayout = peekDimensionId ? layoutById.get(peekDimensionId) ?? null : null
  const peekPosition = useMemo(() => {
    if (!peekLayout) return null
    const screen = toScreen(
      dragPosition?.dimensionId === peekDimensionId ? dragPosition.x : peekLayout.x,
      dragPosition?.dimensionId === peekDimensionId ? dragPosition.y : peekLayout.y,
    )
    return computePeekPosition(screen, { width: peekLayout.width, height: peekLayout.height }, viewport)
  }, [peekLayout, peekDimensionId, dragPosition, toScreen, viewport])

  const miniMap = useMemo(() => {
    if (!isCameraDeviated(camera)) return null
    const bounds = boundsOfObjects([
      { x: 0, y: 0, width: CONSTELLATION.CORE_SIZE, height: CONSTELLATION.CORE_SIZE },
      ...layouts.map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height })),
    ])
    if (!bounds) return null
    return { bounds, viewportRect: viewportWorldRect(camera, viewport) }
  }, [camera, layouts, viewport])

  // Add 节点位置（确定性常量，不在 render 期读 ref）
  const addNodePosition = useMemo(() => {
    const radius = CONSTELLATION.CORE_SIZE / 2 + 150
    return { x: Math.cos(Math.PI / 4) * radius, y: Math.sin(Math.PI / 4) * radius }
  }, [])

  const marqueeRect = drag?.kind === "marquee" && drag.startScreen && drag.currentScreen
    ? {
        x: Math.min(drag.startScreen.x, drag.currentScreen.x),
        y: Math.min(drag.startScreen.y, drag.currentScreen.y),
        width: Math.abs(drag.currentScreen.x - drag.startScreen.x),
        height: Math.abs(drag.currentScreen.y - drag.startScreen.y),
      }
    : null

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      data-renderer-id={renderer.id}
      aria-label="Research Space 工作台"
      style={{ cursor: drag?.kind === "camera" ? "grabbing" : "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDragState(null)
        setDragPosition(null)
        setSuggestionDrag(null)
      }}
    >
      {renderer.renderBackground()}

      {/* 世界层（camera 变换） */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: `translate(${-camera.x * camera.scale}px, ${-camera.y * camera.scale}px) scale(${camera.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {renderer.renderEvidenceField({
          evidence: space.evidence,
          highlightedDimensionId:
            hoveredDimensionId
              ? space.dimensions.find((d) => d.dimensionId === hoveredDimensionId)?.label ?? null
              : null,
          hoveredEvidenceId: null,
          // Task 15 §92–§93：密度随 camera scale
          nodeBudget: evidenceNodeBudget(camera.scale),
          showLabels: shouldShowEvidenceLabels(camera.scale),
          // Terrain Region 作为 hit target（§37–§39；DOM button 仍是可访问性代理）
          dimensionLayouts: visibleDimensions.map((dim) => {
            const l = layoutById.get(dim.dimensionId)
            return { dimension: dim, x: l?.x ?? 0, y: l?.y ?? 0, width: l?.width ?? 176 }
          }),
          onRegionPointerEnter: (dimensionId) => setHoveredDimensionId(dimensionId),
          onRegionPointerLeave: () => setHoveredDimensionId(null),
          onRegionClick: (dimensionId) => {
            setPeekDimensionId((prev) => (prev === dimensionId ? null : dimensionId))
            onSemanticEvent?.({ type: "open_dimension", dimensionId, source: "click" })
          },
        })}

        {/* Company Core */}
        <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">
          {renderer.renderCompany({
            stockCode: space.company.stockCode,
            stockName: space.company.stockName,
            ...(space.company.industryName ? { industryName: space.company.industryName } : {}),
            focusZoneActive,
          })}
        </div>

        {/* Dimensions */}
        {/* eslint-disable-next-line react-hooks/refs -- handlers 仅在事件期读取容器 ref；静态分析无法区分，行为由 T13 验收脚本覆盖 */}
        {visibleDimensions.map((dim) => {
          const layout = layoutById.get(dim.dimensionId)
          if (!layout) return null
          const claims = space.claims.filter((c) => c.dimensionId === dim.dimensionId)
          const dragging = dragPosition?.dimensionId === dim.dimensionId
          // Task 15 §27：进入 claim/evidence level 时，其他 Dimension 退到空间边缘（语义 zoom，不是 camera zoom）
          const semanticReceded =
            (semanticState?.level === "claim" || semanticState?.level === "evidence") &&
            semanticState.activeDimension !== dim.dimensionId
          return renderer.renderDimension(
            {
              dimension: dim,
              layout,
              claimCount: claims.length,
              conflictCount: claims.filter((c) => c.signal === "conflict").length,
              unknownCount: claims.filter((c) => c.type === "unknown").length,
              selected: focus.selected.includes(dim.dimensionId),
              focused: focus.focused.includes(dim.dimensionId),
              dimmed: (focus.focused.length > 0 && !focus.focused.includes(dim.dimensionId)) || semanticReceded,
              hovered: hoveredDimensionId === dim.dimensionId,
              // Task 15：信息密度由 Experience Model 决定；局部降级状态本地化（§3/§49）
              // peek 打开时由 peek 承载内容，对象回到 compact（否则同一段 summary 会出现两次）
              detailLevel: getObjectDetailLevel({
                cameraScale: camera.scale,
                hovered: hoveredDimensionId === dim.dimensionId && peekDimensionId !== dim.dimensionId,
                selected: focus.selected.includes(dim.dimensionId),
              }),
              degraded: degradationForDimension(claims.length > 0, space.ai.status).interpretation === "unavailable",
              // §89：expanded 时给 summary + top claims；内容常备，是否呈现由 detailLevel 决定（kit 侧 gate）
              expandedSummary: (claims[0]?.text ?? dim.researchQuestion).slice(0, 96),
              // summary 已是 claims[0]，列表从第二条开始，避免同一句话出现两次
              expandedClaims: claims.slice(1, 4).map((c) => c.text.slice(0, 56)),
              ...(dragging && dragPosition ? { dragPosition: { x: dragPosition.x, y: dragPosition.y } } : {}),
            },
            dimensionHandlers,
          )
        })}

        {/* Parked markers（§33–§34） */}
        {parked.map((p) => (
          <button
            key={p.dimensionId}
            type="button"
            aria-label={`已 Park：${space.dimensions.find((d) => d.dimensionId === p.dimensionId)?.label ?? p.dimensionId}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              setParked((prev) => restoreDimension(p.dimensionId, prev))
            }}
            className="absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full border text-[10px] outline-none focus-visible:ring-2"
            style={{
              transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px))`,
              borderColor: tokens.surfaceBorder,
              background: tokens.light ? "rgba(255,255,255,0.85)" : "rgba(12,15,22,0.8)",
              color: tokens.textFaint,
            }}
            title="点击恢复"
          >
            {space.dimensions.find((d) => d.dimensionId === p.dimensionId)?.label.slice(0, 1) ?? "·"}
          </button>
        ))}

        {/* ＋ Add 节点（独立对象，保持 T12.1 规则） */}
        <button
          type="button"
          aria-label="Add research angle"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onAddDimension()
          }}
          className="group absolute left-0 top-0 outline-none focus-visible:ring-2"
          style={{
            transform: `translate(calc(-50% + ${addNodePosition.x}px), calc(-50% + ${addNodePosition.y}px))`,
          }}
        >
          <span
            className="flex items-center justify-center rounded-full border text-[20px] transition"
            style={{
              width: CONSTELLATION.ADD_NODE_DIAMETER,
              height: CONSTELLATION.ADD_NODE_DIAMETER,
              borderStyle: "dashed",
              borderColor: tokens.surfaceBorder,
              color: tokens.textFaint,
              background: tokens.light ? "rgba(255,255,255,0.6)" : "rgba(12,15,22,0.55)",
            }}
          >
            ＋
          </span>
        </button>

        {/* Suggestions（可拖入 Add Zone，§37–§39） */}
        {space.suggestions
          .filter((s) => !dismissedSuggestions.includes(s.label))
          .slice(0, 3)
          // eslint-disable-next-line react-hooks/refs -- 建议对象 handlers 仅在事件期执行；静态分析无法区分
          .map((s, i) => {
            const base = { x: 470, y: -160 + i * 160 }
            const draggingThis = suggestionDrag?.label === s.label
            return renderer.renderSuggestion(
              {
                label: s.label,
                rationale: s.rationale,
                x: draggingThis && suggestionDrag ? suggestionDrag.world.x : base.x,
                y: draggingThis && suggestionDrag ? suggestionDrag.world.y : base.y,
                expanded: hoveredSuggestion === s.label,
                dragging: draggingThis,
                overAddZone: Boolean(draggingThis && suggestionDrag && isInsideAddZone(suggestionDrag.world)),
              },
              suggestionHandlers,
            )
          })}
      </div>

      {/* Peek（§25–§28）：空间保持，只在对象邻近展开 */}
      {peekDimension && peekLayout && peekPosition && (
        <div
          className="absolute z-30 rounded-2xl border p-4 shadow-lg"
          style={{
            left: peekPosition.x,
            top: peekPosition.y,
            width: 306,
            borderColor: tokens.surfaceBorder,
            background: tokens.light ? "rgba(255,255,255,0.96)" : "rgba(16,20,28,0.96)",
            color: tokens.textPrimary,
            backdropFilter: "blur(6px)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          role="dialog"
          aria-label={`${peekDimension.label} 概要`}
        >
          <div className="text-[15px] font-medium">{peekDimension.label}</div>
          <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            {(space.claims.find((c) => c.dimensionId === peekDimension.dimensionId)?.text ?? peekDimension.researchQuestion).slice(0, 96)}…
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {space.claims
              .filter((c) => c.dimensionId === peekDimension.dimensionId)
              .slice(0, 3)
              .map((c) => (
                <li key={c.claimId} className="text-[12px] leading-snug" style={{ color: tokens.textSecondary }}>
                  <span className="mr-1 font-mono text-[10px]" style={{ color: tokens.textFaint }}>
                    {c.type.toUpperCase()}
                  </span>
                  {c.text.slice(0, 62)}
                </li>
              ))}
          </ul>
          <div className="mt-2.5 flex gap-3 font-mono text-[10.5px]" style={{ color: tokens.textFaint }}>
            <span>{peekDimension.evidenceIds.length} evidence</span>
            <span style={{ color: tokens.conflict }}>
              {space.claims.filter((c) => c.dimensionId === peekDimension.dimensionId && c.signal === "conflict").length} conflict
            </span>
            <span style={{ color: tokens.unknown }}>
              {space.claims.filter((c) => c.dimensionId === peekDimension.dimensionId && c.type === "unknown").length} unknown
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3 text-[12px]">
            <button
              type="button"
              onClick={() => {
                onSemanticEvent?.({ type: "open_research", dimensionId: peekDimension.dimensionId, source: "click" })
                onOpenDimension(peekDimension.dimensionId)
                setPeekDimensionId(null)
              }}
              className="font-medium"
              style={{ color: tokens.accent }}
            >
              Explore region →
            </button>
            <button
              type="button"
              onClick={() =>
                setSummaries((prev) =>
                  pinSummary(
                    prev,
                    {
                      dimensionId: peekDimension.dimensionId,
                      label: peekDimension.label,
                      summary: peekDimension.researchQuestion,
                      claims: space.claims
                        .filter((c) => c.dimensionId === peekDimension.dimensionId)
                        .slice(0, 3)
                        .map((c) => ({ text: c.text, type: c.type, signal: c.signal })),
                      status: peekDimension.status,
                    },
                    { x: 320 + prev.length * 30, y: -260 + prev.length * 40 },
                  ),
                )
              }
              className="transition hover:opacity-80"
              style={{ color: tokens.textSecondary }}
            >
              Pin summary
            </button>
            <button
              type="button"
              onClick={() => {
                setParked((prev) => parkDimension(peekDimension.dimensionId, prev))
                setPeekDimensionId(null)
              }}
              className="transition hover:opacity-80"
              style={{ color: tokens.textSecondary }}
            >
              Park
            </button>
          </div>
          <div className="mt-2 text-[10.5px]" style={{ color: tokens.textFaint }}>
            Enter 打开 · Esc 关闭
          </div>
        </div>
      )}

      {/* Summary Sheets（§29–§32）：可拖动 workspace 对象 */}
      {summaries.map((s) => {
        const screen = toScreen(s.position.x, s.position.y)
        return (
          <div
            key={s.id}
            data-summary-id={s.id}
            className="absolute z-20 cursor-grab active:cursor-grabbing"
            style={{
              left: screen.x,
              top: screen.y,
              width: s.collapsed ? 150 : 244,
              // Task 15 §46：flat paper / 小圆角 / 强排版 / 极弱阴影 —— research note 而非 SaaS popover
              borderRadius: 4,
              border: `1px solid ${tokens.surfaceBorder}`,
              background: tokens.light ? "rgba(252,251,248,0.97)" : "rgba(16,20,28,0.94)",
              color: tokens.textPrimary,
              boxShadow: drag?.kind === "summary" ? "0 10px 30px rgba(0,0,0,0.18)" : "0 1px 3px rgba(0,0,0,0.08)",
              padding: "10px 12px",
              transition: drag?.kind === "summary" ? "none" : "width 200ms ease-out, box-shadow 200ms ease-out",
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              const rect = getContainerRect()
              const world = toWorld(e.clientX - rect.left, e.clientY - rect.top)
              setSelectedSummaryId(s.id)
              setDragState({ kind: "summary", summaryId: s.id, offset: { x: world.x - s.position.x, y: world.y - s.position.y } })
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div
                className="font-mono text-[9.5px] tracking-[0.16em]"
                style={{ color: tokens.textFaint }}
              >
                {s.collapsed ? s.label : "RESEARCH NOTE"}
              </div>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  setSummaries((prev) => prev.map((x) => (x.id === s.id ? { ...x, collapsed: !x.collapsed } : x)))
                }}
                aria-label={s.collapsed ? "展开研究笔记" : "折叠研究笔记"}
                className="text-[10px] transition hover:opacity-80"
                style={{ color: tokens.textFaint }}
              >
                {s.collapsed ? "▢" : "—"}
              </button>
            </div>
            {!s.collapsed && (
              <>
                <div className="mt-1 text-[13.5px] font-medium tracking-tight">{s.label}</div>
                <ul className="mt-1.5 space-y-1">
                  {s.claims.map((c, i) => (
                    <li key={i} className="text-[11px] leading-snug" style={{ color: tokens.textSecondary }}>
                      {c.text.slice(0, 54)}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center justify-between text-[10.5px]" style={{ color: tokens.textFaint }}>
                  <span>{s.status}</span>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSummaries((prev) => prev.filter((x) => x.id !== s.id))
                    }}
                    className="transition hover:opacity-80"
                  >
                    Remove
                  </button>
                </div>
              </>
            )}
            {/* §47：仅选中该 note 时绘制极弱 annotation tether 指向来源 Dimension */}
            {selectedSummaryId === s.id && (
              <svg
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2"
                width={400}
                height={400}
                style={{ overflow: "visible" }}
              >
                {(() => {
                  const source = layoutById.get(s.dimensionId)
                  if (!source) return null
                  const from = toScreen(source.x, source.y)
                  const dx = from.x - screen.x - 8
                  const dy = from.y - screen.y - 8
                  return (
                    <line
                      x1={8}
                      y1={8}
                      x2={dx}
                      y2={dy}
                      stroke={tokens.textFaint}
                      strokeWidth={0.8}
                      strokeDasharray="2 4"
                      opacity={0.7}
                    />
                  )
                })()}
              </svg>
            )}
          </div>
        )
      })}

      {/* Focus Zone affordance（§35–§36，空间级聚焦，不是阅读模式） */}
      {focusZoneActive && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: (CONSTELLATION.CORE_SIZE + 300) * camera.scale,
            height: (CONSTELLATION.CORE_SIZE + 300) * camera.scale,
            border: `1px dashed ${tokens.accent}55`,
          }}
        />
      )}

      {/* Proximity affordance（§40，仅提示，不实现 Combine） */}
      {proximity && dragPosition && (
        <div
          className="pointer-events-none absolute z-30 rounded-full border px-3 py-1.5 text-[11.5px]"
          style={{
            left: toScreen(dragPosition.x, dragPosition.y).x,
            top: toScreen(dragPosition.x, dragPosition.y).y - 58,
            borderColor: tokens.accent,
            background: tokens.light ? "rgba(255,255,255,0.95)" : "rgba(16,20,28,0.95)",
            color: tokens.accent,
          }}
        >
          Explore together · {proximity.label}
        </div>
      )}

      {/* Marquee（§21–§22） */}
      {marqueeRect && (
        <div
          className="pointer-events-none absolute z-30 rounded-sm border"
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.width,
            height: marqueeRect.height,
            borderColor: tokens.accent,
            background: `${tokens.accent}14`,
          }}
        />
      )}
      {drag?.kind === "marquee" && (
        <div
          className="absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border px-4 py-2 text-[12px]"
          style={{
            borderColor: tokens.surfaceBorder,
            background: tokens.light ? "rgba(255,255,255,0.95)" : "rgba(16,20,28,0.95)",
            color: tokens.textPrimary,
          }}
        >
          <span>{focus.selected.length} selected</span>
          <button type="button" style={{ color: tokens.accent }} onClick={() => setFocus((f) => focusSelected(f.selected))}>
            Focus
          </button>
          <button
            type="button"
            style={{ color: tokens.textSecondary }}
            onClick={() => {
              setManualPositions({})
              setLayoutMode("gather")
            }}
          >
            Gather
          </button>
          <button type="button" style={{ color: tokens.textSecondary }} onClick={() => setFocus(showAll())}>
            Clear
          </button>
        </div>
      )}

      {/* Parked counter（§34） */}
      {parked.length > 0 && (
        <button
          type="button"
          onClick={() => setParked([])}
          className="absolute bottom-24 right-8 z-30 rounded-full border px-3.5 py-2 text-[11.5px]"
          style={{
            borderColor: tokens.surfaceBorder,
            background: tokens.light ? "rgba(255,255,255,0.95)" : "rgba(16,20,28,0.95)",
            color: tokens.textSecondary,
          }}
        >
          {parked.length} parked · 全部恢复
        </button>
      )}

      {/* Status / selection bar */}
      {(focus.selected.length > 0 || focus.focused.length > 0) && (
        <div
          className="absolute bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border px-4 py-2 text-[12px]"
          style={{
            borderColor: tokens.surfaceBorder,
            background: tokens.light ? "rgba(255,255,255,0.95)" : "rgba(16,20,28,0.95)",
            color: tokens.textPrimary,
          }}
        >
          <span>{focus.focused.length > 0 ? `Focus: ${focus.focused.length}` : `${focus.selected.length} selected`}</span>
          {focus.selected.length > 0 && focus.focused.length === 0 && (
            <button type="button" style={{ color: tokens.accent }} onClick={() => setFocus((f) => focusSelected(f.selected))}>
              Focus selected
            </button>
          )}
          <button type="button" style={{ color: tokens.textSecondary }} onClick={() => setFocus(showAll())}>
            Show all
          </button>
        </div>
      )}

      {/* MiniMap（§49，仅 camera 偏离时） */}
      {miniMap && (
        <div
          className="absolute bottom-24 left-8 z-30 rounded-lg border p-2"
          style={{
            width: 132,
            borderColor: tokens.surfaceBorder,
            background: tokens.light ? "rgba(255,255,255,0.9)" : "rgba(16,20,28,0.9)",
          }}
          aria-label="Mini map"
        >
          <svg width={116} height={78} viewBox="0 0 116 78" aria-hidden>
            {(() => {
              const bounds = miniMap.bounds
              const core = worldToMiniMap({ x: 0, y: 0 }, bounds, { width: 116, height: 78 })
              const vr = miniMap.viewportRect
              const a = worldToMiniMap({ x: vr.minX, y: vr.minY }, bounds, { width: 116, height: 78 })
              const b = worldToMiniMap({ x: vr.maxX, y: vr.maxY }, bounds, { width: 116, height: 78 })
              return (
                <>
                  <circle cx={core.x} cy={core.y} r={4} fill={tokens.accent} />
                  {layouts.map((l) => {
                    const p = worldToMiniMap({ x: l.x, y: l.y }, bounds, { width: 116, height: 78 })
                    return <circle key={l.dimensionId} cx={p.x} cy={p.y} r={2.4} fill={tokens.textSecondary} />
                  })}
                  <rect
                    x={a.x}
                    y={a.y}
                    width={Math.max(b.x - a.x, 6)}
                    height={Math.max(b.y - a.y, 6)}
                    fill="none"
                    stroke={tokens.textFaint}
                    strokeDasharray="3 3"
                  />
                </>
              )
            })()}
          </svg>
        </div>
      )}

      {/* Task 15 §2/§3/§49：AI 部分失败不再产生页面级失败视觉；
          降级信息以最小状态出现在对应对象上（见 dimension footer），此处仅保留一句轻提示（无 banner 容器） */}
      {space.ai.status !== "success" && (
        <div
          className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 text-[11.5px]"
          style={{ color: tokens.textFaint }}
        >
          {COPY.interpretationTemporarilyUnavailable}
        </div>
      )}

      {/* Suggestion drag 提示 */}
      {suggestionDrag && (
        <div
          className="pointer-events-none absolute bottom-40 left-1/2 z-40 -translate-x-1/2 rounded-full border px-3.5 py-1.5 text-[11.5px]"
          style={{
            borderColor: tokens.accent,
            background: tokens.light ? "rgba(255,255,255,0.96)" : "rgba(16,20,28,0.96)",
            color: tokens.accent,
          }}
        >
          DROP INTO ADD ZONE TO ADD RESEARCH
        </div>
      )}

      <span className="sr-only">
        使用相机平移与缩放浏览研究空间；拖动研究维度调整位置；Shift 点击选择，Shift 拖拽框选。
        Renderer: {renderer.id}
        {addLensOpen ? "（Add lens 打开中）" : ""}
      </span>
    </div>
  )
}
