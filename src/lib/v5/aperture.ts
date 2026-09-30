// Focus Aperture 空间求解（Task 15.3B §5–§11/§29–§32）——纯函数、确定性、无随机。
// 职责：Aperture 尺寸/落位（朝视口中心、避开固定禁区）与局部磁性位移（只动冲突对象）。

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface AnchorBox {
  id: string
  /** 当前锚点矩形（世界坐标；scale 1 时即屏幕坐标） */
  rect: Rect
  /** 用户手动位置（若有），位移恢复时优先回到这里 */
  manual?: { x: number; y: number }
}

export interface ResolveInput {
  aperture: Rect
  dimensions: AnchorBox[]
  /** 永久禁区（Company Identity / Command Lens / Zoom / 底部行） */
  fixedExclusionZones: Rect[]
  viewport: { width: number; height: number }
}

export interface ResolveResult {
  /** 需要位移的锚点：id → 新位置（锚点左上角原点） */
  displaced: Record<string, { x: number; y: number }>
  collisionsBefore: number
  collisionsAfter: number
}

export const SAFETY_MARGIN = 40
const CLEAR_GAP = 24
const VIEWPORT_PAD = 24

export function rectsIntersect(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x - margin < b.x + b.width &&
    b.x - margin < a.x + a.width &&
    a.y - margin < b.y + b.height &&
    b.y - margin < a.y + a.height
  )
}

/** Aperture 尺寸（§6：420–480 × 250–310；1280 宽时允许 380–420） */
export function apertureSizeFor(viewport: { width: number; height: number }): { width: number; height: number } {
  const narrow = viewport.width < 1300
  const width = narrow ? 400 : 460
  const height = narrow ? 280 : 292
  return { width, height }
}

/**
 * Aperture 落位（§7）：从所选锚点朝视口中心方向展开；
 * 不越出视口、不压 Company Identity、不压 Command Lens（固定禁区）。
 */
export function apertureRectFor(input: {
  anchorRect: Rect
  size: { width: number; height: number }
  viewport: { width: number; height: number }
  fixedExclusionZones: Rect[]
}): Rect {
  const { anchorRect, size, viewport, fixedExclusionZones } = input
  const cx = anchorRect.x + anchorRect.width / 2
  const cy = anchorRect.y + anchorRect.height / 2
  const towardRight = cx < viewport.width / 2
  // 首选：水平朝中心；垂直与锚点对齐
  const candidates: Rect[] = [
    { x: towardRight ? anchorRect.x + anchorRect.width + CLEAR_GAP : anchorRect.x - size.width - CLEAR_GAP, y: cy - size.height / 2, ...size },
    { x: towardRight ? anchorRect.x + anchorRect.width + CLEAR_GAP : anchorRect.x - size.width - CLEAR_GAP, y: anchorRect.y + 12, ...size },
    { x: cx - size.width / 2, y: anchorRect.y + anchorRect.height + CLEAR_GAP, ...size },
    { x: cx - size.width / 2, y: anchorRect.y - size.height - CLEAR_GAP, ...size },
  ]
  const clamp = (r: Rect): Rect => ({
    ...r,
    x: Math.min(Math.max(r.x, VIEWPORT_PAD), viewport.width - r.width - VIEWPORT_PAD),
    y: Math.min(Math.max(r.y, VIEWPORT_PAD), viewport.height - r.height - VIEWPORT_PAD),
  })
  const safe = candidates.map(clamp)
  const first = safe.find((r) => !fixedExclusionZones.some((z) => rectsIntersect(r, z, 8)))
  if (first) return first
  // 全部与禁区冲突：取冲突最少者，再沿 y 微移（确定性）
  let best = safe[0]
  let bestCost = Number.POSITIVE_INFINITY
  for (const r of safe) {
    for (let step = 0; step < 12; step++) {
      const cand = clamp({ ...r, y: r.y - step * 26 })
      const cost = fixedExclusionZones.reduce((acc, z) => acc + (rectsIntersect(cand, z, 8) ? 1 : 0), 0)
      if (cost < bestCost) {
        bestCost = cost
        best = cand
      }
      if (cost === 0) break
    }
  }
  return best
}

