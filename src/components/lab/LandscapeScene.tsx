"use client"

import * as THREE from "three"
import { useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber"

import {
  CAMERA_PRESET,
  LANDSCAPE_PALETTE,
  cameraPosition,
  colorAt,
  heightAt,
  heightRange,
  lightingFor,
  zoneAnchor,
  zoneAt,
  type LandscapeModel,
} from "@/lib/lab/landscape"

// WORLD LAYER（Task 15.2 §8）：Three.js 只渲染地貌、材质、光、marker；
// 中文/数字/Claim 全部在 DOM overlay（§8 禁止画进 Canvas）。
// §14 一整块连续 displaced mesh；§20–§22 建筑模型摄影布光 + 克制雾。

export interface ProjectionEntry {
  id: string
  kind: "zone" | "suggestion"
  label: string
  status: string
  index: string
  sx: number
  sy: number
  side: 1 | -1
}

export interface SceneSharedRefs {
  panRef: React.MutableRefObject<{ x: number; z: number }>
  pointerRef: React.MutableRefObject<{ x: number; y: number }>
  perfRef: React.MutableRefObject<{ fps: number; calls: number; tris: number }>
  projectionsRef: React.MutableRefObject<ProjectionEntry[]>
}

// ---------- 程序化纹理（矿物颗粒 + 地层细线，§18 surface variation） ----------

function makeGrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 512
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#F0EDE5"
  ctx.fillRect(0, 0, 512, 512)
  // 矿物颗粒
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512
    const y = Math.random() * 512
    const a = Math.random() * 0.055
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(110,105,95,${a})` : `rgba(255,255,255,${a})`
    ctx.fillRect(x, y, 1.4, 1.4)
  }
  // 地层细线
  for (let y = 0; y < 512; y += 5 + Math.random() * 7) {
    ctx.strokeStyle = `rgba(105,100,90,${0.03 + Math.random() * 0.04})`
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(0, y)
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.03 + y) * 2.2)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(9, 6)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makePuffTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext("2d")!
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64)
  grad.addColorStop(0, "rgba(240,236,227,0.85)")
  grad.addColorStop(0.55, "rgba(233,229,219,0.4)")
  grad.addColorStop(1, "rgba(233,229,219,0)")
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(canvas)
}

// ---------- 地形（§14/§17/§18：一整块 displaced slab + vertex colors） ----------

function Terrain({
  model,
  onHoverZone,
}: {
  model: LandscapeModel
  onHoverZone: (dimensionId: string | null) => void
}) {
  const colorTmp = useMemo(() => new THREE.Color(), [])
  const { geometry, grain } = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(40, 26, 230, 150)
    geometry.rotateX(-Math.PI / 2)
    const pos = geometry.attributes.position as THREE.BufferAttribute
    const range = heightRange(model)
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = heightAt(model, x, z)
      pos.setY(i, h)
      // slope：有限差分（sculptural shading）
      const e = 0.14
      const dx = (heightAt(model, x + e, z) - heightAt(model, x - e, z)) / (2 * e)
      const dz = (heightAt(model, x, z + e) - heightAt(model, x, z - e)) / (2 * e)
      const slope = Math.min(Math.hypot(dx, dz) / 1.25, 1)
      const hNorm = (h - range.min) / Math.max(range.max - range.min, 0.001)
      const c = colorAt(model, x, z, h, hNorm, slope)
      // colorAt 输出 sRGB；vertex color buffer 需要 working（linear）空间，否则整体被提亮去饱和
      colorTmp.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace)
      colors[i * 3] = colorTmp.r
      colors[i * 3 + 1] = colorTmp.g
      colors[i * 3 + 2] = colorTmp.b
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    return { geometry, grain: makeGrainTexture() }
  }, [model])

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    onHoverZone(zoneAt(model, e.point.x, e.point.z))
  }

  return (
    <group>
      <mesh
        geometry={geometry}
        receiveShadow
        castShadow
        onPointerMove={handleMove}
        onPointerOut={() => onHoverZone(null)}
      >
        <meshStandardMaterial
          vertexColors
          map={grain}
          bumpMap={grain}
          bumpScale={1.7}
          roughness={0.86}
          metalness={0.04}
        />
      </mesh>
      {/* 底座 slab：世界读作「雕塑模型体块」（EQT/San Rita 器物感），不是漂浮贴片 */}
      <mesh position={[0, -0.46, 0]} receiveShadow>
        <boxGeometry args={[40, 0.7, 26]} />
        <meshStandardMaterial color="#8F8A7D" roughness={0.92} metalness={0.02} />
      </mesh>
    </group>
  )
}

// ---------- Evidence survey markers（§23–§27） ----------

function Markers({
  model,
  hoveredZone,
  onHoverEvidence,
}: {
  model: LandscapeModel
  hoveredZone: string | null
  onHoverEvidence: (evidenceId: string | null) => void
}) {
  const markers = useMemo(
    () =>
      model.markers.map((m) => ({
        ...m,
        y: heightAt(model, m.x, m.z),
      })),
    [model],
  )
  const connectors = useMemo(() => {
    const pts: number[] = []
    for (const zone of model.zones) {
      if (zone.status === "unknown" || zone.markers.length < 2) continue
      const sorted = [...zone.markers].sort(
        (a, b) => Math.atan2(a.z - zone.z, a.x - zone.x) - Math.atan2(b.z - zone.z, b.x - zone.x),
      )
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i]
        const b = sorted[(i + 1) % sorted.length]
        const ya = heightAt(model, a.x, a.z)
        const yb = heightAt(model, b.x, b.z)
        pts.push(a.x, ya + 0.1, a.z, b.x, yb + 0.1, b.z)
      }
    }
    return new Float32Array(pts)
  }, [model])

  return (
    <group>
      {connectors.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[connectors, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color={LANDSCAPE_PALETTE.connector} transparent opacity={0.4} />
        </lineSegments>
      )}
      {markers.map((m) => {
        const zoneActive = hoveredZone === m.dimensionId
        const scale = zoneActive ? 1.22 : 1
        return (
          <group
            key={m.evidenceId}
            position={[m.x, m.y, m.z]}
            rotation={[0, 0, m.tilt]}
            scale={scale}
            onPointerOver={(e) => {
              e.stopPropagation()
              onHoverEvidence(m.evidenceId)
            }}
            onPointerOut={() => onHoverEvidence(null)}
          >
            <mesh castShadow position={[0, 0.26, 0]}>
              <cylinderGeometry args={[0.018, 0.026, 0.5, 8]} />
              <meshStandardMaterial color="#7A766B" roughness={0.5} metalness={0.35} />
            </mesh>
            <mesh castShadow position={[0, 0.56, 0]}>
              <sphereGeometry args={[0.062, 16, 16]} />
              <meshStandardMaterial
                color={LANDSCAPE_PALETTE.beacon}
                roughness={0.35}
                metalness={0.3}
                emissive={LANDSCAPE_PALETTE.beacon}
                emissiveIntensity={zoneActive ? 0.35 : 0.12}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

// ---------- UNKNOWN / Suggestion 的雾团（§26/§30/§22：克制） ----------

function FogPuffs({ model }: { model: LandscapeModel }) {
  const puff = useMemo(() => makePuffTexture(), [])
  const groupRef = useRef<THREE.Group>(null)
  const puffs = useMemo(() => {
    const list: { x: number; y: number; z: number; scale: number; opacity: number; phase: number }[] = []
    const push = (cx: number, cz: number, r: number, count: number, opacity: number) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + stablePhase(cx, cz, i)
        const rr = r * (0.15 + ((i * 37) % 10) / 10 * 0.5)
        list.push({
          x: cx + Math.cos(a) * rr,
          y: heightAt(model, cx, cz) + 0.9 + ((i * 13) % 10) / 14,
          z: cz + Math.sin(a) * rr * 0.8,
          scale: 4.2 + ((i * 7) % 10) / 5,
          opacity,
          phase: a,
        })
      }
    }
    for (const zone of model.zones) {
      if (zone.status === "unknown") push(zone.x, zone.z, zone.radius, 5, 0.17)
    }
    for (const s of model.suggestions) push(s.x, s.z, s.radius, 4, 0.14)
    return list
  }, [model])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    groupRef.current?.children.forEach((child, i) => {
      const p = puffs[i]
      if (!p) return
      child.position.x = p.x + Math.sin(t * 0.12 + p.phase) * 0.45
      child.position.y = p.y + Math.sin(t * 0.09 + p.phase * 2) * 0.12
    })
  })

  return (
    <group ref={groupRef}>
      {puffs.map((p, i) => (
        <sprite key={i} position={[p.x, p.y, p.z]} scale={[p.scale, p.scale * 0.52, 1]}>
          <spriteMaterial map={puff} transparent opacity={p.opacity} depthWrite={false} />
        </sprite>
      ))}
    </group>
  )
}

function stablePhase(a: string | number, b: string | number, i: number): number {
  const v = `${a}:${b}:${i}`
  let hash = 0x811c9dc5
  for (let k = 0; k < v.length; k++) {
    hash ^= v.charCodeAt(k)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return (hash / 0xffffffff) * Math.PI * 2
}

// ---------- 相机 rig（§9/§32–§34：pitch 固定、drag pan、轻 parallax、hover 微移） ----------

function CameraRig({
  model,
  shared,
  hoveredZone,
  lightingKey,
}: {
  model: LandscapeModel
  shared: SceneSharedRefs
  hoveredZone: string | null
  lightingKey: string | null
}) {
  const { camera, gl } = useThree()
  const target = useRef(new THREE.Vector3(CAMERA_PRESET.target.x, CAMERA_PRESET.target.y, CAMERA_PRESET.target.z))
  const framesRef = useRef<{ count: number; last: number } | null>(null)

  useEffect(() => {
    // 同步外部系统（three renderer）——effect 的正当职责
    // eslint-disable-next-line react-hooks/immutability -- three.js renderer 配置是命令式 API
    gl.toneMapping = THREE.ACESFilmicToneMapping
  }, [gl, lightingKey])

  // R3F useFrame 帧循环：按帧读写 ref / 修改 three 对象是官方惯例（渲染期不执行这些路径）
  // eslint-disable-next-line react-hooks/immutability -- 帧循环惯例，见 docs/design-audit/task15-2
  useFrame((_, delta) => {
    const pan = shared.panRef.current
    const pointer = shared.pointerRef.current
    // hover 微移（§32 camera shifts subtly）：目标向 zone 中心轻推 14%
    let tx = CAMERA_PRESET.target.x + pan.x
    let tz = CAMERA_PRESET.target.z + pan.z
    if (hoveredZone) {
      const zone = model.zones.find((z) => z.dimensionId === hoveredZone)
      if (zone) {
        tx += (zone.x - tx) * 0.14
        tz += (zone.z - tz) * 0.14
      }
    }
    // parallax（§34：非常轻）
    const px = pointer.x * CAMERA_PRESET.parallax.x
    const py = pointer.y * CAMERA_PRESET.parallax.y
    const k = Math.min(delta * 4.5, 1)
    target.current.x += (tx - target.current.x) * k
    target.current.y += (CAMERA_PRESET.target.y + py * 0.4 - target.current.y) * k
    target.current.z += (tz - target.current.z) * k
    const pos = cameraPosition({ x: target.current.x, y: target.current.y, z: target.current.z })
    camera.position.set(pos[0] + px * 0.6, pos[1] + py, pos[2])
    camera.lookAt(target.current)

    // perf 采样（§55）：帧循环内计数（非渲染期）
     
    const frames = (framesRef.current ??= { count: 0, last: performance.now() })
    frames.count += 1
    const now = performance.now()
    if (now - frames.last >= 1000) {
      // eslint-disable-next-line react-hooks/immutability -- perf 上报 ref，见 docs/design-audit/task15-2
      shared.perfRef.current = {
        fps: Math.round((frames.count * 1000) / (now - frames.last)),
        calls: gl.info.render.calls,
        tris: gl.info.render.triangles,
      }
      frames.count = 0
      frames.last = now
    }

    // 锚点投影（DOM label 用；§28 DOM overlay）
    const width = gl.domElement.clientWidth
    const height = gl.domElement.clientHeight
    const v = new THREE.Vector3()
    const entries: ProjectionEntry[] = []
    model.zones.forEach((zone, i) => {
      const anchor = zoneAnchor(model, zone)
      v.set(anchor.x, anchor.y, anchor.z).project(camera)
      entries.push({
        id: zone.dimensionId,
        kind: "zone",
        label: zone.label,
        status: zone.status.toUpperCase(),
        index: String(i + 1).padStart(2, "0"),
        sx: ((v.x + 1) / 2) * width,
        sy: ((1 - v.y) / 2) * height,
        side: anchor.x < target.current.x ? -1 : 1,
      })
    })
    model.suggestions.forEach((s, i) => {
      const y = heightAt(model, s.x, s.z) + 0.9
      v.set(s.x, y, s.z).project(camera)
      entries.push({
        id: `suggestion:${s.label}`,
        kind: "suggestion",
        label: s.label,
        status: "UNEXPLORED",
        index: `S${i + 1}`,
        sx: ((v.x + 1) / 2) * width,
        sy: ((1 - v.y) / 2) * height,
        side: 1,
      })
    })
    shared.projectionsRef.current = entries
  })

  return null
}

function FogAndLights({ lightingKey }: { lightingKey: string | null }) {
  const lighting = useMemo(() => lightingFor(lightingKey), [lightingKey])
  const { scene, gl } = useThree()
  useEffect(() => {
    // 同步外部系统（three scene/renderer）
    // eslint-disable-next-line react-hooks/immutability -- three.js 场景配置是命令式 API
    gl.toneMappingExposure = lighting.exposure
    // eslint-disable-next-line react-hooks/immutability -- three.js 场景配置是命令式 API
    scene.fog = new THREE.Fog(lighting.fogColor, lighting.fogNear, lighting.fogFar)
    return () => {
       
      scene.fog = null
    }
  }, [scene, gl, lighting])
  return (
    <>
      <ambientLight intensity={lighting.ambient} />
      <hemisphereLight args={[lighting.hemi.sky, lighting.hemi.ground, lighting.hemi.intensity]} />
      <directionalLight
        position={lighting.key.position}
        intensity={lighting.key.intensity}
        color={lighting.key.color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
      />
      <directionalLight
        position={lighting.fill.position}
        intensity={lighting.fill.intensity}
        color={lighting.fill.color}
      />
    </>
  )
}

export default function LandscapeScene({
  model,
  shared,
  hoveredZone,
  onHoverZone,
  onHoverEvidence,
  lightingKey,
}: {
  model: LandscapeModel
  shared: SceneSharedRefs
  hoveredZone: string | null
  onHoverZone: (id: string | null) => void
  onHoverEvidence: (id: string | null) => void
  /** null = 默认布光；"dusk" = ?lighting=dusk 变体 */
  lightingKey: string | null
}) {
  const initial = cameraPosition(CAMERA_PRESET.target)
  return (
    <Canvas
      dpr={[1, 2]}
      shadows="soft"
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 28, position: initial, near: 0.1, far: 90 }}
      style={{ position: "absolute", inset: 0 }}
    >
      <FogAndLights lightingKey={lightingKey} />
      <Terrain model={model} onHoverZone={onHoverZone} />
      <Markers model={model} hoveredZone={hoveredZone} onHoverEvidence={onHoverEvidence} />
      <FogPuffs model={model} />
      <CameraRig model={model} shared={shared} hoveredZone={hoveredZone} lightingKey={lightingKey} />
    </Canvas>
  )
}
