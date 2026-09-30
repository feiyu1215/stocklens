// Scene 与 DOM 层共享的引用类型（Task 15.2：WORLD/UI 双层 §8）

import type { ProjectionEntry } from "@/components/lab/LandscapeScene"

export interface LandscapeSceneSharedRefs {
  panRef: React.MutableRefObject<{ x: number; z: number }>
  pointerRef: React.MutableRefObject<{ x: number; y: number }>
  perfRef: React.MutableRefObject<{ fps: number; calls: number; tris: number }>
  projectionsRef: React.MutableRefObject<ProjectionEntry[]>
}