/** 沿最短轴推出（nearest legal displacement），保持局部、不重排整盘 */
function pushOut(box: Rect, exclusion: Rect, viewport: { width: number; height: number }): { x: number; y: number } {
  const dxLeft = box.x + box.width - exclusion.x // 需要向左移多少才让开
  const dxRight = exclusion.x + exclusion.width - box.x
  const dyUp = box.y + box.height - exclusion.y
  const dyDown = exclusion.y + exclusion.height - box.y
  const options = [
    { axis: "x" as const, delta: -(dxLeft + CLEAR_GAP), cost: dxLeft + CLEAR_GAP },
    { axis: "x" as const, delta: dxRight + CLEAR_GAP, cost: dxRight + CLEAR_GAP },
    { axis: "y" as const, delta: -(dyUp + CLEAR_GAP), cost: dyUp + CLEAR_GAP },
    { axis: "y" as const, delta: dyDown + CLEAR_GAP, cost: dyDown + CLEAR_GAP },
  ].sort((a, b) => a.cost - b.cost)
  for (const opt of options) {
    const nx = opt.axis === "x" ? box.x + opt.delta : box.x
    const ny = opt.axis === "y" ? box.y + opt.delta : box.y
    const inViewport =
      nx >= VIEWPORT_PAD && ny >= VIEWPORT_PAD && nx + box.width <= viewport.width - VIEWPORT_PAD && ny + box.height <= viewport.height - VIEWPORT_PAD
    if (inViewport) return { x: nx, y: ny }
  }
  const fallback = options[0]
  return {
    x: Math.min(Math.max(fallback.axis === "x" ? box.x + fallback.delta : box.x, VIEWPORT_PAD), viewport.width - box.width - VIEWPORT_PAD),
    y: Math.min(Math.max(fallback.axis === "y" ? box.y + fallback.delta : box.y, VIEWPORT_PAD), viewport.height - box.height - VIEWPORT_PAD),
  }
}

/**
 * §31：局部磁性位移。只移动与「Aperture bbox + 40px 安全边」冲突的对象，
 * 逐个沿最短轴推出，并避开固定禁区；未冲突对象保持原位（§11）。
 */
export function resolveApertureCollisions(input: ResolveInput): ResolveResult {
  const { aperture, dimensions, fixedExclusionZones, viewport } = input
  const exclusion: Rect = {
    x: aperture.x - SAFETY_MARGIN,
    y: aperture.y - SAFETY_MARGIN,
    width: aperture.width + SAFETY_MARGIN * 2,
    height: aperture.height + SAFETY_MARGIN * 2,
  }
  const displaced: Record<string, { x: number; y: number }> = {}
  const placed: Rect[] = [{ ...aperture }]
  let before = 0
  let after = 0
  for (const dim of dimensions) {
    const clashes = rectsIntersect(dim.rect, exclusion, 0) || fixedExclusionZones.some((z) => rectsIntersect(dim.rect, z, 0))
    if (!clashes) continue
    before += 1
    let box = dim.rect
    // 先解决与 Aperture 安全区的冲突
    if (rectsIntersect(box, exclusion, 0)) {
      const moved = pushOut(box, exclusion, viewport)
      box = { ...box, x: moved.x, y: moved.y }
    }
    // 再解决与固定禁区的冲突（确定性、最多 6 轮）
    for (let i = 0; i < 6; i++) {
      const zone = fixedExclusionZones.find((z) => rectsIntersect(box, z, 0))
      if (!zone) break
      const moved = pushOut(box, zone, viewport)
      box = { ...box, x: moved.x, y: moved.y }
    }
    // 最后避让已落位对象（含 aperture 自身）
    for (let i = 0; i < 6; i++) {
      const other = placed.find((p) => rectsIntersect(box, p, 0))
      if (!other) break
      const moved = pushOut(box, other, viewport)
      box = { ...box, x: moved.x, y: moved.y }
    }
    placed.push(box)
    displaced[dim.id] = { x: box.x, y: box.y }
    if (rectsIntersect(box, exclusion, 0)) after += 1
  }
  return { displaced, collisionsBefore: before, collisionsAfter: after }
}

/** 固定禁区（§29/§30）：Company Identity / Command Lens / Zoom / 底部行（均为屏幕坐标） */
export function fixedExclusionZones(viewport: { width: number; height: number }): Rect[] {
  return [
    // Company Identity（左上）
    { x: 0, y: 88, width: 372, height: 200 },
    // Command Lens（底部中）
    { x: viewport.width / 2 - 190, y: viewport.height - 76, width: 380, height: 64 },
    // Zoom 控件（右下）
    { x: viewport.width - 300, y: viewport.height - 76, width: 290, height: 64 },
    // 底部左：行业 · 维度数 + Suggested Research 行
    { x: 0, y: viewport.height - 120, width: 520, height: 116 },
  ]
}
