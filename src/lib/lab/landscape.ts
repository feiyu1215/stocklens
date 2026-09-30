// Sculptural Research Landscape — 世界模型（Task 15.2，纯函数，无 three/React import）。
//
// 规格：docs/design-audit/task15-2/00-TASK15_2_SPEC.md（逐字治理文档）。
// 关键纪律：
// - §14 一整块连续 mesh（高度场），§15 region 是同一 landscape 中的 zone，不是岛；
// - §13 非对称构图（前景/中景/背景、不同深度距离），radial 只作底层数据参考；
// - §17 elevation 只映射 research depth / evidence richness，绝不映射股票好坏；
// - §19 Mineral Editorial：limestone / ivory mineral / graphite / cool slate / muted cobalt / ochre；
// - 全部确定性（stableHashUnit 种子），无随机数。

import { stableHashUnit } from "@/lib/presentation/constellation-layout"

// ---------- 输入（fixture 形状的最小接口，不依赖组件层） ----------

export interface LandscapeDimension {
  dimensionId: string
  label: string
  status: "ready" | "partial" | "unknown"
  priority: number
  evidenceIds: string[]
}

export interface LandscapeSuggestion {
  label: string
}

export interface LandscapeInput {
  dimensions: LandscapeDimension[]
  suggestions: LandscapeSuggestion[]
}

export interface EvidenceMarkerSpec {
  evidenceId: string
  dimensionId: string
  type: "fact" | "inference" | "unknown" | "conflict"
  x: number
  z: number
  y: number
  tilt: number
}

export interface ZoneSpec {
  dimensionId: string
  label: string
  status: "ready" | "partial" | "unknown"
  x: number
  z: number
  radius: number
  /** 隆起幅度（§17：只映射 evidence richness / 研究深度） */
  amp: number
  /** 连接器顺序（INFERENCE 结构线） */
  markers: EvidenceMarkerSpec[]
  conflict: boolean
}

export interface SuggestionZoneSpec {
  label: string
  x: number
  z: number
  radius: number
}

export interface LandscapeModel {
  zones: ZoneSpec[]
  suggestions: SuggestionZoneSpec[]
  markers: EvidenceMarkerSpec[]
}

// ---------- 调色（§19 Mineral Editorial） ----------

export const LANDSCAPE_PALETTE = {
  /** 页面/雾底：象牙雾霾 */
  haze: "#E4E0D3",
  hazeDusk: "#E2D5BE",
  /** 地形高度渐变：slate 阴影 → limestone → ivory mineral */
  low: "#8C8471",
  mid: "#C2BAA5",
  high: "#E9E4D7",
  /** 陡坡 graphite（sLOPE 加深） */
  graphite: "#57534A",
  /** zone tint：muted cobalt（ready）/ slate-cobalt（partial）/ ochre（unknown）/ 雾（suggestion） */
  cobalt: "#476F9E",
  partial: "#7C89A0",
  ochre: "#B08A4F",
  suggestion: "#CDC9BE",
  /** marker / connector */
  beacon: "#2F6FB0",
  connector: "#4C7399",
} as const

// ---------- 非对称构图（§13） ----------
// 前景大区 → 中景 → 远景；不同距离/深度；radial 数据仅作 priority 参考。

const ZONE_SPOTS = [
  { x: -5.1, z: 4.4, r: 5.8 },
  { x: 4.9, z: 1.8, r: 4.4 },
  { x: -1.2, z: -1.6, r: 3.9 },
  { x: 9.2, z: -3.8, r: 3.4 },
  { x: -9.0, z: -5.0, r: 3.2 },
  { x: 2.0, z: -8.6, r: 3.0 },
] as const

const SUGGESTION_SPOTS = [
  { x: 14.6, z: -9.0, r: 3.4 },
  { x: -14.2, z: -10.4, r: 3.2 },
  { x: 7.4, z: -13.8, r: 3.0 },
] as const

/** 地形范围（x 全宽 ±20，z 深度 ±13） */
export const TERRAIN_EXTENT = { width: 40, depth: 26 } as const

function sortedByPriority(dimensions: LandscapeDimension[]): LandscapeDimension[] {
  return [...dimensions].sort((a, b) => a.priority - b.priority)
}

