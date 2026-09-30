// Camera Model（Task 13 §6–§12/§45）：Interaction Model 的一部分，
// 与任何 World Renderer 完全无关（禁止 import renderer 组件或视觉隐喻）。
//
// 坐标约定：世界坐标以 Company Core 为原点；屏幕映射
//   screen = (world - camera) * scale + viewportCenter
// camera 只有一个 { x, y, scale }，Renderer 不得自行维护第二套。

export interface CameraState {
  x: number
  y: number
  scale: number
}

export const CAMERA_LIMITS = {
  MIN_SCALE: 0.65,
  MAX_SCALE: 1.45,
  /** 判定「偏离初始状态」的阈值（用于显示 MiniMap） */
  DEVIATION_SCALE: 0.12,
  DEVIATION_TRANSLATE: 60,
} as const

export const IDENTITY_CAMERA: CameraState = { x: 0, y: 0, scale: 1 }

export interface Viewport {
  width: number
  height: number
}

export function clampScale(scale: number): number {
  return Math.min(CAMERA_LIMITS.MAX_SCALE, Math.max(CAMERA_LIMITS.MIN_SCALE, scale))
}

export function worldToScreen(camera: CameraState, viewport: Viewport, x: number, y: number): { x: number; y: number } {
  return {
    x: (x - camera.x) * camera.scale + viewport.width / 2,
    y: (y - camera.y) * camera.scale + viewport.height / 2,
  }
}

export function screenToWorld(camera: CameraState, viewport: Viewport, x: number, y: number): { x: number; y: number } {
  return {
    x: camera.x + (x - viewport.width / 2) / camera.scale,
    y: camera.y + (y - viewport.height / 2) / camera.scale,
  }
}

/** 画布拖动（空白区域） */
export function panCamera(camera: CameraState, dxScreen: number, dyScreen: number): CameraState {
  return {
    ...camera,
    x: camera.x - dxScreen / camera.scale,
    y: camera.y - dyScreen / camera.scale,
  }
}

/** pointer-relative zoom：保持指针下的世界点不动（§10） */
export function zoomAtPointer(
  camera: CameraState,
  viewport: Viewport,
  pointer: { x: number; y: number },
  factor: number,
): CameraState {
  const nextScale = clampScale(camera.scale * factor)
  if (nextScale === camera.scale) return camera
  const anchor = screenToWorld(camera, viewport, pointer.x, pointer.y)
  return {
    scale: nextScale,
    x: anchor.x - (pointer.x - viewport.width / 2) / nextScale,
    y: anchor.y - (pointer.y - viewport.height / 2) / nextScale,
  }
}

export interface WorldBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function boundsOfObjects(
  objects: { x: number; y: number; width: number; height: number }[],
): WorldBounds | null {
  if (objects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const o of objects) {
    minX = Math.min(minX, o.x - o.width / 2)
    minY = Math.min(minY, o.y - o.height / 2)
    maxX = Math.max(maxX, o.x + o.width / 2)
    maxY = Math.max(maxY, o.y + o.height / 2)
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Fit（§11）：根据可见对象的 bounding box 计算 camera。
 * 不改变对象布局；scale 受 CAMERA_LIMITS 约束。
 */
export function computeFitCamera(bounds: WorldBounds, viewport: Viewport, padding = 120): CameraState {
  const width = Math.max(bounds.maxX - bounds.minX, 1)
  const height = Math.max(bounds.maxY - bounds.minY, 1)
  const scaleX = (viewport.width - padding * 2) / width
  const scaleY = (viewport.height - padding * 2) / height
  const scale = clampScale(Math.min(scaleX, scaleY, 1))
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    scale,
  }
}

/** Reset（§12）：恢复初始确定性布局 + camera fit（由调用方传入初始 bounds） */
export function computeResetCamera(bounds: WorldBounds | null, viewport: Viewport, padding = 120): CameraState {
  if (!bounds) return IDENTITY_CAMERA
  return { ...computeFitCamera(bounds, viewport, padding), scale: clampScale(computeFitCamera(bounds, viewport, padding).scale) }
}

/** MiniMap 触发条件（§49）：camera 明显偏离 initial state */
export function isCameraDeviated(camera: CameraState): boolean {
  return (
    Math.abs(camera.scale - 1) > CAMERA_LIMITS.DEVIATION_SCALE ||
    Math.abs(camera.x) > CAMERA_LIMITS.DEVIATION_TRANSLATE ||
    Math.abs(camera.y) > CAMERA_LIMITS.DEVIATION_TRANSLATE
  )
}

/** MiniMap 坐标映射（世界 → minimap 局部坐标） */
export function worldToMiniMap(
  world: { x: number; y: number },
  bounds: WorldBounds,
  size: { width: number; height: number },
): { x: number; y: number } {
  const width = Math.max(bounds.maxX - bounds.minX, 1)
  const height = Math.max(bounds.maxY - bounds.minY, 1)
  return {
    x: ((world.x - bounds.minX) / width) * size.width,
    y: ((world.y - bounds.minY) / height) * size.height,
  }
}

/** 当前视口在世界坐标中的矩形（MiniMap viewport 框） */
export function viewportWorldRect(camera: CameraState, viewport: Viewport): WorldBounds {
  const halfW = viewport.width / 2 / camera.scale
  const halfH = viewport.height / 2 / camera.scale
  return { minX: camera.x - halfW, minY: camera.y - halfH, maxX: camera.x + halfW, maxY: camera.y + halfH }
}
