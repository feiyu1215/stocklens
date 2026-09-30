"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import { IDENTITY_CAMERA, computeFitCamera, panCamera, screenToWorld, zoomAtPointer, boundsOfObjects, type CameraState } from "@/lib/spatial/camera"
import { V4, paintField, paintPlate } from "@/lib/v4/media"

// Company World V2（Task 15.2R）——按指定参考复现，不做自由设计。
// 复现 Unseen World 的可观察语法（§2）：full-viewport world / 无侧栏 / 无卡片矩阵 /
// 单一主导视觉体 / 无边框媒体对象散布（不等大、出血）/ 极少 chrome / drag = navigation。
// 本阶段只实现：Company World + Pan + Dimension hover（§44）。Peek / Reading / My World 不做（§46–48）。

interface PlateSlot {
  dimensionId: string
  label: string
  status: string
  evidenceCount: number
  conflict: boolean
  /** 世界坐标（媒体片中心） */
  x: number
  y: number
  w: number
  h: number
  rot: number
  titleSize: number
  /** 标题相对媒体片的位置 */
  side: "left" | "right" | "above"
  missing?: string[]
}

/** 散布构图：主对象偏中、其余向外环散开，不等大、出血裁剪（§11–§13） */
const SLOTS: { x: number; y: number; w: number; h: number; rot: number; titleSize: number; side: PlateSlot["side"] }[] = [
  { x: 900, y: 520, w: 470, h: 292, rot: -1.6, titleSize: 42, side: "left" },
  { x: 1560, y: 340, w: 380, h: 236, rot: 1.2, titleSize: 28, side: "left" },
  { x: 1880, y: 820, w: 360, h: 224, rot: -0.8, titleSize: 22, side: "left" },
  { x: 1290, y: 950, w: 290, h: 180, rot: 0.9, titleSize: 20, side: "left" },
  { x: 790, y: 800, w: 250, h: 156, rot: -1.9, titleSize: 17, side: "left" },
  { x: 1980, y: 180, w: 280, h: 174, rot: 0.4, titleSize: 16, side: "left" },
]

const WORLD = { width: 2300, height: 1500 } as const

