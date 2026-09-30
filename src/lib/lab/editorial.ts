// Editorial Research World（Task 15.2 editorial 方向）——纯模型，无 React/three。
// 治理文档：docs/design-audit/task15-2-editorial/00-TASK15_2_EDITORIAL_SPEC.md
//
// 核心转译：Unseen 的 world scale + drag；OceanX 的 full-bleed media + typography over media；
// Lusion 的 visual confidence（大字、少 chrome）；Krea/Bruno 的统一动词 Explore。
// §13/§21：世界 = 一张高质量抽象 media，Dimension = media 上不同 crop/focal + editorial annotation。

import { stableHashUnit } from "@/lib/presentation/constellation-layout"

export interface EditorialDimension {
  dimensionId: string
  label: string
  status: "ready" | "partial" | "unknown"
  priority: number
  evidenceIds: string[]
}

export interface EditorialInput {
  dimensions: EditorialDimension[]
  suggestions: { label: string }[]
  company: { stockCode: string; stockName: string; industryName?: string }
}

// ---------- 非对称 annotation 构图（§16/§17：无中心环，尺寸层级） ----------
// 位置为 viewport 百分比；tier 决定字号层级（§49：32–48px focal，更小靠后）。

export interface AnnotationSpec {
  id: string
  kind: "dimension" | "unknown" | "suggestion"
  label: string
  status: string
  /** viewport 百分比 */
  x: number
  y: number
  tier: "focal" | "major" | "minor" | "label" | "hint"
  align: "left" | "right"
  evidenceCount: number
  conflict: boolean
}

const SPOTS: { x: number; y: number; tier: AnnotationSpec["tier"]; align: AnnotationSpec["align"] }[] = [
  { x: 9, y: 40, tier: "focal", align: "left" },
  { x: 71, y: 28, tier: "major", align: "left" },
  { x: 34, y: 15, tier: "minor", align: "left" },
  { x: 79, y: 63, tier: "label", align: "left" },
  { x: 20, y: 73, tier: "minor", align: "left" },
  { x: 57, y: 12, tier: "label", align: "left" },
]

const UNKNOWN_SPOT = { x: 88, y: 45 }
const SUGGESTION_SPOTS = [
  { x: 82, y: 86 },
  { x: 4, y: 12 },
]

export function composeAnnotations(input: EditorialInput, conflicts: Map<string, number>): AnnotationSpec[] {
  const dims = [...input.dimensions].sort((a, b) => a.priority - b.priority)
  const out: AnnotationSpec[] = []
  dims.forEach((dim, index) => {
    if (dim.status === "unknown") {
      out.push({
        id: dim.dimensionId,
        kind: "unknown",
        label: dim.label,
        status: "UNRESOLVED",
        x: UNKNOWN_SPOT.x,
        y: UNKNOWN_SPOT.y,
        tier: "label",
        align: "right",
        evidenceCount: 0,
        conflict: false,
      })
      return
    }
    const spot = SPOTS[Math.min(index, SPOTS.length - 1)]
    const jitter = (stableHashUnit(`${dim.dimensionId}:ax`) - 0.5) * 3
    out.push({
      id: dim.dimensionId,
      kind: "dimension",
      label: dim.label,
      status: dim.status.toUpperCase(),
      x: spot.x + jitter,
      y: spot.y,
      tier: spot.tier,
      align: spot.align,
      evidenceCount: dim.evidenceIds.length,
      conflict: (conflicts.get(dim.dimensionId) ?? 0) > 0,
    })
  })
  input.suggestions.slice(0, SUGGESTION_SPOTS.length).forEach((s, i) => {
    const spot = SUGGESTION_SPOTS[i]
    out.push({
      id: `suggestion:${s.label}`,
      kind: "suggestion",
      label: s.label,
      status: "UNEXPLORED",
      x: spot.x,
      y: spot.y,
      tier: "hint",
      align: spot.x > 50 ? "right" : "left",
      evidenceCount: 0,
      conflict: false,
    })
  })
  return out
}

/** tier → 排版（§48/§49：极端字号对比） */
export function tierStyle(tier: AnnotationSpec["tier"]): { size: number; weight: number; opacity: number } {
  switch (tier) {
    case "focal":
      return { size: 40, weight: 500, opacity: 1 }
    case "major":
      return { size: 30, weight: 480, opacity: 0.92 }
    case "minor":
      return { size: 21, weight: 450, opacity: 0.85 }
    case "label":
      return { size: 15, weight: 430, opacity: 0.8 }
    case "hint":
      return { size: 12, weight: 400, opacity: 0.6 }
  }
}