/** 由 fixture 组成非对称 zone 布局（确定性） */
export function composeLandscape(input: LandscapeInput): LandscapeModel {
  const dims = sortedByPriority(input.dimensions)
  const zones: ZoneSpec[] = []
  const markers: EvidenceMarkerSpec[] = []
  const suggestionIndex = 0
  /** fixture 中不同维度可能引用同一 evidenceId：marker 全局去重（一条证据只立一座 beacon） */
  const usedEvidence = new Set<string>()

  dims.forEach((dim, index) => {
    const spot = ZONE_SPOTS[Math.min(index, ZONE_SPOTS.length - 1)]
    const jitter = (stableHashUnit(`${dim.dimensionId}:spot`) - 0.5) * 1.2
    const x = spot.x + jitter
    const z = spot.z + (stableHashUnit(`${dim.dimensionId}:spotz`) - 0.5) * 0.8
    const isUnknown = dim.status === "unknown"
    const richness = Math.min(dim.evidenceIds.length / 8, 1)
    // §13：主次层级——primary 明显更高，随 priority 递减（研究深度 × 构图层级，均非好坏）
    const hierarchy = 1.34 - index * 0.09
    const amp = (isUnknown ? 0.5 + richness * 0.25 : 1.05 + richness * 1.55) * hierarchy

    const conflict = false // 由调用侧按 claim conflict 计算（见 applyConflict）
    const zone: ZoneSpec = {
      dimensionId: dim.dimensionId,
      label: dim.label,
      status: dim.status,
      x,
      z,
      radius: spot.r,
      amp,
      markers: [],
      conflict,
    }

    // Evidence → survey markers（§23–§25）：ready/partial 才有；确定性散布在 zone 内
    if (!isUnknown) {
      const count = Math.min(dim.evidenceIds.length, 6)
      const sorted = [...dim.evidenceIds].sort()
      for (let i = 0; i < count; i++) {
        const id = sorted[i]
        if (usedEvidence.has(id)) continue
        usedEvidence.add(id)
        const a = stableHashUnit(`${id}:a`) * Math.PI * 2
        const rr = (0.22 + stableHashUnit(`${id}:r`) * 0.55) * spot.r
        const mx = x + Math.cos(a) * rr
        const mz = z + Math.sin(a) * rr * 0.8
        markers.push({
          evidenceId: id,
          dimensionId: dim.dimensionId,
          type: "inference",
          x: mx,
          z: mz,
          y: 0, // 场景侧用 heightAt 回填
          tilt: 0,
        })
      }
      zone.markers = markers.filter((m) => m.dimensionId === dim.dimensionId)
    }
    zones.push(zone)
  })

  const suggestions: SuggestionZoneSpec[] = input.suggestions
    .slice(0, SUGGESTION_SPOTS.length)
    .map((s, i) => {
      const spot = SUGGESTION_SPOTS[(suggestionIndex + i) % SUGGESTION_SPOTS.length]
      return { label: s.label, x: spot.x, z: spot.z, radius: spot.r }
    })

  return { zones, suggestions, markers }
}

/** 标注 CONFLICT（§27：微地形扰动 + 歪斜 marker；由 claim conflict 计数驱动） */
export function applyConflict(model: LandscapeModel, conflicts: Map<string, number>): LandscapeModel {
  const zones = model.zones.map((zone) => ({ ...zone, conflict: (conflicts.get(zone.label) ?? 0) > 0 }))
  const markers = model.markers.map((m, i) => {
    const conflict = zones.find((z) => z.dimensionId === m.dimensionId)?.conflict
    if (!conflict) return m
    return { ...m, tilt: i % 3 === 0 ? 0.22 : 0 }
  })
  return { ...model, zones, markers }
}

// ---------- 噪声（确定性 value noise） ----------

function hash2(ix: number, iz: number, seed: number): number {
  return stableHashUnit(`${ix}:${iz}:${seed}`)
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fz = smooth(z - iz)
  const a = hash2(ix, iz, seed)
  const b = hash2(ix + 1, iz, seed)
  const c = hash2(ix, iz + 1, seed)
  const d = hash2(ix + 1, iz + 1, seed)
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz
}

