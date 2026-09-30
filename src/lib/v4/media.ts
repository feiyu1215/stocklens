// Company World V2 视觉素材（Task 15.2R §8/§9：Media Field，程序化 2D image treatment）。
// 参考 Unseen World 的可观察语法：满屏暗场 + 单一主导视觉体 + 无边框媒体对象（不等大、出血）。
// 禁止：山/岛/星球/blob/圆环/terrain/等高线；禁止暖色主色（§50）。
// 全部确定性；一次性绘制（零逐帧成本）。

import { stableHashUnit } from "@/lib/presentation/constellation-layout"

export const V4 = {
  ink: "#0A0C10",
  inkDeep: "#05070A",
  silver: "#C9D2DC",
  steel: "#8A96A6",
  cobalt: "#4C7BD9",
  cobaltDeep: "#2A4A8F",
  violet: "#7A6CC8",
  amber: "#C79A4A",
  coral: "#D0705F",
  textPrimary: "#E8EBF0",
  textSecondary: "#8C96A6",
  textFaint: "#5A6472",
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

/**
 * 世界底场（§7 第一视觉主体）：深墨空间的氛围场——
 * 主导光体（单一，偏轴）+ 水平光带 + 建筑透视细网格 + 蚀刻影线 + 颗粒 + 渐晕。
 * 读作「空间/深度/仪器场」，不是任何具象形状。
 */
export function paintField(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 20261002): void {
  const rand = rng(seed / 0xffffff)

  const base = ctx.createLinearGradient(0, 0, w * 0.2, h)
  base.addColorStop(0, "#0C1016")
  base.addColorStop(0.5, V4.ink)
  base.addColorStop(1, V4.inkDeep)
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  // 主导光体：单一、偏轴（左中偏上），承担 focal
  const fx = w * 0.4
  const fy = h * 0.44
  const fr = Math.max(w, h) * 0.5
  const focal = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr)
  focal.addColorStop(0, "rgba(168,196,226,0.24)")
  focal.addColorStop(0.35, "rgba(96,132,180,0.14)")
  focal.addColorStop(0.7, "rgba(52,74,110,0.06)")
  focal.addColorStop(1, "rgba(10,12,16,0)")
  ctx.fillStyle = focal
  ctx.fillRect(0, 0, w, h)

  // 次光（右下冷蓝，给空间第二个深度锚点）
  const sx = w * 0.82
  const sy = h * 0.78
  const secondary = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.42)
  secondary.addColorStop(0, "rgba(76,123,217,0.13)")
  secondary.addColorStop(1, "rgba(10,12,16,0)")
  ctx.fillStyle = secondary
  ctx.fillRect(0, 0, w, h)

  // 水平光带（长时间曝光感的建筑氛围；纯水平，不是山形）
  const bands = 7
  for (let i = 0; i < bands; i++) {
    const y = h * (0.2 + rand() * 0.62)
    const th = 2 + rand() * 16
    const alpha = 0.03 + rand() * 0.05
    const bandGrad = ctx.createLinearGradient(0, y, w, y)
    bandGrad.addColorStop(0, "rgba(200,214,230,0)")
    bandGrad.addColorStop(0.3 + rand() * 0.3, `rgba(200,214,230,${alpha})`)
    bandGrad.addColorStop(1, "rgba(200,214,230,0)")
    ctx.fillStyle = bandGrad
    ctx.fillRect(0, y, w, th)
  }

  // 主导结构：中心光片（横向、跨屏、柔和发光）——世界的「地平光」，单一视觉主体
  const sheetY = h * 0.5
  const sheet = ctx.createLinearGradient(0, sheetY - h * 0.24, 0, sheetY + h * 0.3)
  sheet.addColorStop(0, "rgba(120,150,190,0)")
  sheet.addColorStop(0.42, "rgba(150,182,224,0.1)")
  sheet.addColorStop(0.5, "rgba(216,232,250,0.26)")
  sheet.addColorStop(0.58, "rgba(120,152,200,0.08)")
  sheet.addColorStop(1, "rgba(10,12,16,0)")
  ctx.fillStyle = sheet
  ctx.fillRect(0, 0, w, h)

  // 建筑透视网格（增强：地平线附近的细线密集，读作「空间」）
  const horizon = h * 0.5
  ctx.strokeStyle = "rgba(160,184,214,0.09)"
  ctx.lineWidth = 1
  for (let i = 0; i <= 34; i++) {
    const t = (i - 17) / 17
    const y = horizon + Math.sign(t) * Math.abs(t) ** 2.4 * h * 0.62
    if (y < 0 || y > h) continue
    ctx.globalAlpha = 0.5 + (1 - Math.abs(t)) * 0.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  const vp = { x: w * 0.44, y: horizon }
  for (let i = -22; i <= 22; i++) {
    ctx.globalAlpha = 0.07
    ctx.beginPath()
    ctx.moveTo(vp.x + i * 118, h + 60)
    ctx.lineTo(vp.x + i * 10, vp.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 蚀刻影线（焦点区仪器纹理）
  ctx.strokeStyle = "rgba(190,206,224,0.1)"
  for (let i = 0; i < 220; i++) {
    const x = fx + (rand() - 0.5) * fr * 1.5
    const y = fy + (rand() - 0.5) * fr * 1.1
    const len = 6 + rand() * 26
    ctx.globalAlpha = 0.05 + rand() * 0.1
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + len * 0.72, y - len * 0.72)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 颗粒 + 渐晕
  for (let i = 0; i < 16000; i++) {
    const x = rand() * w
    const y = rand() * h
    ctx.globalAlpha = 0.02 + rand() * 0.02
    ctx.fillStyle = rand() > 0.5 ? "#C9D2DC" : "#000000"
    ctx.fillRect(x, y, 1.1, 1.1)
  }
  ctx.globalAlpha = 1
  const vig = ctx.createRadialGradient(w * 0.45, h * 0.46, Math.min(w, h) * 0.34, w * 0.5, h * 0.5, Math.max(w, h) * 0.82)
  vig.addColorStop(0, "rgba(0,0,0,0)")
  vig.addColorStop(1, "rgba(0,0,0,0.5)")
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, w, h)
}

/**
 * Dimension 媒体片（§4：Typography + Visual Object / Media hotspot）：
 * 无边框的图像对象——暗底 + 单一明亮结构 + 细纹理 + 颗粒；按 seed 变化构图类型。
 */
export function paintPlate(ctx: CanvasRenderingContext2D, w: number, h: number, seedKey: string): void {
  const seed = stableHashUnit(seedKey)
  const rand = rng(seed)
  const kind = Math.floor(rand() * 3)
  // 提高对比：先压暗基底，再画明亮结构（图像实体感）

  const base = ctx.createLinearGradient(0, 0, w * 0.3, h)
  base.addColorStop(0, "#141A22")
  base.addColorStop(0.6, "#0D1117")
  base.addColorStop(1, "#090C11")
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)

  if (kind === 0) {
    // 地平光带型：亮带 + 亮带下方反射（图像感）
    const hy = h * (0.36 + rand() * 0.18)
    const g = ctx.createLinearGradient(0, hy - h * 0.34, 0, hy + h * 0.6)
    g.addColorStop(0, "rgba(30,42,60,0.0)")
    g.addColorStop(0.34, "rgba(120,158,208,0.5)")
    g.addColorStop(0.44, "rgba(236,246,255,0.92)")
    g.addColorStop(0.5, "rgba(150,188,236,0.5)")
    g.addColorStop(0.72, "rgba(36,52,78,0.28)")
    g.addColorStop(1, "rgba(8,10,14,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  } else if (kind === 1) {
    // 斜切光面型：对角光楔（强）
    const g = ctx.createLinearGradient(0, h, w, 0)
    g.addColorStop(0, "rgba(16,22,32,0)")
    g.addColorStop(0.4 + rand() * 0.08, "rgba(110,146,196,0.5)")
    g.addColorStop(0.5, "rgba(232,242,255,0.86)")
    g.addColorStop(0.6, "rgba(80,112,160,0.34)")
    g.addColorStop(1, "rgba(8,10,14,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // 光楔边缘的细亮线（摄影高光）
    ctx.strokeStyle = "rgba(240,248,255,0.5)"
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(w * (0.14 + rand() * 0.1), h)
    ctx.lineTo(w * (0.78 + rand() * 0.08), 0)
    ctx.stroke()
  } else {
    // 体积光型：明亮核心 + 冷蓝偏移 + 核心细亮边
    const cx = (0.34 + rand() * 0.34) * w
    const cy = (0.34 + rand() * 0.36) * h
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.44)
    core.addColorStop(0, "rgba(238,246,255,0.8)")
    core.addColorStop(0.18, "rgba(168,198,238,0.42)")
    core.addColorStop(0.55, "rgba(74,110,168,0.16)")
    core.addColorStop(1, "rgba(8,10,14,0)")
    ctx.fillStyle = core
    ctx.fillRect(0, 0, w, h)
    const off = ctx.createRadialGradient(w * 0.74, h * 0.74, 0, w * 0.74, h * 0.74, Math.max(w, h) * 0.4)
    off.addColorStop(0, "rgba(76,123,217,0.3)")
    off.addColorStop(1, "rgba(8,10,14,0)")
    ctx.fillStyle = off
    ctx.fillRect(0, 0, w, h)
  }

  // 满幅铺垫：让结构触及四边（裁切影像感），再叠加边缘渐隐
  const wash = ctx.createLinearGradient(0, 0, w * 0.6, h)
  wash.addColorStop(0, "rgba(70,92,124,0.16)")
  wash.addColorStop(0.5, "rgba(24,32,44,0.06)")
  wash.addColorStop(1, "rgba(10,13,18,0.18)")
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, w, h)

  // 细纹理：仪器刻线（水平细纹）
  ctx.strokeStyle = "rgba(190,206,226,0.14)"
  ctx.lineWidth = 0.6
  for (let i = 0; i < 34; i++) {
    const y = rand() * h
    ctx.globalAlpha = 0.3 + rand() * 0.6
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y + (rand() - 0.5) * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 颗粒
  for (let i = 0; i < 2600; i++) {
    ctx.globalAlpha = 0.03 + rand() * 0.03
    ctx.fillStyle = rand() > 0.5 ? "#D6E0EC" : "#000000"
    ctx.fillRect(rand() * w, rand() * h, 1, 1)
  }
  ctx.globalAlpha = 1

  // 边缘渐隐（四条边轻微压暗：影像裁切感，弱化矩形轮廓）
  const edge = ctx.createLinearGradient(0, 0, 0, h)
  edge.addColorStop(0, "rgba(6,8,11,0.55)")
  edge.addColorStop(0.18, "rgba(6,8,11,0)")
  edge.addColorStop(0.82, "rgba(6,8,11,0)")
  edge.addColorStop(1, "rgba(6,8,11,0.55)")
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, w, h)
  const edge2 = ctx.createLinearGradient(0, 0, w, 0)
  edge2.addColorStop(0, "rgba(6,8,11,0.5)")
  edge2.addColorStop(0.16, "rgba(6,8,11,0)")
  edge2.addColorStop(0.84, "rgba(6,8,11,0)")
  edge2.addColorStop(1, "rgba(6,8,11,0.5)")
  ctx.fillStyle = edge2
  ctx.fillRect(0, 0, w, h)
}