// ---------- Media（§13/§14/§15：自制抽象资产，确定性） ----------
// 抽象「航拍矿物勘探」图：大面积软形 + 细等高纹理 + 颗粒 + 渐晕。杂志 × 仪器（§26）。

export const MEDIA_PALETTE = {
  sky: "#EAE7DE",
  land: "#D6D0BF",
  ground: "#B3AB97",
  slate: "#8FA0B2",
  cobalt: "#5F7C9E",
  limestone: "#DCD5C2",
  khaki: "#B0A890",
  ochre: "#C0A171",
  graphite: "#63655F",
  ink: "#41454F",
} as const

function mulberry32(seed: number): () => number {
  let a = Math.floor(seed * 0xffffff) || 88675123
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 在给定 2D context 上绘制整幅 media（一次成型；调用方决定分辨率） */
export function paintEditorialMedia(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed = 20261001,
): void {
  const rand = mulberry32(seed / 0xffffff)
  const ink = MEDIA_PALETTE.ink

  // 基底：天→地 渐变（航拍视角的高空介质感）
  const base = ctx.createLinearGradient(0, 0, w * 0.1, h)
  base.addColorStop(0, "#E3DFD2")
  base.addColorStop(0.42, "#CBC5B0")
  base.addColorStop(0.75, "#B0A892")
  base.addColorStop(1, "#9A917A")
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  // 对角光扫（摄影布光感）
  const sweep = ctx.createLinearGradient(0, 0, w, h)
  sweep.addColorStop(0, "rgba(255,252,244,0.34)")
  sweep.addColorStop(0.5, "rgba(255,252,244,0.05)")
  sweep.addColorStop(1, "rgba(60,62,58,0.12)")
  ctx.fillStyle = sweep
  ctx.fillRect(0, 0, w, h)

  // 大面积软形（有机航拍色块）：先亮后暗，克制
  const blobs: { c: string; alpha: number; mode: GlobalCompositeOperation }[] = [
    { c: MEDIA_PALETTE.slate, alpha: 0.34, mode: "multiply" },
    { c: MEDIA_PALETTE.limestone, alpha: 0.55, mode: "screen" },
    { c: MEDIA_PALETTE.khaki, alpha: 0.3, mode: "multiply" },
    { c: MEDIA_PALETTE.cobalt, alpha: 0.22, mode: "multiply" },
    { c: MEDIA_PALETTE.ochre, alpha: 0.2, mode: "multiply" },
    { c: MEDIA_PALETTE.slate, alpha: 0.24, mode: "multiply" },
    { c: MEDIA_PALETTE.graphite, alpha: 0.22, mode: "multiply" },
    { c: MEDIA_PALETTE.limestone, alpha: 0.4, mode: "screen" },
    { c: "#5C6B7E", alpha: 0.16, mode: "multiply" },
  ]
  // 冷色主区（右上前）与次冷区（左中）：给画面一个明确的「深水」锚点
  const coolSpots = [
    { x: 0.68, y: 0.24, r: 0.42, a: 0.3 },
    { x: 0.16, y: 0.56, r: 0.36, a: 0.2 },
    { x: 0.86, y: 0.72, r: 0.3, a: 0.16 },
  ]
  for (const cs of coolSpots) {
    const x = cs.x * w
    const y = cs.y * h
    const r = cs.r * Math.max(w, h)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(90,110,134,${cs.a})`)
    g.addColorStop(1, "rgba(90,110,134,0)")
    ctx.globalCompositeOperation = "multiply"
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalCompositeOperation = "source-over"

  blobs.forEach((b, i) => {
    const x = (0.08 + rand() * 0.84) * w
    const y = (0.1 + rand() * 0.8) * h
    const r = (0.22 + rand() * 0.34) * Math.max(w, h)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `${b.c}${Math.round(b.alpha * 255).toString(16).padStart(2, "0")}`)
    g.addColorStop(1, `${b.c}00`)
    ctx.globalCompositeOperation = b.mode
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    void i
  })
  ctx.globalCompositeOperation = "source-over"

  // 等高纹理带（细波浪线，San Rita 的地形记忆但材质级）：中部为主
  ctx.strokeStyle = ink
  const lines = 64
  for (let i = 0; i < lines; i++) {
    const yBase = h * (0.3 + (i / lines) * 0.62)
    const amp = 6 + rand() * 16
    const freq = 0.004 + rand() * 0.004
    const phase = rand() * Math.PI * 2
    ctx.globalAlpha = 0.07 + (i % 6 === 0 ? 0.05 : 0)
    ctx.lineWidth = i % 6 === 0 ? 1.3 : 0.8
    ctx.beginPath()
    for (let x = -10; x <= w + 10; x += 14) {
      const y =
        yBase +
        Math.sin(x * freq + phase) * amp +
        Math.sin(x * freq * 2.7 + phase * 1.7) * amp * 0.4 +
        (rand() - 0.5) * 2.4
      if (x === -10) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 三块「陆缘」不规则轮廓（极轻）
  for (let k = 0; k < 3; k++) {
    const cx = (0.2 + rand() * 0.6) * w
    const cy = (0.25 + rand() * 0.5) * h
    const r = (0.14 + rand() * 0.16) * w
    ctx.beginPath()
    for (let i = 0; i <= 26; i++) {
      const a = (i / 26) * Math.PI * 2
      const rr = r * (0.75 + Math.sin(a * 3 + k * 2) * 0.18 + rand() * 0.1)
      const x = cx + Math.cos(a) * rr
      const y = cy + Math.sin(a) * rr * 0.62
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.strokeStyle = ink
    ctx.globalAlpha = 0.06
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // 勘探标记（technical instrument 感，§25/§26）：小十字 + 点
  ctx.fillStyle = ink
  ctx.strokeStyle = ink
  for (let i = 0; i < 16; i++) {
    const x = (0.06 + rand() * 0.88) * w
    const y = (0.2 + rand() * 0.68) * h
    const s = 3 + rand() * 2.4
    ctx.globalAlpha = 0.28
    if (i % 3 === 0) {
      ctx.beginPath()
      ctx.arc(x, y, 1.6, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.moveTo(x - s, y)
      ctx.lineTo(x + s, y)
      ctx.moveTo(x, y - s)
      ctx.lineTo(x, y + s)
      ctx.lineWidth = 0.9
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1

  // 颗粒
  for (let i = 0; i < 15000; i++) {
    const x = rand() * w
    const y = rand() * h
    ctx.globalAlpha = 0.028
    ctx.fillStyle = rand() > 0.5 ? "#FFFFFF" : "#3E423C"
    ctx.fillRect(x, y, 1.2, 1.2)
  }
  ctx.globalAlpha = 1

  // 渐晕（摄影感）
  const vig = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.36, w / 2, h * 0.5, Math.max(w, h) * 0.78)
  vig.addColorStop(0, "rgba(30,32,38,0)")
  vig.addColorStop(1, "rgba(30,32,38,0.24)")
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, w, h)
}

// ---------- 状态与裁切（§20/§21/§28：镜头在 media 里移动） ----------

export type EditorialState =
  | { name: "world" }
  | { name: "hover"; id: string }
  | { name: "selected"; id: string }
  | { name: "reading"; id: string }

export interface MediaTransform {
  x: number
  y: number
  scale: number
}

/** annotation 的视口位置 → media 坐标（media 比 viewport 大 PAD 倍） */
export const MEDIA_PAD = 0.32

export function mediaTransformFor(
  state: EditorialState,
  annotations: AnnotationSpec[],
  viewport: { width: number; height: number },
  pan: { x: number; y: number },
): MediaTransform {
  const offset = { x: -viewport.width * (MEDIA_PAD / 2), y: -viewport.height * (MEDIA_PAD / 2) }

  if (state.name === "world") {
    return { x: offset.x + pan.x, y: offset.y + pan.y, scale: 1 }
  }
  const ann = annotations.find((a) => a.id === state.id)
  if (!ann) return { x: offset.x + pan.x, y: offset.y + pan.y, scale: 1 }
  // 焦点：annotation 位置映射到 media 像素；把该点移到视口中心偏下（annotation 让出上方）
  const focalX = (ann.x / 100) * viewport.width - offset.x
  const focalY = (ann.y / 100) * viewport.height - offset.y
  const scale = state.name === "hover" ? 1.08 : state.name === "selected" ? 1.3 : 1.42
  const cx = viewport.width / 2 - focalX * scale + (state.name === "hover" ? pan.x * 0.4 : pan.x * 0.5)
  const cy =
    viewport.height / 2 - focalY * scale + viewport.height * (state.name === "reading" ? 0.02 : 0.06) + (state.name === "hover" ? pan.y * 0.4 : pan.y * 0.5)
  return { x: cx, y: cy, scale }
}

/** hover 聚光遮罩参数（圆心为 annotation 视口百分比位置） */
export function spotlightFor(ann: AnnotationSpec | null): { x: number; y: number; r: number } | null {
  if (!ann) return null
  return { x: ann.x, y: ann.y, r: 30 }
}
