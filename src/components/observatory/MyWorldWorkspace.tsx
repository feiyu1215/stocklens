"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { StockSearchItem } from "@/lib/data/stock-search"
import type { CameraState, Viewport } from "@/lib/spatial/camera"
import { isCameraDeviated, panCamera, worldToScreen, zoomAtPointer } from "@/lib/spatial/camera"
import {
  activeCompanyAtCenter,
  companyVisualTier,
  computeWorldLayout,
  magneticSnapTarget,
  stepCompanyTarget,
} from "@/lib/world/traversal"
import type { WorldCompany } from "@/lib/world/types"
import type { WorldRenderer } from "./renderers/types"

// My World Workspace（Task 14 §3/§8–§14/§58–§66）：
// 多公司横向空间。复用 Task 13 的 camera 模型与交互原语（pan/zoom/键盘），
// 不维护第二套交互系统；Level 层（World / Company）由 ObservatoryApp 管理。
// 只有显式 Enter research 才触发研究 API（§12/§68）。

export function MyWorldWorkspace({
  renderer,
  companies,
  activeCode,
  camera,
  onCameraChange,
  onActiveChange,
  onEnterResearch,
  onToggleSaved,
  onAddCompany,
  enteringCode = null,
}: {
  renderer: WorldRenderer
  companies: WorldCompany[]
  activeCode: string | null
  camera: CameraState
  onCameraChange: (camera: CameraState) => void
  onActiveChange: (stockCode: string | null) => void
  onEnterResearch: (stockCode: string) => void
  onToggleSaved: (stockCode: string) => void
  onAddCompany: (item: StockSearchItem) => void
  /** §26–§29：正在 morph 进 Company World 的对象（其他对象收紧让位，§58） */
  enteringCode?: string | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerRect, setContainerRect] = useState({ left: 0, top: 0, width: 1440, height: 900 })
  const viewport: Viewport = useMemo(
    () => ({ width: containerRect.width, height: containerRect.height }),
    [containerRect.width, containerRect.height],
  )
  const [drag, setDrag] = useState<{ lastScreen: { x: number; y: number } } | null>(null)
  const dragRef = useRef<{ lastScreen: { x: number; y: number } } | null>(null)
  const setDragState = useCallback((next: { lastScreen: { x: number; y: number } } | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<StockSearchItem[]>([])

  const positions = useMemo(() => computeWorldLayout(companies), [companies])

  useEffect(() => {
    const update = () => {
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setContainerRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  // active company：视口中心最近者（§11），不自动进入 Research
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve() // 异步边界：避免 effect 内同步 setState（父级）
      if (!cancelled) onActiveChange(activeCompanyAtCenter(camera, viewport, positions))
    })()
    return () => {
      cancelled = true
    }
  }, [camera, viewport, positions, onActiveChange])

  // trackpad / wheel 横滑（§9/§62）：水平滚动驱动 world camera
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.6) {
        // 缩放（与 Company World 同一 camera 语义）
        const rect = el.getBoundingClientRect()
        onCameraChange(
          zoomAtPointer(camera, { width: rect.width, height: rect.height }, { x: e.clientX - rect.left, y: e.clientY - rect.top }, Math.exp(-e.deltaY * 0.0016)),
        )
        return
      }
      const next = panCamera(camera, -e.deltaX, 0)
      const snap = magneticSnapTarget(next, { width: el.clientWidth, height: el.clientHeight }, positions)
      onCameraChange(snap !== null ? { ...next, x: snap } : next)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [camera, onCameraChange, positions])

  // 键盘 ← → 穿行（§62）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      const target = stepCompanyTarget(activeCode, companies, positions, e.key === "ArrowLeft" ? -1 : 1)
      if (target === null) return
      e.preventDefault()
      onCameraChange({ ...camera, x: target })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeCode, companies, positions, camera, onCameraChange])

  // 搜索公司（§8/§61）：复用 /api/stocks/search；仅加 metadata，不触发研究 API
  useEffect(() => {
    const q = query.trim()
    let cancelled = false
    const timer = setTimeout(async () => {
      if (q.length === 0) {
        setResults([])
        return
      }
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`)
        const body = (await res.json()) as { items?: StockSearchItem[] }
        if (!cancelled) setResults(body.items ?? [])
      } catch {
        if (!cancelled) setResults([])
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-world-company]") || target.closest("[data-world-ui]")) return
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // 合成事件下可能失败，不影响主流程
    }
    setDragState({ lastScreen: { x: e.clientX, y: e.clientY } })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const dragState = dragRef.current
    if (!dragState) return
    const dx = e.clientX - dragState.lastScreen.x
    const dy = e.clientY - dragState.lastScreen.y
    const panned = panCamera(camera, dx, dy)
    const snap = magneticSnapTarget(panned, viewport, positions)
    onCameraChange(snap !== null ? { ...panned, x: snap } : panned)
    setDragState({ lastScreen: { x: e.clientX, y: e.clientY } })
  }

  const onPointerUp = () => {
    setDragState(null)
  }

  const activeCompany = companies.find((c) => c.stockCode === activeCode) ?? null

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      data-renderer-id={renderer.id}
      data-world-level="my-world"
      aria-label="My World"
      style={{ cursor: drag ? "grabbing" : "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDragState(null)}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          transform: `translate(${-camera.x * camera.scale}px, ${-camera.y * camera.scale}px) scale(${camera.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {renderer.renderWorld
          ? renderer.renderWorld({
              companies,
              positions,
              activeCode,
              tierOf: (code) => companyVisualTier(code, activeCode, companies),
              onEnter: (code) => onEnterResearch(code),
              onToggleSaved: (code) => onToggleSaved(code),
            })
          : null}
      </div>

      {/* Company → Company World morph（§26–§29/§57–§58）：
          记录 source object 的屏幕位置，光晕从该对象扩张；其他对象收拢变暗。
          数据在背后解析，morph 结束才切换 Level（§61）。 */}
      {enteringCode && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
          <div
            className="absolute inset-0"
            style={{
              background: renderer.tokens.light ? "rgba(246,245,241,0.55)" : "rgba(7,9,14,0.55)",
              animation: "observatory-recede 760ms ease-out forwards",
            }}
          />
          {(() => {
            const pos = positions.find((p) => p.stockCode === enteringCode)
            if (!pos) return null
            const screen = worldToScreen(camera, viewport, pos.x, pos.y)
            const company = companies.find((c) => c.stockCode === enteringCode)
            return (
              <>
                <div
                  className="absolute rounded-full"
                  style={{
                    left: screen.x,
                    top: screen.y,
                    width: 220,
                    height: 220,
                    marginLeft: -110,
                    marginTop: -110,
                    border: `1px solid ${renderer.tokens.accent}`,
                    background: `radial-gradient(circle, ${renderer.tokens.accent}22 0%, transparent 62%)`,
                    animation: "observatory-morph-outward 760ms cubic-bezier(0.22,1,0.36,1) forwards",
                  }}
                />
                {/* 标签与对象同位：由 scrim 压暗的原标签 → morph 标签，读作「标签从地形上抬起」 */}
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                  style={{
                    left: screen.x,
                    top: screen.y,
                    color: renderer.tokens.textPrimary,
                    animation: "observatory-hold 760ms ease-out forwards",
                  }}
                >
                  <div className="text-[15px] font-medium">{company?.stockName ?? enteringCode}</div>
                  <div className="mt-0.5 font-mono text-[11px]" style={{ color: renderer.tokens.textSecondary }}>
                    {enteringCode}
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* Active company 轻提示（§64）+ Enter research（唯一 API 触发点，§12） */}
      {activeCompany && (
        <div
          data-world-ui
          className="absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-2xl border px-5 py-3 text-center backdrop-blur"
          style={{
            borderColor: renderer.tokens.surfaceBorder,
            background: renderer.tokens.light ? "rgba(255,255,255,0.92)" : "rgba(16,20,28,0.92)",
            color: renderer.tokens.textPrimary,
          }}
        >
          <div className="text-[16px] font-medium">{activeCompany.stockName}</div>
          <div className="mt-0.5 font-mono text-[11.5px]" style={{ color: renderer.tokens.textSecondary }}>
            {activeCompany.stockCode}
            {activeCompany.industryName ? ` · ${activeCompany.industryName}` : ""}
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-[12.5px]">
            <button type="button" onClick={() => onEnterResearch(activeCompany.stockCode)} style={{ color: renderer.tokens.accent }}>
              Enter research →
            </button>
            <button type="button" onClick={() => onToggleSaved(activeCompany.stockCode)} style={{ color: renderer.tokens.textSecondary }}>
              {activeCompany.isSaved ? "Unsave" : "Save"}
            </button>
            <button type="button" onClick={() => setSearchOpen(true)} style={{ color: renderer.tokens.textSecondary }}>
              Search company
            </button>
          </div>
          <div className="mt-1.5 text-[10.5px]" style={{ color: renderer.tokens.textFaint }}>
            拖动 / 触控板横滑 / ← → 穿行 · 缩放 {Math.round(camera.scale * 100)}%
          </div>
        </div>
      )}

      {/* 搜索（仅 metadata，不触发研究） */}
      {searchOpen && (
        <div
          data-world-ui
          className="absolute right-8 top-24 z-40 w-[320px] rounded-2xl border p-4 backdrop-blur"
          style={{
            borderColor: renderer.tokens.surfaceBorder,
            background: renderer.tokens.light ? "rgba(255,255,255,0.95)" : "rgba(16,20,28,0.95)",
            color: renderer.tokens.textPrimary,
          }}
        >
          <label htmlFor="world-search" className="text-[12px]">
            Search company（加入 My World，不进入研究）
          </label>
          <input
            id="world-search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例如：贵州茅台 / 600519"
            className="mt-2 w-full rounded-lg border px-3 py-2 text-[12.5px] outline-none"
            style={{
              borderColor: renderer.tokens.surfaceBorder,
              background: renderer.tokens.light ? "#fff" : "#0B0E14",
              color: renderer.tokens.textPrimary,
            }}
          />
          <ul className="mt-2 space-y-1">
            {results.map((item) => (
              <li key={item.stockCode}>
                <button
                  type="button"
                  onClick={() => {
                    onAddCompany(item)
                    setQuery("")
                    setResults([])
                    setSearchOpen(false)
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12.5px]"
                  style={{ color: renderer.tokens.textPrimary }}
                >
                  {item.stockName}
                  <span className="ml-2 font-mono text-[11px]" style={{ color: renderer.tokens.textFaint }}>
                    {item.stockCode}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            className="mt-2 text-[11px]"
            style={{ color: renderer.tokens.textFaint }}
          >
            关闭
          </button>
        </div>
      )}

      {/* MiniMap（与世界层同一 camera） */}
      {isCameraDeviated(camera) && (
        <div
          data-world-ui
          className="absolute bottom-24 left-8 z-30 rounded-lg border p-2"
          style={{
            width: 160,
            borderColor: renderer.tokens.surfaceBorder,
            background: renderer.tokens.light ? "rgba(255,255,255,0.9)" : "rgba(16,20,28,0.9)",
          }}
          aria-label="World mini map"
        >
          <svg width={144} height={44} viewBox="0 0 144 44" aria-hidden>
            {positions.map((p) => {
              const minX = Math.min(...positions.map((q) => q.x)) - 200
              const maxX = Math.max(...positions.map((q) => q.x)) + 200
              const x = ((p.x - minX) / Math.max(maxX - minX, 1)) * 144
              return <circle key={p.stockCode} cx={x} cy={22} r={p.stockCode === activeCode ? 4 : 2.6} fill={p.stockCode === activeCode ? renderer.tokens.accent : renderer.tokens.textFaint} />
            })}
            <rect
              x={Math.max(0, Math.min(144 - 18, 72 + (camera.x - (positions[0]?.x ?? 0)) * -0.06))}
              y={6}
              width={18}
              height={32}
              fill="none"
              stroke={renderer.tokens.textSecondary}
              strokeDasharray="3 3"
            />
          </svg>
        </div>
      )}

      <span className="sr-only">
        My World：横向穿行浏览研究过的公司；Enter research 进入公司研究空间。Renderer: {renderer.id}
      </span>
      <span className="sr-only">{String(worldToScreen(camera, viewport, 0, 0).x)}</span>
    </div>
  )
}