// ---------- 高度场（§14/§16/§17/§26/§27） ----------

function zoneInfluence(x: number, z: number, zone: ZoneSpec): { g: number; sigma: number } {
  const isUnknown = zone.status === "unknown"
  const sigma = zone.radius * (isUnknown ? 0.95 : 0.66)
  const d = Math.hypot((x - zone.x) / 1.0, (z - zone.z) / 0.82)
  const g = Math.exp(-((d / sigma) ** 2))
  return { g, sigma }
}

/** plateau 化：平滑台地（建筑模型/雕塑感），非圆锥小山 */
function sculpt(gRaw: number): number {
  // 雕塑化：宽平台 + 缓肩（建筑模型体块），5 级轻台地
  const t = Math.min(1, gRaw * 1.5)
  const steps = 5
  const terrace = Math.round(t * steps) / steps
  const wobble = (valueNoise(gRaw * 40 + 3, gRaw * 31, 91) - 0.5) * 0.12
  return Math.max(0, t * 0.58 + (terrace + wobble) * 0.42)
}

/** 地形边缘衰减：完整体块，边界沉入雾中（§11 full-bleed / §22 haze） */
function edgeFade(x: number, z: number): number {
  const ex = Math.min(Math.abs(x) / (TERRAIN_EXTENT.width / 2), 1)
  const ez = Math.min(Math.abs(z) / (TERRAIN_EXTENT.depth / 2), 1)
  const e = Math.max(ex, ez)
  return 1 - smooth(Math.max(0, (e - 0.78) / 0.22))
}

export function heightAt(model: LandscapeModel, x: number, z: number): number {
  // 大尺度起伏 + 细节（有 texture 的 surface variation，§18）
  let h =
    0.34 +
    valueNoise(x * 0.045, z * 0.045, 11) * 1.15 +
    valueNoise(x * 0.11, z * 0.11, 23) * 0.42 +
    valueNoise(x * 0.28, z * 0.28, 41) * 0.14

  // 相邻 zone 之间的连接山脊（§15）：把 zone 缝成一片陆地，而不是群岛
  for (let i = 0; i + 1 < model.zones.length; i++) {
    const a = model.zones[i]
    const b = model.zones[i + 1]
    const vx = b.x - a.x
    const vz = b.z - a.z
    const len2 = vx * vx + vz * vz
    let t = ((x - a.x) * vx + (z - a.z) * vz) / len2
    t = Math.max(0.12, Math.min(0.88, t))
    const px = a.x + vx * t
    const pz = a.z + vz * t
    const d = Math.hypot(x - px, (z - pz) / 0.8)
    const ridge = Math.exp(-((d / 1.7) ** 2))
    if (ridge > 0.01) {
      const ha = a.status === "unknown" ? a.amp * 0.42 : a.amp
      const hb = b.status === "unknown" ? b.amp * 0.42 : b.amp
      h += Math.min(ha, hb) * 0.5 * ridge * sculpt(ridge)
    }
  }

  for (const zone of model.zones) {
    const { g } = zoneInfluence(x, z, zone)
    if (g < 0.004) continue
    if (zone.status === "unknown") {
      // §26 UNKNOWN：reduced-detail —— 更平、更缓、且把细节噪声压平（未解析的光滑空白）
      h += zone.amp * 0.3 * g
      h -= valueNoise(x * 0.11, z * 0.11, 23) * 0.3 * g + valueNoise(x * 0.28, z * 0.28, 41) * 0.1 * g
    } else {
      h += zone.amp * sculpt(g)
    }
    // §27 CONFLICT：细窄断层扰动（受控，非大红裂缝）
    if (zone.conflict) {
      const angle = stableHashUnit(`${zone.dimensionId}:fault`) * Math.PI
      const dx = x - zone.x
      const dz = z - zone.z
      const along = dx * Math.cos(angle) + dz * Math.sin(angle)
      const across = -dx * Math.sin(angle) + dz * Math.cos(angle)
      const inZone = Math.exp(-((along / (zone.radius * 1.1)) ** 2))
      h += 0.14 * Math.exp(-((across / 0.5) ** 2)) * inZone * (0.6 + 0.8 * valueNoise(x * 0.9, z * 0.9, 37))
    }
  }

  // Suggestion（§30）：远边缘雾中「正在成形」的极缓地形
  for (const s of model.suggestions) {
    const d = Math.hypot((x - s.x) / 1.0, (z - s.z) / 0.8)
    const g = Math.exp(-((d / (s.radius * 0.95)) ** 2))
    h += 0.55 * g
  }

  // 次级地形（world density）：zone 之外的确定性小丘/褶皱
  for (let i = 0; i < 9; i++) {
    const mx = (stableHashUnit(`knoll:x${i}`) - 0.5) * 33
    const mz = (stableHashUnit(`knoll:z${i}`) - 0.5) * 20
    const r = 1.2 + stableHashUnit(`knoll:r${i}`) * 2.2
    const amp = 0.26 + stableHashUnit(`knoll:a${i}`) * 0.42
    const d = Math.hypot(x - mx, z - mz)
    h += amp * Math.exp(-((d / r) ** 2)) * (0.7 + 0.6 * valueNoise(x * 0.5, z * 0.5, 53))
  }

  return h * edgeFade(x, z)
}