export default function CompanyWorldV2() {
  const [payload, setPayload] = useState<ResearchSpacePayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [camera, setCamera] = useState<CameraState>({ ...IDENTITY_CAMERA })
  const [viewport, setViewport] = useState({ width: 1440, height: 900 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const dragRef = useRef<{ lastX: number; lastY: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // fixture（固定 Midea canonical fixture，§9；?live=1 切真实 API）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      try {
        const res = await fetch("/api/observatory/fixture?name=midea-artdirection")
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

  // 散布槽位（按 priority；unknown 走边缘位）
  const plates: PlateSlot[] = useMemo(() => {
    if (!payload) return []
    const dims = [...payload.dimensions].sort((a, b) => a.priority - b.priority)
    let slotIndex = 0
    return dims.map((d) => {
      const isUnknown = d.status === "unknown"
      const slot = isUnknown
        ? { x: 1180, y: 1120, w: 330, h: 208, rot: -1.2, titleSize: 17, side: "left" as const }
        : SLOTS[Math.min(slotIndex++, SLOTS.length - 1)]
      const conflicts = payload.claims.filter((c) => c.dimensionId === d.dimensionId && c.signal === "conflict").length
      return {
        dimensionId: d.dimensionId,
        label: d.label,
        status: d.status,
        evidenceCount: d.evidenceIds.length,
        conflict: conflicts > 0,
        x: slot.x,
        y: slot.y,
        w: slot.w,
        h: slot.h,
        rot: slot.rot,
        titleSize: slot.titleSize,
        side: slot.side,
        missing: d.missingInformation,
      }
    })
  }, [payload])

  // 初始 fit（世界总在视口内完整可见，但 media field 铺满全屏 → 无空白栏，§37）
  useEffect(() => {
    if (plates.length === 0) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      const bounds = boundsOfObjects(plates.map((p) => ({ x: p.x, y: p.y, width: p.w, height: p.h })))
      if (bounds) setCamera(computeFitCamera(bounds, viewport, 170))
    })()
    return () => {
      cancelled = true
    }
  }, [plates, viewport])

  // ---- Pan（§2/§33：drag 整个世界；FigJam 物理沿用 camera 数学） ----
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { lastX: e.clientX, lastY: e.clientY }
    setDragging(true)
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // 合成事件下可能失败，不影响交互
    }
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.lastX
    const dy = e.clientY - drag.lastY
    drag.lastX = e.clientX
    drag.lastY = e.clientY
    setCamera((c) => panCamera(c, dx, dy))
  }, [])
  const onPointerUp = useCallback(() => {
    dragRef.current = null
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

  const transform = `translate3d(${-camera.x * camera.scale}px, ${-camera.y * camera.scale}px, 0) scale(${camera.scale})`
  const hovered = plates.find((p) => p.dimensionId === hoverId) ?? null
  const company = payload?.company
  const industryEn = company?.industryName === "白色家电" ? "WHITE GOODS" : company?.industryName ?? ""

  // hover 时的 spotlight 屏幕位置（media 响应，§14）
  const spotScreen = useMemo(() => {
    if (!hovered) return null
    return {
      x: (hovered.x - camera.x) * camera.scale + viewport.width / 2,
      y: (hovered.y - camera.y) * camera.scale + viewport.height / 2,
      r: Math.max(hovered.w, hovered.h) * camera.scale * 0.9,
    }
  }, [hovered, camera, viewport])

  void screenToWorld // 保留导入（后续阶段复用）

  if (failed) {
    return (
      <main className="flex h-screen w-screen items-center justify-center" style={{ background: V4.ink, color: V4.textPrimary }}>
        <div className="font-mono text-[12px]" style={{ color: V4.textSecondary }}>
          FIXTURE UNAVAILABLE
        </div>
      </main>
    )
  }

  return (
    <main
      ref={containerRef}
      className="relative h-screen w-screen select-none overflow-hidden"
      style={{ background: V4.ink, color: V4.textPrimary, cursor: dragging ? "grabbing" : "grab" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    >
      {/* WORLD LAYER：media field + 媒体对象 + typography，全部在同一世界层 → drag 移动的是世界 */}
      <div className="absolute left-1/2 top-1/2" style={{ transform, transformOrigin: "0 0", transition: dragging ? "none" : "transform 140ms linear" }}>
        <FieldCanvas />
        {plates.map((p) => (
          <Plate
            key={p.dimensionId}
            plate={p}
            hovered={hoverId === p.dimensionId}
            dimmed={hoverId !== null && hoverId !== p.dimensionId}
            onHover={setHoverId}
            claims={payload?.claims ?? []}
          />
        ))}
      </div>

      {/* hover 聚光（media 响应；不动布局，只改光） */}
      {spotScreen && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: `radial-gradient(${Math.max(spotScreen.r * 2.6, 420)}px ${Math.max(spotScreen.r * 2.2, 360)}px at ${spotScreen.x}px ${spotScreen.y}px, rgba(196,214,238,0.12) 0%, rgba(10,12,16,0) 62%)`,
            transition: "background 420ms ease-out",
          }}
        />
      )}

      {/* CHROME（极少，§2）：左 wordmark / 右 ticker / 底部 drag hint */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-7 py-6 font-mono text-[11px] tracking-[0.24em]">
        <span style={{ color: V4.textPrimary }}>STOCKLENS</span>
        {company && (
          <span style={{ color: V4.textSecondary }}>
            {company.stockCode} · {industryEn}
          </span>
        )}
      </header>

      {/* Company identity（§39：48–72px；左侧大面积负空间） */}
      {company && (
        <div className="pointer-events-none absolute bottom-[13%] left-8 z-30 max-w-[420px]">
          <h1 className="text-[64px] font-medium leading-[0.96] tracking-[-0.02em]" style={{ color: V4.textPrimary }}>
            {company.stockName}
          </h1>
          <div className="mt-3 font-mono text-[11px] tracking-[0.24em]" style={{ color: V4.textSecondary }}>
            {(company.stockName === "美的集团" ? "MIDEA GROUP" : company.stockName.toUpperCase().slice(0, 14))} · {company.stockCode}
          </div>
          <div className="mt-1.5 font-mono text-[10.5px] tracking-[0.22em]" style={{ color: V4.textFaint }}>
            {industryEn} · {plates.length} RESEARCH DIMENSIONS
          </div>
        </div>
      )}

      {/* drag affordance（§2：clear drag-to-explore） */}
      <div
        className="pointer-events-none absolute bottom-7 left-1/2 z-30 -translate-x-1/2 font-mono text-[10px] tracking-[0.28em]"
        style={{ color: V4.textFaint }}
      >
        DRAG TO EXPLORE
      </div>
      <div className="pointer-events-none absolute bottom-7 right-8 z-30 font-mono text-[10px] tracking-[0.22em]" style={{ color: V4.textFaint }}>
        ⌘K
      </div>
    </main>
  )
}

/** 世界底场：满屏（比视野更大，边界不可见） */
function FieldCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = Math.round(WORLD.width * 1.1)
    c.height = Math.round(WORLD.height * 1.1)
    const ctx = c.getContext("2d")
    if (!ctx) return
    paintField(ctx, c.width, c.height)
  }, [])
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="absolute left-0 top-0 origin-top-left"
      style={{ width: WORLD.width * 1.1, height: WORLD.height * 1.1 }}
    />
  )
}

