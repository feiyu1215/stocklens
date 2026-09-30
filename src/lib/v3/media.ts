// Cool media（Task 15.2 UI RESET §21–§22）：冷白/银灰/石墨 + 冷蓝点缀的抽象「勘测场」，
// 一次绘制到离屏 canvas（零逐帧成本）。禁止暖色（soil/beige/sepia/ochre 大面积）。
// 确定性：同 seed 同输出。

import { stableHashUnit } from "@/lib/presentation/constellation-layout"

export const V3_PALETTE = {
  bg: "#F5F7FA",
  bgDeep: "#EDF0F5",
  ink: "#101318",
  secondary: "#69707D",
  silver: "#D6DCE4",
  slate: "#AEB8C4",
  graphite: "#5A626D",
  deep: "#3A414B",
  blue: "#2962FF",
  violet: "#6C5CE7",
  amber: "#B4802A",
  coral: "#D9534F",
  surface: "rgba(255,255,255,0.72)",
} as const

function rng(seed: number): () => number {
  let a = Math.floor(seed * 0xffffff) || 88675123
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 冷调抽象媒体：银灰底 + 大色域 + 等高细线 + 测量标记 + 颗粒 + 轻渐晕 */
export function paintCoolMedia(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 20261001): void {
  const rand = rng(seed / 0xffffff)

  // 基底：冷白 → 银灰
  const base = ctx.createLinearGradient(0, 0, w * 0.08, h)
  base.addColorStop(0, V3_PALETTE.bg)
  base.addColorStop(0.45, "#E4E9F0")
  base.addColorStop(0.8, "#CBD3DD")
  base.addColorStop(1, "#B9C3D0")
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  // 对角冷光
  const sweep = ctx.createLinearGradient(0, 0, w, h)
  sweep.addColorStop(0, "rgba(255,255,255,0.5)")
  sweep.addColorStop(0.55, "rgba(255,255,255,0.06)")
  sweep.addColorStop(1, "rgba(38,44,54,0.1)")
  ctx.fillStyle = sweep
  ctx.fillRect(0, 0, w, h)

  // 大色域（银灰/石墨/冷蓝/冷紫，克制）
  // 焦点暗区（右中）：让整个 field 有一个明确的视觉重心（§73）
  const focal = ctx.createRadialGradient(w * 0.68, h * 0.42, 0, w * 0.68, h * 0.42, Math.max(w, h) * 0.52)
  focal.addColorStop(0, "rgba(46,53,64,0.55)")
  focal.addColorStop(0.55, "rgba(70,82,98,0.3)")
  focal.addColorStop(1, "rgba(70,82,98,0)")
  ctx.globalCompositeOperation = "multiply"
  ctx.fillStyle = focal
  ctx.fillRect(0, 0, w, h)
  // 冷蓝深水（中下）
  const deep = ctx.createRadialGradient(w * 0.5, h * 0.78, 0, w * 0.5, h * 0.78, Math.max(w, h) * 0.42)
  deep.addColorStop(0, "rgba(41,98,255,0.22)")
  deep.addColorStop(1, "rgba(41,98,255,0)")
  ctx.fillStyle = deep
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = "source-over"

  const masses: { c: string; a: number; mode: GlobalCompositeOperation }[] = [
    { c: "#7C8FA6", a: 0.4, mode: "multiply" },
    { c: "#3A414B", a: 0.32, mode: "multiply" },
    { c: "#FFFFFF", a: 0.34, mode: "screen" },
    { c: V3_PALETTE.blue, a: 0.2, mode: "multiply" },
    { c: "#5A626D", a: 0.34, mode: "multiply" },
    { c: V3_PALETTE.violet, a: 0.12, mode: "multiply" },
    { c: "#2E3540", a: 0.3, mode: "multiply" },
    { c: "#FFFFFF", a: 0.3, mode: "screen" },
    { c: "#4A5A6E", a: 0.26, mode: "multiply" },
    { c: "#FFFFFF", a: 0.3, mode: "screen" },
  ]
  for (const m of masses) {
    const x = (0.08 + rand() * 0.84) * w
    const y = (0.1 + rand() * 0.8) * h
    const r = (0.2 + rand() * 0.34) * Math.max(w, h)
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `${m.c}${Math.round(m.a * 255).toString(16).padStart(2, "0")}`)
    g.addColorStop(1, `${m.c}00`)
    ctx.globalCompositeOperation = m.mode
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalCompositeOperation = "source-over"

  // 等高细线（测量图纸感，冷灰）
  const lines = 58
  for (let i = 0; i < lines; i++) {
    const yBase = h * (0.28 + (i / lines) * 0.64)
    const amp = 5 + rand() * 14
    const freq = 0.004 + rand() * 0.004
    const phase = rand() * Math.PI * 2
    ctx.globalAlpha = 0.07 + (i % 7 === 0 ? 0.05 : 0)
    ctx.strokeStyle = V3_PALETTE.graphite
    ctx.lineWidth = i % 7 === 0 ? 1.2 : 0.7
    ctx.beginPath()
    for (let x = -10; x <= w + 10; x += 16) {
      const y = yBase + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.6) * amp * 0.35
      if (x === -10) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 测量标记（十字 / 圆点，仪器感）
  for (let i = 0; i < 22; i++) {
    const x = (0.05 + rand() * 0.9) * w
    const y = (0.16 + rand() * 0.72) * h
    const s = 2.6 + rand() * 2.6
    ctx.strokeStyle = V3_PALETTE.graphite
    ctx.fillStyle = V3_PALETTE.graphite
    ctx.globalAlpha = 0.24
    if (i % 4 === 0) {
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
  // 冷蓝测量点（少量）
  for (let i = 0; i < 6; i++) {
    const x = (0.1 + rand() * 0.8) * w
    const y = (0.2 + rand() * 0.6) * h
    ctx.globalAlpha = 0.5
    ctx.fillStyle = V3_PALETTE.blue
    ctx.beginPath()
    ctx.arc(x, y, 2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // 颗粒
  for (let i = 0; i < 14000; i++) {
    const x = rand() * w
    const y = rand() * h
    ctx.globalAlpha = 0.024
    ctx.fillStyle = rand() > 0.5 ? "#FFFFFF" : "#39404A"
    ctx.fillRect(x, y, 1.2, 1.2)
  }
  ctx.globalAlpha = 1

  // 轻渐晕（冷）
  const vig = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.4, w / 2, h * 0.5, Math.max(w, h) * 0.8)
  vig.addColorStop(0, "rgba(30,36,46,0)")
  vig.addColorStop(1, "rgba(30,36,46,0.12)")
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, w, h)
}

/** My World 场景卡的小幅媒体（按 company 种子） */
export function paintSceneMedia(ctx: CanvasRenderingContext2D, w: number, h: number, seed: string): void {
  paintCoolMedia(ctx, w, h, Math.floor(stableHashUnit(seed) * 0xffffff) || 42)
}