/** 顶点世界坐标 → [0,1] 区间高度归一（调色用） */
export function heightRange(model: LandscapeModel): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (let ix = 0; ix <= 40; ix++) {
    for (let iz = 0; iz <= 26; iz++) {
      const h = heightAt(model, -20 + (ix / 40) * 40, -13 + (iz / 26) * 26)
      if (h < min) min = h
      if (h > max) max = h
    }
  }
  return { min, max }
}

// ---------- 调色（vertex color 侧逻辑；RGB [0,1] 输出） ----------

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const v = Number.parseInt(hex.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(Math.max(t, 0), 1)
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

const C_LOW = hexToRgb(LANDSCAPE_PALETTE.low)
const C_MID = hexToRgb(LANDSCAPE_PALETTE.mid)
const C_HIGH = hexToRgb(LANDSCAPE_PALETTE.high)
const C_GRAPHITE = hexToRgb(LANDSCAPE_PALETTE.graphite)
const C_COBALT = hexToRgb(LANDSCAPE_PALETTE.cobalt)
const C_PARTIAL = hexToRgb(LANDSCAPE_PALETTE.partial)
const C_OCHRE = hexToRgb(LANDSCAPE_PALETTE.ochre)
const C_SUGGESTION = hexToRgb(LANDSCAPE_PALETTE.suggestion)

/**
 * 顶点色：高度渐变（slate→limestone→ivory）+ 陡坡 graphite + 地层带 + zone tint 软混。
 * slope 为坡度估计（0–1+）。全部纯函数，场景侧逐顶点调用。
 */
export function colorAt(
  model: LandscapeModel,
  x: number,
  z: number,
  h: number,
  hNorm: number,
  slope: number,
): RGB {
  // 高度渐变（三段）
  let c: RGB
  if (hNorm < 0.55) c = mixRgb(C_LOW, C_MID, hNorm / 0.55)
  else c = mixRgb(C_MID, C_HIGH, (hNorm - 0.55) / 0.45)

  // 陡坡 → graphite（sculptural shading，与实时光照叠加）
  c = mixRgb(c, C_GRAPHITE, Math.min(slope * 0.5, 0.42))

  // 地层带（San Rita 等高记忆，材质级、极轻）
  const band = valueNoise(x * 0.5, z * 0.5, 71)
  const strata = Math.abs(((hNorm * 9 + band * 0.35) % 1) - 0.5) * 2
  c = mixRgb(c, C_GRAPHITE, (1 - smooth(strata)) * 0.035)

  // zone tint（§19 muted cobalt / ochre；软混，不做成色块）
  let tintWeight = 0
  let tint: RGB = C_COBALT
  for (const zone of model.zones) {
    const { g } = zoneInfluence(x, z, zone)
    if (g < 0.05) continue
    const w = g * (zone.status === "unknown" ? 0.7 : 0.6)
    if (w > tintWeight) {
      tintWeight = w
      tint = zone.status === "unknown" ? C_OCHRE : zone.status === "partial" ? C_PARTIAL : C_COBALT
    }
  }
  for (const s of model.suggestions) {
    const d = Math.hypot((x - s.x) / 1.0, (z - s.z) / 0.8)
    const g = Math.exp(-((d / (s.radius * 0.95)) ** 2))
    if (g * 0.5 > tintWeight) {
      tintWeight = g * 0.5
      tint = C_SUGGESTION
    }
  }
  c = mixRgb(c, tint, Math.min(tintWeight, 0.7))

  return c
}

/** 某 zone 的 tint（marker/hover 用） */
export function zoneTint(zone: ZoneSpec): RGB {
  if (zone.status === "unknown") return C_OCHRE
  if (zone.status === "partial") return C_PARTIAL
  return C_COBALT
}

/** 命中点 → zone id（hover 用；返回最强 influence，弱于阈值则 null） */
export function zoneAt(model: LandscapeModel, x: number, z: number): string | null {
  let best: string | null = null
  let bestW = 0.22
  for (const zone of model.zones) {
    const { g } = zoneInfluence(x, z, zone)
    if (g > bestW) {
      bestW = g
      best = zone.dimensionId
    }
  }
  return best
}

/** label 锚点：zone 中心 + 隆起高度的一部分 */
export function zoneAnchor(model: LandscapeModel, zone: ZoneSpec): { x: number; y: number; z: number } {
  return { x: zone.x, y: heightAt(model, zone.x, zone.z) + Math.max(zone.amp * 0.55, 0.7), z: zone.z }
}

// ---------- 相机（§9–§11：弱透视 pitch ~30°，前景/中景/背景） ----------

export const CAMERA_PRESET = {
  fov: 26,
  /** 相机到注视点的水平距离 */
  distance: 27,
  /** pitch（度） */
  pitchDeg: 31,
  target: { x: 0.5, y: 1.7, z: -0.6 },
  /** pan 范围（§33 drag-to-explore） */
  panRange: { x: 7.5, z: 4.5 } as const,
  /** parallax 幅度（§34：非常轻） */
  parallax: { x: 0.55, y: 0.28 } as const,
} as const

/** 相机位置 = target + 球坐标（pitch 固定，方位角可微调） */
export function cameraPosition(target: { x: number; y: number; z: number }, azimuthDeg = 0): [number, number, number] {
  const pitch = (CAMERA_PRESET.pitchDeg * Math.PI) / 180
  const d = CAMERA_PRESET.distance
  const az = (azimuthDeg * Math.PI) / 180
  return [
    target.x + Math.sin(az) * d * Math.cos(pitch),
    target.y + Math.sin(pitch) * d,
    target.z + Math.cos(az) * d * Math.cos(pitch),
  ]
}

// ---------- 布光（§20–§22；alt 变体 ?lighting=dusk） ----------

export interface LightingSpec {
  key: { position: [number, number, number]; intensity: number; color: string }
  fill: { position: [number, number, number]; intensity: number; color: string }
  ambient: number
  hemi: { sky: string; ground: string; intensity: number }
  fogColor: string
  fogNear: number
  fogFar: number
  exposure: number
}

export function lightingFor(variant: string | null): LightingSpec {
  if (variant === "dusk") {
    return {
      key: { position: [14, 7, 9], intensity: 2.1, color: "#FFD9A8" },
      fill: { position: [-10, 5, -6], intensity: 0.5, color: "#9FB4CC" },
      ambient: 0.4,
      hemi: { sky: "#E8D9BE", ground: "#8E887B", intensity: 0.4 },
      fogColor: LANDSCAPE_PALETTE.hazeDusk,
      fogNear: 16,
      fogFar: 44,
      exposure: 1.0,
    }
  }
  return {
    key: { position: [8, 13, 7], intensity: 1.65, color: "#FFF6E6" },
    fill: { position: [-9, 6, -5], intensity: 0.42, color: "#D8E2EC" },
    ambient: 0.52,
    hemi: { sky: "#F2EFE6", ground: "#B2AC9E", intensity: 0.42 },
    fogColor: LANDSCAPE_PALETTE.haze,
    fogNear: 18,
    fogFar: 48,
    exposure: 1.06,
  }
}