/**
 * Dimension 媒体对象（§4/§5：无边框媒体片 + 排版；默认只显示 label + 极简计数，
 * 摘要与 evidence 细节 hover 才 reveal，§6）
 */
function Plate({
  plate,
  hovered,
  dimmed,
  onHover,
  claims,
}: {
  plate: PlateSlot
  hovered: boolean
  dimmed: boolean
  onHover: (id: string | null) => void
  claims: ResearchSpacePayload["claims"]
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = Math.round(plate.w * 1.6)
    c.height = Math.round(plate.h * 1.6)
    const ctx = c.getContext("2d")
    if (!ctx) return
    paintPlate(ctx, c.width, c.height, plate.dimensionId)
  }, [plate.dimensionId, plate.w, plate.h])

  const isUnknown = plate.status === "unknown"
  const topClaim = claims.find((c) => c.dimensionId === plate.dimensionId && c.type !== "unknown")

  return (
    <div
      data-plate-id={plate.dimensionId}
      onPointerEnter={() => onHover(plate.dimensionId)}
      onPointerLeave={() => onHover(null)}
      className="absolute"
      style={{
        left: plate.x - plate.w / 2,
        top: plate.y - plate.h / 2,
        width: plate.w,
        opacity: dimmed ? 0.26 : 1,
        transition: "opacity 380ms ease-out",
        zIndex: hovered ? 20 : 1,
      }}
    >
      <div
        style={{
          transform: `rotate(${plate.rot}deg) scale(${hovered ? 1.03 : 1})`,
          transition: "transform 520ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* 媒体片：无边框、无白面；UNKNOWN = 模糊/遮蔽的视觉区（§43），不是白卡 */}
        <canvas
          ref={ref}
          className="block w-full"
          style={{
            height: plate.h,
            filter: isUnknown ? "blur(7px) brightness(0.72) saturate(0.7)" : "none",
            maskImage: isUnknown
              ? "radial-gradient(ellipse 68% 62% at 50% 50%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.28) 72%, transparent 100%)"
              : undefined,
            WebkitMaskImage: isUnknown
              ? "radial-gradient(ellipse 68% 62% at 50% 50%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.28) 72%, transparent 100%)"
              : undefined,
          }}
        />

        {/* Typography hotspots（§5：远景只有 label；hover 才给计数与 evidence） */}
        <div className="mt-3.5">
          <div className="flex items-baseline gap-3">
            <span
              className="font-medium leading-tight tracking-[-0.01em]"
              style={{
                fontSize: plate.titleSize,
                color: isUnknown ? V4.amber : V4.textPrimary,
                opacity: hovered ? 1 : 0.92,
                textShadow: "0 2px 24px rgba(5,7,10,0.9)",
                wordBreak: "keep-all",
                transition: "opacity 300ms ease-out",
              }}
            >
              {plate.label}
            </span>
            {isUnknown ? (
              <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: V4.amber }}>
                EVIDENCE INCOMPLETE
              </span>
            ) : (
              <span
                className="font-mono text-[10px] tracking-[0.2em]"
                style={{ color: hovered ? V4.textSecondary : V4.textFaint, transition: "color 300ms ease-out" }}
              >
                ↗ {plate.evidenceCount} {hovered ? "EVIDENCE" : ""}
                {hovered && plate.conflict && <span style={{ color: V4.coral }}> · CONFLICT</span>}
              </span>
            )}
          </div>

          {/* hover reveal：细 rule + 顶部 claim + evidence technical marks（§6/§14） */}
          {hovered && !isUnknown && (
            <div className="mt-2.5 max-w-[320px]" style={{ animation: "v4-reveal 320ms ease-out" }}>
              <div className="h-px w-full" style={{ background: "rgba(200,214,230,0.24)" }} />
              {topClaim && (
                <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: V4.textSecondary }}>
                  {topClaim.text.slice(0, 72)}…
                </p>
              )}
              <EvidenceMarks dimensionId={plate.dimensionId} evidenceCount={plate.evidenceCount} />
            </div>
          )}
          {hovered && isUnknown && plate.missing && plate.missing.length > 0 && (
            <ul className="mt-2 max-w-[300px] space-y-1" style={{ animation: "v4-reveal 320ms ease-out" }}>
              {plate.missing.slice(0, 3).map((m) => (
                <li key={m} className="font-mono text-[10.5px] leading-relaxed" style={{ color: V4.amber, opacity: 0.85 }}>
                  · {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** Evidence technical marks（§38 语言：`01 名称 数值 ──●`）；数据来自真实 fixture */
function EvidenceMarks({ dimensionId, evidenceCount }: { dimensionId: string; evidenceCount: number }) {
  const [marks, setMarks] = useState<{ index: string; title: string; value: string }[]>([])
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      try {
        const res = await fetch("/api/observatory/fixture?name=midea-artdirection")
        if (!res.ok) return
        const data = (await res.json()) as ResearchSpacePayload
        const dim = data.dimensions.find((d) => d.dimensionId === dimensionId)
        if (!dim) return
        const rows: { index: string; title: string; value: string }[] = []
        dim.evidenceIds.slice(0, 2).forEach((id, i) => {
          const ev = data.evidence.find((e) => e.evidenceId === id)
          const metric = data.metrics.find((m) => ev && m.metricId === ev.metricIds[0])
          if (!ev || !metric) return
          const v = metric.value
          rows.push({
            index: String(i + 1).padStart(2, "0"),
            title: metric.name,
            value: v === null || v === undefined ? "—" : `${typeof v === "number" ? (Math.abs(v) < 100 ? v.toFixed(2) : v.toFixed(0)) : v}${metric.unit === "%" ? "%" : ""}`,
          })
        })
        if (!cancelled) setMarks(rows)
      } catch {
        // 静默：hover 细节不可用不影响世界
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dimensionId])

  if (marks.length === 0) {
    return (
      <div className="mt-2 font-mono text-[10px] tracking-[0.18em]" style={{ color: V4.textFaint }}>
        {evidenceCount} EVIDENCE
      </div>
    )
  }
  return (
    <div className="mt-2.5 space-y-1.5">
      {marks.map((m) => (
        <div key={m.index} className="flex items-center gap-2">
          <span className="w-4 font-mono text-[9.5px]" style={{ color: V4.textFaint }}>
            {m.index}
          </span>
          <span className="text-[11px]" style={{ color: V4.textSecondary }}>
            {m.title}
          </span>
          <span className="ml-auto font-mono text-[12px]" style={{ color: V4.textPrimary, fontVariantNumeric: "tabular-nums" }}>
            {m.value}
          </span>
          <svg width="30" height="6" aria-hidden>
            <line x1="0" y1="3" x2="22" y2="3" stroke="rgba(200,214,230,0.4)" strokeWidth="1" />
            <circle cx="26" cy="3" r="2" fill={V4.cobalt} />
          </svg>
        </div>
      ))}
    </div>
  )
}
