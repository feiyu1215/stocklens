"use client"

import dynamic from "next/dynamic"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import CompanyTransition from "@/components/v5/CompanyTransition"
import InitialResearchLoading from "@/components/v5/InitialResearchLoading"
import ResearchNotesExport from "@/components/v5/ResearchNotesExport"
import {
  applyReorganizedDimension,
  hasStaleTimeSensitiveEvidence,
  mergeRefreshedTruth,
} from "@/lib/v5/refresh-merge"
import { streamInitResearchSpace, type InitPhaseFrame } from "@/lib/v5/init-stream"
import CanvasEvidenceTrace from "@/components/v5/CanvasEvidenceTrace"
import CanvasAnchorLayer from "@/components/v5/CanvasAnchorLayer"
import DemoOverlay from "@/components/v5/DemoOverlay"
import MobileResearchList from "@/components/v5/MobileResearchList"
import MarketTrendStrip from "@/components/v5/MarketTrendStrip"
import StockLensMark from "@/components/v5/StockLensMark"
import { PALETTE } from "@/components/v5/palette"
import { WipeLink } from "@/components/v5/RouteWipe"
import { HOME_HREF, RESEARCH_LIBRARY_HREF } from "@/lib/v5/routes"
import ResearchSidekickPanel, {
  type ResearchAngleDraft,
  type SidekickMode,
  type SidekickTurn,
} from "@/components/v5/ResearchSidekickPanel"
import { instrumentPointer, interactionPerf, perfDebugEnabled, type InteractionRecord } from "@/lib/v5/perf"
import { DEMO_ANGLE_PLACEHOLDER, DEMO_SCENES, DEMO_TYPED_QUESTION, isLastScene, sceneAt, sceneBy, type DemoActionKind } from "@/lib/v5/demo"
import { anchorGlyph, type ResearchSpacePayload } from "@/components/observatory/theme"
import { computeFitCamera, panCamera, screenToWorld, zoomAtPointer, boundsOfObjects, type CameraState } from "@/lib/spatial/camera"
import {
  DESIGN,
  anchorBoxSize,
  composeCanvas,
  evidenceAnnotations,
  gatherTargets,
  tierFont,
  type AnchorSpec,
} from "@/lib/v5/canvas"
import {
  formatLastResearch,
  isSaved,
  loadCanvas,
  loadLibrary,
  loadResearch,
  loadRecent,
  loadSaved,
  mergeLibraryCompanies,
  pushRecent,
  reconcileCanvasSnapshot,
  saveCanvas,
  saveLibrary,
  saveResearch,
  saveRecent,
  saveSaved,
  demoCompleted,
  demoSeen,
  ensureShelfMigrated,
  markDemoCompleted,
  markDemoSeen,
  searchCompanies,
  toggleSaved,
  touchSaved,
  upsertLibrary,
  type CanvasSnapshot,
  type SavedCompany,
} from "@/lib/v5/shelf"
import { installTestFailureInterceptor } from "@/lib/v5/test-failure"
import {
  apertureRectFor,
  apertureSizeFor,
  fixedExclusionZones,
  rectsIntersect,
  resolveApertureCollisions,
  type Rect,
} from "@/lib/v5/aperture"

// Research Canvas（Task 15.3 / 15.3A）——按规格与参考稿实现，不做设计决策。
// 本轮：初始 scale 1.00（§3–§5）、soft focal（§7–§9）、全部核心交互接通（§17–§42）。

const ReadingV3 = dynamic(() => import("@/components/v3/ReadingV3"), { ssr: false })

const C = PALETTE

const DRAG_THRESHOLD = 5
/** 行情/估值会变化；会话内研究空间最多复用 30 分钟，之后重新取证。 */
const RESEARCH_CACHE_TTL_MS = 30 * 60 * 1_000

function fitDesignCamera(viewport: { width: number; height: number }): CameraState {
  const bounds = boundsOfObjects([
    { x: DESIGN.width / 2, y: DESIGN.height / 2, width: DESIGN.width, height: DESIGN.height },
  ])
  return computeFitCamera(bounds!, viewport, 60)
}

interface PinnedNote {
  id: string
  title: string
  summary: string
  x: number
  y: number
}

interface RemovedDimensionSnapshot {
  stockCode: string
  dimension: ResearchSpacePayload["dimensions"][number]
  index: number
  claims: ResearchSpacePayload["claims"]
  position?: { x: number; y: number }
  wasParked: boolean
  wasSelected: boolean
  notes: PinnedNote[]
}

type AiScopeType = "company" | "dimension" | "claim" | "evidence"

interface AiScope {
  type: AiScopeType
  dimensionId?: string
  claimId?: string
  evidenceId?: string
}

type TurnStatus = "running" | "completed" | "stopped" | "failed"

interface AiEntry {
  id: string
  question: string
  stockName: string
  scopeType: AiScopeType
  scopeLabel: string
  /** §21：发送瞬间冻结的 scope + 证据（历史 Turn 永远用它自己的上下文） */
  dimensionId?: string
  claimId?: string
  evidenceIds: string[]
  status: TurnStatus
  createdAt: string
  generatedAt?: string
  summary?: string
  confirmed?: string[]
  inferred?: string[]
  unknowns?: string[]
  message?: string
  /** §37：本地保存问题以便 修改问题（Retry 用冻结上下文） */
  frozenQuestion: string
}

function researchAngleDraftFor(text: string, payload: ResearchSpacePayload): ResearchAngleDraft {
  const sourceText = text.trim()
  const normalized = sourceText.replace(/[？?。！!]+$/g, "")
  const suggestion = payload.suggestions.find((item) => {
    const suggestedQuestion = item.researchQuestion.replace(/[？?。！!]+$/g, "").trim()
    return (
      normalized === suggestedQuestion ||
      normalized.includes(item.label) ||
      item.label.includes(normalized)
    )
  })
  if (suggestion) {
    return {
      sourceText,
      title: suggestion.label,
      researchQuestion: suggestion.researchQuestion,
      rationale: suggestion.rationale,
      checks: ["匹配当前公司已有证据", "区分可确认结论与证据缺口", "生成可回溯的 Claim 与 Evidence"],
      evidenceCount: Math.min(6, Math.max(3, suggestion.capabilityRefs.length + 2)),
    }
  }

  const overseas = /海外|全球|国际/.test(normalized)
  const inventory = /库存|周转/.test(normalized)
  const title = overseas
    ? "海外收入与盈利贡献"
    : inventory
      ? "库存效率与周转压力"
      : normalized.replace(/怎么样|如何|是否|情况/g, "").trim().slice(0, 16) || "自定义研究角度"
  const checks = overseas
    ? ["海外收入规模及变化", "海外业务的盈利贡献", "区域与汇率相关证据缺口"]
    : inventory
      ? ["存货规模与增速", "周转效率变化", "收入、利润与库存的方向关系"]
      : ["匹配当前能力清单中的相关指标", "寻找支持与反向证据", "明确暂时无法验证的信息"]
  return {
    sourceText,
    title,
    researchQuestion: sourceText.endsWith("？") || sourceText.endsWith("?") ? sourceText : `${sourceText}？`,
    rationale: `把“${normalized}”整理为可验证的研究任务；确认后才会调用真实研究接口并写入画布。`,
    checks,
    evidenceCount: Math.min(6, Math.max(3, checks.length + 1)),
  }
}

function aiSuggestionsFor(scope: AiScope, payload: ResearchSpacePayload | null): string[] {
  if (!payload) return []
  if (scope.type === "dimension") {
    const dim = payload.dimensions.find((d) => d.dimensionId === scope.dimensionId)
    const dimClaims = payload.claims.filter((c) => c.dimensionId === scope.dimensionId)
    const out: string[] = []
    if (dimClaims.some((c) => c.signal === "conflict")) out.push("这个冲突主要来自什么？")
    out.push("为什么利润增速弱于收入？", "有哪些证据还缺失？")
    void dim
    return out.slice(0, 3)
  }
  if (scope.type === "claim") return ["这个结论最关键的依据是什么？", "有哪些反向信号？"].slice(0, 3)
  if (scope.type === "evidence") return ["这个数值是如何计算的？", "它的口径与期间是什么？"].slice(0, 3)
  return [
    `${payload.company.stockName}现在最值得关注什么？`,
    "估值处于什么位置？",
    "目前有哪些证据不足？",
  ].slice(0, 3)
}

/** Task 16 §A4：浏览器 history 里的语义状态（company / dimension / reading / evidence） */
interface NavState {
  sl: true
  stockCode: string
  dim: string | null
  read: boolean
  ev: string | null
}

interface AskState {
  anchorId: string
  question: string
  status: "idle" | "loading" | "done" | "failed"
  summary?: string
  confirmed?: string[]
  inferred?: string[]
  unknowns?: string[]
  message?: string
}

export default function ResearchCanvas({ workspaceLab = false }: { workspaceLab?: boolean }) {
  const [payload, setPayload] = useState<ResearchSpacePayload | null>(null)
  const [initialRequest, setInitialRequest] = useState({ stockCode: "", question: "" })
  const [initialElapsedSec, setInitialElapsedSec] = useState(0)
  const [failed, setFailed] = useState(false)
  /** 首次研究被用户主动中止；与 failed 分开，因为它有自己的确认界面（重试 / 返回研究库） */
  const [initCancelled, setInitCancelled] = useState(false)
  /** init 运行代号：重试时递增，让 init effect 与计时器一并重启 */
  const [initRun, setInitRun] = useState(0)
  const initAbortRef = useRef<AbortController | null>(null)
  // P2-3：服务端真实阶段帧（驱动 InitialResearchLoading，取代假秒表）
  const [initServerPhase, setInitServerPhase] = useState<InitPhaseFrame | null>(null)
  const [isRecordedSample, setIsRecordedSample] = useState(false)
  const [camera, setCamera] = useState<CameraState>({ x: DESIGN.width / 2, y: DESIGN.height / 2, scale: 1 })
  const [viewport, setViewport] = useState({ width: 1440, height: 900 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  /** §5：click → Focus Aperture（替代原先的原地堆叠 Peek） */
  const [apertureId, setApertureId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  /** §20：thread 按公司隔离（Map<stockCode, entries>） */
  const [aiThreads, setAiThreads] = useState<Record<string, AiEntry[]>>({})
  // 移动端修复（2026-10）：侧板在手机上是全屏覆盖，默认打开会把研究列表完全盖住——
  // 新用户手机进来看到的是聊天面板而不是研究空间。改为默认关闭，挂载后仅桌面端补开
  //（见下方 effect），桌面行为不变。
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInput, setAiInput] = useState("")
  const [aiStatus, setAiStatus] = useState<"idle" | "loading">("idle")
  /** §6：scope 自动来自 activeCompany / dimension / claim / evidence */
  const [aiScopeOverride, setAiScopeOverride] = useState<AiScope | null>(null)
  const [aiDebugOn, setAiDebugOn] = useState(false)
  const [aiNotice, setAiNotice] = useState<string | null>(null)
  const [sidekickMode, setSidekickMode] = useState<SidekickMode>("ask")
  const [sidekickWidth, setSidekickWidth] = useState(430)
  const [sidekickDraft, setSidekickDraft] = useState<ResearchAngleDraft | null>(null)
  const [sidekickNotice, setSidekickNotice] = useState<string | null>(null)
  // 贴底跟随用 ref：避免闭包/提交时序导致「上翻仍被强制拉到底」
  const atBottomRef = useRef(true)
  const [hasNewResponse, setHasNewResponse] = useState(false)
  const [threadReady, setThreadReady] = useState<Record<string, boolean>>({})
  const aiInputRef = useRef<HTMLTextAreaElement>(null)
  const aiThreadRef = useRef<HTMLDivElement>(null)
  /** §12/§25：第一版单活跃任务 */
  const aiAbortRef = useRef<AbortController | null>(null)
  const focusAiLensRef = useRef<((scope: AiScope | null, preset?: string) => void) | null>(null)
  const askRef = useRef<((q: string, scope: AiScope) => Promise<void>) | null>(null)
  const aiRunningStockRef = useRef<string | null>(null)
  /** §A4：本页内 pushState 的深度（用于决定 back 是否安全） */
  const navDepthRef = useRef(0)
  /** §B14：每公司画布快照（memory 优先，sessionStorage 兜底） */
  const canvasCacheRef = useRef<Record<string, CanvasSnapshot>>({})
  const navApplyingRef = useRef(false)
  /** 供 event/异步回调读取最新 payload（避免闭包旧值） */
  const payloadRef = useRef<ResearchSpacePayload | null>(null)
  /** Demo：退出钩子 + 既有 UI action 集合（§22 只调度，不复制业务逻辑） */
  const demoExitRef = useRef<(() => void) | null>(null)
  /** Reading 之前的相机（§A5 返回时恢复空间） */
  const preReadingCameraRef = useRef<CameraState | null>(null)
  const closeReadingRef = useRef<(() => void) | null>(null)
  /** 切换公司时的解析中提示（§B13） */
  const [resolvingName, setResolvingName] = useState<string | null>(null)
  const [researchTimes, setResearchTimes] = useState<Record<string, number>>({})
  const switchCompanyRef = useRef<((stockCode: string, meta?: { name?: string; industry?: string }, opts?: { mode?: "refresh"; force?: boolean }) => Promise<void>) | null>(null)
  /** 切换序号：过期请求不得覆盖新选择（防止连点两次落到错的公司） */
  const switchSeqRef = useRef(0)
  /** §B15：待恢复的研究焦点（等该公司 anchors 就绪后打开一次） */
  const pendingRestoreRef = useRef<{ code: string; dimensionId: string } | null>(null)
  /** §6：已研究会话（缓存路径不调用 /api/research/init） */
  const payloadCacheRef = useRef<Record<string, ResearchSpacePayload>>({})
  const payloadCachedAtRef = useRef<Record<string, number>>({})
  const recordedSampleCodesRef = useRef<Set<string>>(new Set())
  // 进入即更新（2026-10-09 用户拍板）：本挂载内已自动/已实时刷过的代码——
  // live 链路进来的数据是刚拉的，标记后跳过自动刷，避免同一进入重复请求
  const autoRefreshedCodesRef = useRef<Set<string>>(new Set())
  const restoredCompaniesRef = useRef<Set<string>>(new Set())
  const switchAbortRef = useRef<AbortController | null>(null)
  /** §2/§3：未缓存 init 的唯一所有者 + 在途去重（同一公司只允许一个在途请求）；
   *  Refresh（force）有意绕过去重，因为那是用户显式发起的新请求。 */
  const inFlightInitRef = useRef<Record<string, Promise<ResearchSpacePayload | null>>>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const navBaseSetRef = useRef(false)
  /** 最近一次 Aperture 的客观度量（§43/§49：碰撞前后数量、位移对象数） */
  const [apertureMetrics, setApertureMetrics] = useState<{
    rect: Rect
    displaced: Record<string, { x: number; y: number }>
    collisionsBefore: number
    collisionsAfter: number
    ownClashes: boolean
  } | null>(null)
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  /** §9：Aperture 打开时的局部磁性位移（关闭即恢复；不写回 manual） */
  const [displaced, setDisplaced] = useState<Record<string, { x: number; y: number }>>({})
  const [selection, setSelection] = useState<string[]>([])
  const [focusSet, setFocusSet] = useState(false)
  const [parked, setParked] = useState<string[]>([])
  const [notes, setNotes] = useState<PinnedNote[]>([])
  const [removedDimension, setRemovedDimension] = useState<RemovedDimensionSnapshot | null>(null)
  const [suggestDrag, setSuggestDrag] = useState<{ label: string; x: number; y: number; over: boolean } | null>(null)
  const [adding, setAdding] = useState<{ label: string; x: number; y: number } | null>(null)
  /** §43：失败的临时研究角度（不删除用户输入） */
  const [failedAngle, setFailedAngle] = useState<{ label: string; x: number; y: number } | null>(null)
  const [ask, setAsk] = useState<AskState | null>(null)
  const [lensOpen, setLensOpen] = useState(false)
  const [lensText, setLensText] = useState("")
  const [addAngle, setAddAngle] = useState<string | null>(null)
  const [readingId, setReadingId] = useState<string | null>(null)
  const [readingEvidenceId, setReadingEvidenceId] = useState<string | null>(null)
  // 研究笔记打印导出（阶段 3 / P2-2）：覆盖层预览 + window.print()
  const [notesOpen, setNotesOpen] = useState(false)
  const [flipFrom, setFlipFrom] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [companyQuery, setCompanyQuery] = useState<string | null>(null)
  const [companyResults, setCompanyResults] = useState<{ stockCode: string; stockName: string }[]>([])
  // 已检索完成、且确认无结果的查询词。只在检索返回后写入，避免输入过程中就把"无结果"闪给用户。
  const [companySearched, setCompanySearched] = useState("")
  // Task 16 PART B：Research Shelf（研究架）
  const [savedCompanies, setSavedCompanies] = useState<SavedCompany[]>([])
  const [recentCompanies, setRecentCompanies] = useState<SavedCompany[]>([])
  const [libraryCompanies, setLibraryCompanies] = useState<SavedCompany[]>([])
  const [lastResearchAt, setLastResearchAt] = useState<number | null>(null)
  const [refreshNote, setRefreshNote] = useState<string | null>(null)
  // §5–§15：公司切换双路径（缓存 / 未缓存过渡）
  const [pendingCompany, setPendingCompany] = useState<{ stockCode: string; name: string; industry?: string } | null>(null)
  const [switchPhase, setSwitchPhase] = useState<"idle" | "resolving" | "failed">("idle")
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [revealCount, setRevealCount] = useState(99)
  const [perfOn, setPerfOn] = useState(false)
  const [perfRows, setPerfRows] = useState<InteractionRecord[]>([])
  // §1–§21：全屏 Research Transition（仅未缓存公司切换 / Refresh）
  const [switchStartedAt, setSwitchStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [switchMorph, setSwitchMorph] = useState(false)
  const [switchMode, setSwitchMode] = useState<"company" | "refresh">("company")
  const [cancelNotice, setCancelNotice] = useState<string | null>(null)
  const [lastCompanyName, setLastCompanyName] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  // §D39/§D40：••• 菜单 + Clear thread 二次确认（视觉关闭 ≠ 删除历史）
  const [threadMenuOpen, setThreadMenuOpen] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  // §C19/§C20/§C34：Guided Demo 控制器状态
  const [demoIndex, setDemoIndex] = useState<number | null>(null)
  const [demoPaused, setDemoPaused] = useState(false)
  const [demoPrompt, setDemoPrompt] = useState(false)
  const [demoCaption, setDemoCaption] = useState({ title: "", text: "" })
  const [demoFinal, setDemoFinal] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const reducedMotionRef = useRef(false)
  const [hitAreas, setHitAreas] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null)
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean } | null>(null)
  const noteDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const suggestRef = useRef<{ label: string; clientX: number; clientY: number } | null>(null)
  const spaceRef = useRef(false)
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const suggestDragRef = useRef<{ label: string; x: number; y: number; over: boolean } | null>(null)
  /** 指针捕获推迟到真正开始拖动时才做（见 onPointerMove）：pointerdown 就捕获会把 click 改派给捕获元素 */
  const suggestCapturedRef = useRef(false)
  const suppressSuggestionClickRef = useRef(false)
  const removedDimensionTimerRef = useRef<number | null>(null)
  const addDimensionRef = useRef<((label: string, sx?: number, sy?: number) => Promise<boolean>) | null>(null)

  // ---- fixture ----
  // initRun 递增（用户点"重新开始"）时整体重跑；cleanup 里 abort 上一次未完成的请求。
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    initAbortRef.current = controller
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      // Task 16.2A B4：失败态注入必须排在首个业务请求之前（生产构建下为空操作）
      installTestFailureInterceptor()
      const params = new URLSearchParams(window.location.search)
      setHitAreas(params.get("hitAreas") === "1")
      setAiDebugOn(params.get("aiDebug") === "1")
      setInitServerPhase(null)
      try {
        const isLive = params.get("live") === "1"
        const requestedCode = /^\d{6}\.(SZ|SH|BJ)$/.test((params.get("stockCode") ?? "").trim().toUpperCase())
          ? (params.get("stockCode") ?? "").trim().toUpperCase()
          : "000333.SZ"
        const entryQuestion = params.get("q")?.trim()
        setInitialRequest({ stockCode: requestedCode, question: entryQuestion ?? "" })
        const savedResearch = params.get("resume") === "1" ? await loadResearch(requestedCode) : null
        if (savedResearch) {
          if (savedResearch.recordedSample) recordedSampleCodesRef.current.add(requestedCode)
          setIsRecordedSample(savedResearch.recordedSample)
          setPayload(savedResearch.payload)
          return
        }
        let data: ResearchSpacePayload
        if (isLive) {
          // P2-3：流式 init——服务端阶段帧驱动真实进度
          data = await streamInitResearchSpace({
            body: {
              stockCode: requestedCode,
              ...(entryQuestion ? { question: entryQuestion.slice(0, 500) } : {}),
            },
            signal: controller.signal,
            onPhase: (frame) => {
              if (!cancelled) setInitServerPhase(frame)
            },
          })
        } else {
          const res = await fetch(`/api/observatory/fixture?name=${params.get("fixture") ?? "midea-artdirection"}`, {
            signal: controller.signal,
          })
          if (!res.ok) throw new Error()
          data = (await res.json()) as ResearchSpacePayload
        }
        if (cancelled || controller.signal.aborted) return
        if (isLive) {
          recordedSampleCodesRef.current.delete(data.company.stockCode)
          // live 进入 = 数据刚拉取，无需再自动刷
          autoRefreshedCodesRef.current.add(data.company.stockCode)
        } else {
          recordedSampleCodesRef.current.add(data.company.stockCode)
        }
        setIsRecordedSample(!isLive)
        setPayload(data)
      } catch {
        // 中止 = 用户主动选择，不算失败；只有真正的请求/解析错误才进入失败态
        setInitServerPhase(null)
        if (!cancelled && !controller.signal.aborted) setFailed(true)
        if (!cancelled && controller.signal.aborted) setInitCancelled(true)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [initRun])

  useEffect(() => {
    // 中止后停表；重试（initRun 递增）时 startedAt 重置，首次 update() 即归零
    if (payload || failed || initCancelled) return
    const startedAt = Date.now()
    const update = () => setInitialElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    update()
    const id = window.setInterval(update, 1000)
    return () => window.clearInterval(id)
  }, [failed, initCancelled, initRun, payload])

  // §4：session 内持久化（仅 thread 数据，不含任何 secret）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      try {
        const next: Record<string, AiEntry[]> = {}
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key?.startsWith("stocklens.thread.")) {
            next[key.replace("stocklens.thread.", "")] = JSON.parse(sessionStorage.getItem(key) ?? "[]")
          }
        }
        if (Object.keys(next).length > 0) {
          setAiThreads(next)
          // 恢复的历史必须可见：有历史就把线程展开，并贴到最新一轮
          if (Object.values(next).some((turns) => turns.length > 0)) {
            setAiOpen(true)
            window.setTimeout(() => {
              const el = aiThreadRef.current
              if (el) {
                el.scrollTop = el.scrollHeight
                atBottomRef.current = true
              }
            }, 150)
          }
        }
      } catch {
        // 忽略存储异常
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    for (const [code, turns] of Object.entries(aiThreads)) {
      try {
        sessionStorage.setItem(`stocklens.thread.${code}`, JSON.stringify(turns))
      } catch {
        // 配额/隐私模式：忽略
      }
    }
  }, [aiThreads])

  useEffect(
    () => () => {
      if (removedDimensionTimerRef.current !== null) {
        window.clearTimeout(removedDimensionTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    const target = rootRef.current
    const update = () => {
      const rect = target?.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect?.width ?? window.innerWidth))
      const h = Math.max(1, Math.round(rect?.height ?? window.innerHeight))
      setViewport({ width: w, height: h })
      // 画布使用左上角为 0 的正坐标，Fit 的对象坐标必须传入设计面的中心。
      if (w < 1200 || workspaceLab) {
        setCamera(fitDesignCamera({ width: w, height: h }))
      }
    }
    update()
    const observer = target ? new ResizeObserver(update) : null
    if (target) observer?.observe(target)
    window.addEventListener("resize", update)
    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [workspaceLab])

  // 桌面端 Lab 页保持「侧板默认打开」的原有行为；移动端默认关闭（见 aiOpen useState 注释）。
  // rAF 延迟一帧：规避 react-hooks/set-state-in-effect（同步 setState 会触发级联渲染告警）。
  useEffect(() => {
    if (!workspaceLab) return
    const raf = window.requestAnimationFrame(() => {
      if (window.innerWidth >= 768) setAiOpen(true)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [workspaceLab])

  const anchors: AnchorSpec[] = useMemo(() => (payload ? composeCanvas(payload) : []), [payload])
  const focalId = useMemo(
    () => anchors.find((a) => a.isFocalCandidate)?.dimensionId ?? anchors[0]?.dimensionId ?? null,
    [anchors],
  )
  /** 轻量检查目标（hover）；无 hover 时为 null（§1：默认不再自动展开） */
  const activeId = hoverId
  const active = anchors.find((a) => a.dimensionId === activeId) ?? null

  // §A4：语义 history。pushState 维护层栈，程序化关闭走 back()，popstate 统一落地。
  const pushNav = useCallback((next: NavState) => {
    try {
      window.history.pushState(next, "", window.location.href)
      navDepthRef.current += 1
    } catch {
      // history 不可用时退化为纯状态
    }
  }, [])

  const backNav = useCallback(() => {
    if (navDepthRef.current > 0) {
      try {
        window.history.back()
      } catch {
        // 忽略
      }
    }
  }, [])

  const fitAll = useCallback(() => {
    setCamera(fitDesignCamera(viewport))
  }, [viewport])
  const resetZoom = useCallback(() => setCamera((c) => ({ ...c, scale: 1 })), [])
  const zoomBy = useCallback(
    (factor: number) => {
      setCamera((c) => zoomAtPointer(c, viewport, { x: viewport.width / 2, y: viewport.height / 2 }, factor))
    },
    [viewport],
  )

  const basePos = useCallback((a: AnchorSpec) => positions[a.dimensionId] ?? { x: a.x, y: a.y }, [positions])
  const anchorPos = useCallback(
    (a: AnchorSpec) => displaced[a.dimensionId] ?? basePos(a),
    [displaced, basePos],
  )

  // ---------- Focus Aperture（§5–§11/§29–§32） ----------
  const closeAperture = useCallback(() => {
    setApertureId(null)
    setDisplaced({})
    setMenuOpen(false)
    setAsk(null)
  }, [])

  const autoArrange = useCallback(() => {
    closeAperture()
    setPositions({})
    setSelection([])
    setFocusSet(false)
    window.requestAnimationFrame(fitAll)
  }, [closeAperture, fitAll])

  /** 世界坐标 ↔ 屏幕坐标（camera 数学） */
  const toScreenRect = useCallback(
    (r: Rect): Rect => ({
      x: (r.x - camera.x) * camera.scale + viewport.width / 2,
      y: (r.y - camera.y) * camera.scale + viewport.height / 2,
      width: r.width * camera.scale,
      height: r.height * camera.scale,
    }),
    [camera, viewport],
  )
  const toWorldPoint = useCallback(
    (p: { x: number; y: number }) => ({
      x: camera.x + (p.x - viewport.width / 2) / camera.scale,
      y: camera.y + (p.y - viewport.height / 2) / camera.scale,
    }),
    [camera, viewport],
  )

  const openAperture = useCallback(
    (a: AnchorSpec) => {
      const zones = fixedExclusionZones(viewport)
      const size = apertureSizeFor(viewport)
      const pos = basePos(a)
      const box = anchorBoxSize(a.label, a.tier)
      const anchorRectScreen = toScreenRect({ x: pos.x, y: pos.y, width: box.width, height: box.height })
      const apertureScreen = apertureRectFor({ anchorRect: anchorRectScreen, size, viewport, fixedExclusionZones: zones })
      const result = resolveApertureCollisions({
        aperture: apertureScreen,
        dimensions: anchors
          .filter((x) => x.dimensionId !== a.dimensionId && !parked.includes(x.dimensionId))
          .map((x) => {
            const p = positions[x.dimensionId] ?? { x: x.x, y: x.y }
            const b = anchorBoxSize(x.label, x.tier)
            return {
              id: x.dimensionId,
              rect: toScreenRect({ x: p.x, y: p.y, width: b.width, height: b.height }),
              manual: positions[x.dimensionId],
            }
          }),
        fixedExclusionZones: zones,
        viewport,
      })
      const displacedWorld: Record<string, { x: number; y: number }> = {}
      for (const [id, pt] of Object.entries(result.displaced)) displacedWorld[id] = toWorldPoint(pt)
      const originWorld = toWorldPoint({ x: apertureScreen.x, y: apertureScreen.y })
      const apertureWorld: Rect = {
        x: originWorld.x,
        y: originWorld.y,
        width: apertureScreen.width / camera.scale,
        height: apertureScreen.height / camera.scale,
      }
      result.displaced = displacedWorld
      const ownClashes = zones.some((z) =>
        rectsIntersect({ x: apertureScreen.x, y: apertureScreen.y, width: apertureScreen.width, height: apertureScreen.height }, z, 0),
      )
      setApertureMetrics({
        rect: apertureWorld,
        displaced: result.displaced,
        collisionsBefore: result.collisionsBefore,
        collisionsAfter: result.collisionsAfter,
        ownClashes,
      })
      setDisplaced(result.displaced)
      setApertureId(a.dimensionId)
      setMenuOpen(false)
      const code = payload?.company.stockCode
      if (code) pushNav({ sl: true, stockCode: code, dim: a.dimensionId, read: false, ev: null })

      setAsk(null)
    },
    [viewport, basePos, anchors, parked, positions, toScreenRect, toWorldPoint, camera.scale, pushNav, payload],
  )

  const fitSelection = useCallback(() => {
    if (selection.length === 0) return
    const pts = selection.map((id) => {
      const a = anchors.find((x) => x.dimensionId === id)
      const p = positions[id] ?? { x: a?.x ?? 0, y: a?.y ?? 0 }
      return { x: p.x, y: p.y, width: 320, height: 200 }
    })
    const bounds = boundsOfObjects(pts)
    if (bounds) setCamera(computeFitCamera(bounds, viewport, 120))
  }, [selection, anchors, positions, viewport])

  // ---- keyboard（§33/§38/§39/§2 Space-pan） ----
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setLensOpen((v) => !v)
      }
      // §A2：单一 Esc 优先级链（Demo → Notes → Palette → Thread → Evidence → Reading → Aperture → Canvas）
      if (e.key === "Escape") {
        if (demoExitRef.current) {
          demoExitRef.current()
          return
        }
        if (notesOpen) { setNotesOpen(false); return }
        if (lensOpen) { setLensOpen(false); return }
        if (aiOpen) {
          setAiOpen(false)
          aiInputRef.current?.blur()
          return
        }
        if (readingEvidenceId) { setReadingEvidenceId(null); backNav(); return }
        if (readingId) { closeReadingRef.current?.(); backNav(); return }
        if (apertureId) { closeAperture(); backNav(); return }
        if (ask || addAngle !== null) {
          setAsk(null)
          setAddAngle(null)
          return
        }
        // 已到 Company Canvas：保持不动
      }
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !readingId && !apertureId) {
        e.preventDefault()
        const list = savedCompanies
        if (list.length < 2) return
        const idx = payload ? list.findIndex((c) => c.stockCode === payload.company.stockCode) : -1
        const next = e.key === "ArrowRight" ? (idx + 1 + list.length) % list.length : (idx - 1 + list.length) % list.length
        void switchCompanyRef.current?.(list[next].stockCode)
        return
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault()
        focusAiLensRef.current?.(null)
      }
      if (e.key === " " && !e.repeat) {
        spaceRef.current = true
        setSpaceDown(true)
      }
      if (e.shiftKey && (e.key === "!" || e.code === "Digit1")) {
        fitAll()
      }
      if (e.shiftKey && (e.key === "@" || e.code === "Digit2")) {
        fitSelection()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceRef.current = false
        setSpaceDown(false)
      }
    }
    window.addEventListener("keydown", onDown)
    window.addEventListener("keyup", onUp)
    return () => {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
    }
    // 事件回调在触发时读取最新 state；此处依赖稳定回调即可
  }, [fitAll, fitSelection, aiOpen, lensOpen, closeAperture, backNav, apertureId, readingId, readingEvidenceId, ask, addAngle, savedCompanies, payload, notesOpen])

  // ---- pointer 仲裁（§17：5px 阈值，click 与 drag 分离） ----
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement
      if (target.closest("[data-ui]")) return
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } catch {
        // 合成事件下可能失败
      }
      const anchorEl = target.closest("[data-anchor-id]") as HTMLElement | null
      if (!anchorEl && !e.shiftKey) {
        // §18：点击空白 → 关闭 Aperture 并恢复被位移对象
        if (apertureId) closeAperture()
      }
      if (anchorEl && !spaceRef.current) {
        const id = anchorEl.getAttribute("data-anchor-id")!
        const a = anchors.find((x) => x.dimensionId === id)
        const pos = positions[id] ?? { x: a?.x ?? 0, y: a?.y ?? 0 }
        const world = screenToWorld(camera, viewport, e.clientX - rect.left, e.clientY - rect.top)
        // §26：拖动选中对象时关闭 Aperture（拖动结束后不自动重开）
        if (apertureId === id) closeAperture()
        dragRef.current = {
          id,
          offsetX: world.x - pos.x,
          offsetY: world.y - pos.y,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
        }
        setGrabbing(true)
        return
      }
      if (e.shiftKey) {
        // §25：多选优先，先关闭 Aperture
        closeAperture()
        const local = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        marqueeRef.current = { x0: local.x, y0: local.y, x1: local.x, y1: local.y }
        setMarquee(marqueeRef.current)
        return
      }
      panRef.current = { lastX: e.clientX, lastY: e.clientY }
      setGrabbing(true)
    },
    [anchors, positions, camera, viewport, apertureId, closeAperture],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const local = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const dd = dragRef.current
      if (dd) {
        if (Math.hypot(e.clientX - dd.startX, e.clientY - dd.startY) > DRAG_THRESHOLD) dd.moved = true
        if (dd.moved) {
          const world = screenToWorld(camera, viewport, local.x, local.y)
          setPositions((p) => ({ ...p, [dd.id]: { x: world.x - dd.offsetX, y: world.y - dd.offsetY } }))
        }
        return
      }
      const nd = noteDragRef.current
      if (nd) {
        const world = screenToWorld(camera, viewport, local.x, local.y)
        setNotes((ns) => ns.map((n) => (n.id === nd.id ? { ...n, x: world.x - nd.offsetX, y: world.y - nd.offsetY } : n)))
        return
      }
      const sg = suggestRef.current
      if (sg) {
        if (!suggestCapturedRef.current) {
          if (Math.hypot(e.clientX - sg.clientX, e.clientY - sg.clientY) <= DRAG_THRESHOLD) return
          try {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            suggestCapturedRef.current = true
          } catch {
            // 合成事件下可能失败
          }
        }
        const over =
          local.x > Math.min(330, viewport.width * 0.3) &&
          local.x < rect.width - 24 &&
          local.y > 76 &&
          local.y < rect.height - 70
        const next = { label: sg.label, x: local.x, y: local.y, over }
        suggestDragRef.current = next
        setSuggestDrag(next)
        return
      }
      if (marqueeRef.current) {
        marqueeRef.current = { ...marqueeRef.current, x1: local.x, y1: local.y }
        setMarquee(marqueeRef.current)
        return
      }
      const pan = panRef.current
      if (!pan) return
      const dx = e.clientX - pan.lastX
      const dy = e.clientY - pan.lastY
      pan.lastX = e.clientX
      pan.lastY = e.clientY
      setCamera((c) => panCamera(c, dx, dy))
    },
    [camera, viewport],
  )

  const onPointerUp = useCallback(() => {
    const dd = dragRef.current
    if (dd) {
      if (!dd.moved) {
        // §17/§18：位移 ≤ 5px = click → 打开 Focus Aperture（关闭旧的、恢复旧位移）
        const target = anchors.find((a) => a.dimensionId === dd.id)
        if (target) {
          if (apertureId === dd.id) closeAperture()
          else openAperture(target)
        }
      }
      dragRef.current = null
    }
    if (suggestRef.current) {
      const sd = suggestDragRef.current
      const label = suggestRef.current.label
      const didDrag = suggestCapturedRef.current
      suggestRef.current = null
      suggestDragRef.current = null
      suggestCapturedRef.current = false
      setSuggestDrag(null)
      if (didDrag) {
        suppressSuggestionClickRef.current = true
        window.setTimeout(() => {
          suppressSuggestionClickRef.current = false
        }, 0)
      }
      if (sd?.over) void addDimensionRef.current?.(label, sd.x, sd.y)
    }
    if (marqueeRef.current) {
      const m = marqueeRef.current
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        const a = screenToWorld(camera, viewport, m.x0, m.y0)
        const b = screenToWorld(camera, viewport, m.x1, m.y1)
        const hits = anchors
          .filter((anc) => {
            const p = positions[anc.dimensionId] ?? { x: anc.x, y: anc.y }
            return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
          })
          .map((x) => x.dimensionId)
        if (hits.length > 0) setSelection((sel) => Array.from(new Set([...sel, ...hits])))
      }
      marqueeRef.current = null
      setMarquee(null)
    }
    panRef.current = null
    noteDragRef.current = null
    setGrabbing(false)
  }, [camera, viewport, anchors, positions, apertureId, openAperture, closeAperture])

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const factor = Math.exp(-e.deltaY * 0.0014)
      setCamera((c) => zoomAtPointer(c, viewport, { x: e.clientX - rect.left, y: e.clientY - rect.top }, factor))
    },
    [viewport],
  )

  // ---- actions ----
  const pinNote = useCallback(
    (a: AnchorSpec) => {
      setNotes((ns) => {
        if (ns.some((n) => n.id === a.dimensionId)) return ns
        const pos = anchorPos(a)
        const summary = payload?.claims.find((c) => c.dimensionId === a.dimensionId && c.type !== "unknown")?.text ?? ""
        return [...ns, { id: a.dimensionId, title: `${a.label}摘要`, summary: summary.slice(0, 64), x: pos.x + 40, y: pos.y + 250 }].slice(0, 3)
      })
    },
    [anchorPos, payload],
  )

  const park = useCallback(
    (dimensionId: string) => {
      setParked((p) => (p.includes(dimensionId) ? p : [...p, dimensionId]))
      closeAperture()
    },
    [closeAperture],
  )

  const commitResearchPayload = useCallback((next: ResearchSpacePayload) => {
    payloadRef.current = next
    payloadCacheRef.current[next.company.stockCode] = next
    saveResearch(next, isRecordedSample)
    setPayload(next)
  }, [isRecordedSample])

  // ---- 证据快刷（阶段 4 / P1-2 路线 A）----
  // 口径：只刷数据层（服务端重算），受影响结论打「证据已更新」标记；
  // 「重新组织该维度」用最新证据重跑该维度合成。失败时 payload 原样保留 = 天然回滚。
  // 2026-10-09 用户拍板两层更新：①每次进入研究空间自动刷（见下方 effect，source="auto"）；
  // ②手动更新常驻顶栏（不只在过期时才出现）。
  const [updatedClaims, setUpdatedClaims] = useState<{ stockCode: string; ids: Set<string> } | null>(null)
  const [evidenceRefreshing, setEvidenceRefreshing] = useState(false)
  const [reorganizingDimId, setReorganizingDimId] = useState<string | null>(null)

  const runEvidenceRefresh = useCallback(async (source: "auto" | "manual" = "manual") => {
    const current = payloadRef.current
    if (!current || evidenceRefreshing) return
    setEvidenceRefreshing(true)
    try {
      const res = await fetch("/api/research/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode: current.company.stockCode }),
      })
      const body = (await res.json()) as Parameters<typeof mergeRefreshedTruth>[1] & { error?: string }
      if (!res.ok) throw new Error(body?.error ?? `刷新服务返回 ${res.status}`)
      const merged = mergeRefreshedTruth(current, body)
      commitResearchPayload(merged.payload)
      setUpdatedClaims({ stockCode: merged.payload.company.stockCode, ids: new Set(merged.updatedClaimIds) })
      const asOf = merged.payload.marketHistory?.latestDate ?? "未知"
      setRefreshNote(
        (source === "auto" ? "已自动更新数据" : "数据已刷新") +
          `（截至 ${asOf}）` +
          (merged.updatedClaimIds.length > 0 ? `；${merged.updatedClaimIds.length} 条结论为更新前生成，可重新组织` : ""),
      )
      window.setTimeout(() => setRefreshNote(null), 6000)
    } catch (err) {
      // 合并失败不写入 state：旧 payload 原样保留（回滚），明确报错不修饰
      setRefreshNote(`刷新失败：${err instanceof Error ? err.message : String(err)}`)
      window.setTimeout(() => setRefreshNote(null), 6000)
    } finally {
      setEvidenceRefreshing(false)
    }
  }, [evidenceRefreshing, commitResearchPayload])

  const runReorganize = useCallback(
    async (dimension: ResearchSpacePayload["dimensions"][number]) => {
      const current = payloadRef.current
      if (!current || reorganizingDimId) return
      setReorganizingDimId(dimension.dimensionId)
      try {
        const res = await fetch("/api/research/reorganize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockCode: current.company.stockCode, dimension }),
        })
        const body = (await res.json()) as { error?: string } & Parameters<typeof applyReorganizedDimension>[1]
        if (!res.ok) throw new Error(body?.error ?? `重新组织服务返回 ${res.status}`)
        const next = applyReorganizedDimension(current, body)
        commitResearchPayload(next)
        // 该维度旧结论已被重写：解除其「更新前生成」标记（新结论基于最新证据，无需标记）
        setUpdatedClaims((prev) =>
          prev && prev.stockCode === next.company.stockCode
            ? { stockCode: prev.stockCode, ids: new Set([...prev.ids].filter((id) => !dimension.claimIds.includes(id))) }
            : prev,
        )
        setRefreshNote(`「${dimension.label}」已按最新证据重新组织`)
        window.setTimeout(() => setRefreshNote(null), 6000)
      } catch (err) {
        setRefreshNote(`重新组织失败：${err instanceof Error ? err.message : String(err)}`)
        window.setTimeout(() => setRefreshNote(null), 6000)
      } finally {
        setReorganizingDimId(null)
      }
    },
    [reorganizingDimId, commitResearchPayload],
  )

  /** §30：Add Dimension —— anchor 出现在操作位置；先 resolving 再由 API 结果定态 */
  const addDimension = useCallback(
    async (label: string, screenX?: number, screenY?: number) => {
      const sx = screenX ?? viewport.width / 2
      const sy = screenY ?? viewport.height / 2
      interactionPerf.markStart("dimension:add", "remote")
      setAdding({ label, x: sx, y: sy })
      window.requestAnimationFrame(() => interactionPerf.markVisual("dimension:add"))
      setAddAngle(null)
      setFailedAngle(null)
      try {
        const res = await fetch("/api/research/dimension", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stockCode: payload?.company.stockCode ?? "000333.SZ",
            dimensionText: label,
            currentDimensions: anchors.map((a) => a.label),
          }),
        })
        const body = (await res.json()) as {
          mode?: string
          dimension?: ResearchSpacePayload["dimensions"][number] | null
          claims?: ResearchSpacePayload["claims"]
          evidence?: ResearchSpacePayload["evidence"]
        }
        if (body.mode === "compliance_redirect" || !body.dimension) {
          // §43：不静默删除用户意图——保留临时锚点并给出重试
          setAdding(null)
          setFailedAngle({ label, x: sx, y: sy })
          return false
        }
        const dim = body.dimension
        const rect = containerRef.current?.getBoundingClientRect()
        const world = rect
          ? screenToWorld(camera, viewport, sx - rect.left, sy - rect.top)
          : { x: DESIGN.width / 2, y: DESIGN.height / 2 }
        const current = payloadRef.current
        if (!current) return false
        const next = {
            ...current,
            dimensions: [...current.dimensions, dim],
            claims: [...current.claims, ...(body.claims ?? [])],
            evidence: [
              ...current.evidence,
              ...(body.evidence ?? []).filter((e) => !current.evidence.some((x) => x.evidenceId === e.evidenceId)),
            ],
          }
        commitResearchPayload(next)
        // 只有真正拖放时才保留手动位置；普通新增直接获得下一个编号与自动位置。
        if (screenX !== undefined && screenY !== undefined) {
          setPositions((p) => ({ ...p, [dim.dimensionId]: { x: world.x, y: world.y } }))
        } else {
          // 点击确认新标签就是一次完整的“加入并整理”：清掉历史手动偏移，
          // 让全部标签立即回到新的连续编号与编辑节奏位，不再要求用户多点一次“恢复自动”。
          setPositions({})
          setSelection([])
          setFocusSet(false)
          window.requestAnimationFrame(fitAll)
        }
        // §6：新维度原地转为 ready/partial/unknown；不自动打开 Aperture（保持标签可见）
        setApertureId(null)
        setDisplaced({})
        setAdding(null)
        setFailedAngle(null)
        return true
      } catch {
        // §43：失败不得静默回退；保留用户输入与位置，允许重试
        setAdding(null)
        setFailedAngle({ label, x: sx, y: sy })
        return false
      }
    },
    [payload, anchors, camera, viewport, fitAll, commitResearchPayload],
  )

  const removeAddedDimension = useCallback(
    (dimensionId: string) => {
      const current = payloadRef.current
      if (!current) return
      const index = current.dimensions.findIndex((dimension) => dimension.dimensionId === dimensionId)
      const dimension = current.dimensions[index]
      if (!dimension || dimension.origin === "ai_initial") return

      const relatedClaims = current.claims.filter((claim) => claim.dimensionId === dimensionId)
      const snapshot: RemovedDimensionSnapshot = {
        stockCode: current.company.stockCode,
        dimension,
        index,
        claims: relatedClaims,
        position: positions[dimensionId],
        wasParked: parked.includes(dimensionId),
        wasSelected: selection.includes(dimensionId),
        notes: notes.filter((note) => note.id === dimensionId),
      }

      if (removedDimensionTimerRef.current !== null) {
        window.clearTimeout(removedDimensionTimerRef.current)
      }
      setRemovedDimension(snapshot)
      removedDimensionTimerRef.current = window.setTimeout(() => {
        setRemovedDimension(null)
        removedDimensionTimerRef.current = null
      }, 7000)

      commitResearchPayload({
        ...current,
        dimensions: current.dimensions.filter((item) => item.dimensionId !== dimensionId),
        claims: current.claims.filter((claim) => claim.dimensionId !== dimensionId),
      })
      setPositions((items) => Object.fromEntries(Object.entries(items).filter(([id]) => id !== dimensionId)))
      setDisplaced((items) => Object.fromEntries(Object.entries(items).filter(([id]) => id !== dimensionId)))
      setParked((items) => items.filter((id) => id !== dimensionId))
      setSelection((items) => items.filter((id) => id !== dimensionId))
      setNotes((items) => items.filter((note) => note.id !== dimensionId))
      setFocusSet(false)
      setAiScopeOverride((scope) => {
        if (!scope) return scope
        if (scope.dimensionId === dimensionId) return null
        if (scope.claimId && relatedClaims.some((claim) => claim.claimId === scope.claimId)) return null
        return scope
      })
      if (apertureId === dimensionId) closeAperture()
      if (readingId === dimensionId) {
        setReadingId(null)
        setReadingEvidenceId(null)
      }
    },
    [apertureId, closeAperture, commitResearchPayload, notes, parked, positions, readingId, selection],
  )

  const undoRemovedDimension = useCallback(() => {
    if (!removedDimension) return
    const snapshot = removedDimension
    if (removedDimensionTimerRef.current !== null) {
      window.clearTimeout(removedDimensionTimerRef.current)
      removedDimensionTimerRef.current = null
    }
    const current = payloadRef.current
    if (current && current.company.stockCode === snapshot.stockCode && !current.dimensions.some((dimension) => dimension.dimensionId === snapshot.dimension.dimensionId)) {
      const dimensions = [...current.dimensions]
      dimensions.splice(Math.min(snapshot.index, dimensions.length), 0, snapshot.dimension)
      const existingClaims = new Set(current.claims.map((claim) => claim.claimId))
      const next = {
        ...current,
        dimensions,
        claims: [...current.claims, ...snapshot.claims.filter((claim) => !existingClaims.has(claim.claimId))],
      }
      commitResearchPayload(next)
    }
    if (snapshot.position) {
      const restoredPosition = snapshot.position
      setPositions((items) => ({ ...items, [snapshot.dimension.dimensionId]: restoredPosition }))
    }
    if (snapshot.wasParked) setParked((items) => [...new Set([...items, snapshot.dimension.dimensionId])])
    if (snapshot.wasSelected) setSelection((items) => [...new Set([...items, snapshot.dimension.dimensionId])])
    if (snapshot.notes.length > 0) {
      setNotes((items) => [
        ...items,
        ...snapshot.notes.filter((note) => !items.some((item) => item.id === note.id)),
      ])
    }
    setRemovedDimension(null)
  }, [commitResearchPayload, removedDimension])

  const runAsk = useCallback(
    async (a: AnchorSpec) => {
      if (!ask || ask.anchorId !== a.dimensionId || ask.question.trim().length === 0) return
      const dim = payload?.dimensions.find((d) => d.dimensionId === a.dimensionId)
      setAsk({ ...ask, status: "loading" })
      try {
        const res = await fetch("/api/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stockCode: payload?.company.stockCode ?? "000333.SZ",
            question: ask.question.trim(),
            evidenceIds: dim?.evidenceIds.slice(0, 4) ?? [],
          }),
        })
        const body = await res.json()
        if (!res.ok) {
          setAsk({ ...ask, status: "failed", message: body?.error ?? `服务返回 ${res.status}` })
          return
        }
        if (body.mode === "compliance_redirect") {
          setAsk({ ...ask, status: "done", summary: body.compliance?.message })
          return
        }
        const s = body.synthesis
        if (!s) {
          setAsk({ ...ask, status: "failed", message: "本次回答未能通过证据校验，请重试。" })
          return
        }
        setAsk({
          ...ask,
          status: "done",
          summary: s?.summary?.text,
          confirmed: (s?.confirmedFacts ?? []).map((x: { text: string }) => x.text),
          inferred: (s?.analysisInferences ?? []).map((x: { text: string }) => x.text),
          unknowns: (s?.unknowns ?? []).map((x: { text: string }) => x.text),
        })
      } catch {
        setAsk({ ...ask, status: "failed", message: "追问服务暂时未响应，已验证证据仍可查看。" })
      }
    },
    [ask, payload],
  )

  const openReading = useCallback(
    (a: AnchorSpec) => {
      const el = document.querySelector(`[data-anchor-id="${a.dimensionId}"] [data-anchor-title]`) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        setFlipFrom({ x: r.x, y: r.y, width: r.width, height: r.height })
      } else setFlipFrom(null)
      const pos = anchorPos(a)
      preReadingCameraRef.current = camera
      setCamera({ x: pos.x, y: pos.y + 80, scale: 0.9 })
      setReadingId(a.dimensionId)
      setDisplaced({})
      setApertureId(null)
      setAsk(null)
      const code = payload?.company.stockCode
      if (code) pushNav({ sl: true, stockCode: code, dim: a.dimensionId, read: true, ev: null })
    },
    [anchorPos, pushNav, camera, payload],
  )

  // ---------- §7/§8：scope 自动推导 + 唯一 handleAskAI ----------
  const aiScope: AiScope = useMemo(() => {
    if (aiScopeOverride) return aiScopeOverride
    if (readingEvidenceId) return { type: "evidence", evidenceId: readingEvidenceId }
    if (readingId) return { type: "dimension", dimensionId: readingId }
    if (apertureId) return { type: "dimension", dimensionId: apertureId }
    return { type: "company" }
  }, [aiScopeOverride, readingEvidenceId, readingId, apertureId])

  const scopeEvidenceIds = useCallback(
    (scope: AiScope): string[] => {
      if (!payload) return []
      if (scope.type === "evidence" && scope.evidenceId) return [scope.evidenceId]
      if (scope.type === "claim" && scope.claimId) {
        return payload.claims.find((c) => c.claimId === scope.claimId)?.evidenceIds ?? []
      }
      if (scope.type === "dimension" && scope.dimensionId) {
        return payload.dimensions.find((d) => d.dimensionId === scope.dimensionId)?.evidenceIds.slice(0, 6) ?? []
      }
      return payload.evidence.slice(0, 6).map((e) => e.evidenceId)
    },
    [payload],
  )

  const scopeLabel = useCallback(
    (scope: AiScope): string => {
      if (!payload) return ""
      const company = payload.company.stockName
      if (scope.type === "evidence" && scope.evidenceId) {
        const dim = payload.evidence.find((e) => e.evidenceId === scope.evidenceId)?.dimension
        return `${dim ? dim + " / " : ""}Evidence`
      }
      if (scope.type === "claim" && scope.claimId) {
        const claim = payload.claims.find((c) => c.claimId === scope.claimId)
        const label = claim ? payload.dimensions.find((d) => d.dimensionId === claim.dimensionId)?.label ?? "" : ""
        return `${label} / Claim`
      }
      if (scope.type === "dimension" && scope.dimensionId) {
        return `${company} / ${payload.dimensions.find((d) => d.dimensionId === scope.dimensionId)?.label ?? ""}`
      }
      return company
    },
    [payload],
  )

  const scopePlaceholder = useCallback((): string => {
    if (!payload) return "问 StockLens…"
    if (aiScope.type === "evidence") return "询问这条证据…"
    if (aiScope.type === "claim") return "追问这条结论…"
    if (aiScope.type === "dimension") {
      const label = payload.dimensions.find((d) => d.dimensionId === aiScope.dimensionId)?.label ?? ""
      return `追问「${label}」…`
    }
    return `问 StockLens 关于${payload.company.stockName}的问题…`
  }, [payload, aiScope])

  /** §8：唯一 AI handler。§9：直接复用 POST /api/followup（无 /api/v5、无 mock） */
  const handleAskAI = useCallback(
    async (question: string, scope: AiScope) => {
      const q = question.trim()
      if (!payload || q.length === 0) return
      const stockCode = payload.company.stockCode
      const evidenceIds = scopeEvidenceIds(scope)
      // §25：单活跃任务——运行中不允许再发问
      if (aiAbortRef.current) {
        setAiNotice("Stop the current response before asking another question.")
        return
      }
      const entry: AiEntry = {
        id: `ai-${Date.now()}`,
        question: q,
        frozenQuestion: q,
        stockName: payload.company.stockName,
        scopeType: scope.type,
        scopeLabel: scopeLabel(scope),
        ...(scope.dimensionId ? { dimensionId: scope.dimensionId } : {}),
        ...(scope.claimId ? { claimId: scope.claimId } : {}),
        evidenceIds,
        status: "running",
        createdAt: new Date().toISOString(),
      }
      interactionPerf.markStart("ai:send", "remote")
      setAiThreads((t) => ({ ...t, [stockCode]: [...(t[stockCode] ?? []), entry] }))
      // 运行中条目已同步写入线程 → 下一帧即视为"用户问题可见"
      window.requestAnimationFrame(() => interactionPerf.markVisual("ai:send"))
      setAiInput("")
      setAiNotice(null)
      setAiStatus("loading")
      setAiOpen(true)
      setHasNewResponse(false)
      const controller = new AbortController()
      aiAbortRef.current = controller
      aiRunningStockRef.current = stockCode
      try {
        const res = await fetch("/api/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockCode, question: q, evidenceIds }),
          signal: controller.signal,
        })
        const body = await res.json()
        const patch = (updates: Partial<AiEntry>) =>
          setAiThreads((t) => ({
            ...t,
            [stockCode]: (t[stockCode] ?? []).map((x) => (x.id === entry.id ? { ...x, ...updates } : x)),
          }))
        if (!res.ok) {
          patch({ status: "failed", message: body?.error ?? `服务返回 ${res.status}` })
          return
        }
        if (body.mode === "compliance_redirect") {
          patch({ status: "completed", summary: body.compliance?.message ?? "不提供买卖建议。", generatedAt: new Date().toISOString() })
          return
        }
        const syn = body.synthesis
        if (!syn) {
          // 两轮修复都被证据校验拒绝：以 failed 呈现（保留 Retry/Edit），绝不做空的 completed
          patch({ status: "failed" })
          return
        }
        patch({
          status: "completed",
          generatedAt: new Date().toISOString(),
          summary: syn?.summary?.text,
          confirmed: (syn?.confirmedFacts ?? []).map((x: { text: string; evidenceIds?: string[] }) => x.text),
          inferred: (syn?.analysisInferences ?? []).map((x: { text: string }) => x.text),
          unknowns: (syn?.unknowns ?? []).map((x: { text: string }) => x.text),
        })
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError"
        setAiThreads((t) => ({
          ...t,
          [stockCode]: (t[stockCode] ?? []).map((x) =>
            x.id === entry.id
              ? aborted
                ? { ...x, status: "stopped", message: "已停止" }
                : { ...x, status: "failed", message: "AI interpretation is temporarily unavailable." }
              : x,
          ),
        }))
      } finally {
        aiAbortRef.current = null
        aiRunningStockRef.current = null
        setAiStatus("idle")
      }
    },
    [payload, scopeEvidenceIds, scopeLabel],
  )

  /** §11–§13：Stop = abort 客户端等待；不声称服务端模型已终止 */
  /** §D40：Clear thread——只清当前公司线程，且需二次确认 */
  const clearThread = useCallback(() => {
    const code = payloadRef.current?.company.stockCode
    if (!code) return
    setAiThreads((prev) => ({ ...prev, [code]: [] }))
    try {
      sessionStorage.setItem(`stocklens.thread.${code}`, "[]")
    } catch {
      // 忽略
    }
    setClearConfirm(false)
    setThreadMenuOpen(false)
  }, [])

  const collapseThread = useCallback(() => {
    setAiOpen(false)
    setThreadMenuOpen(false)
    aiInputRef.current?.blur()
  }, [])

  const stopAi = useCallback(() => {
    const c = aiAbortRef.current
    if (!c) return
    c.abort()
  }, [])

  /** §17：Retry 使用冻结的问题与证据上下文（不改为当前 scope） */
  const retryTurn = useCallback(
    (entry: AiEntry) => {
      const scope: AiScope =
        entry.scopeType === "dimension"
          ? { type: "dimension", dimensionId: entry.dimensionId }
          : entry.scopeType === "claim"
            ? { type: "claim", claimId: entry.claimId }
            : entry.scopeType === "evidence"
              ? { type: "evidence", evidenceId: entry.evidenceIds[0] }
              : { type: "company" }
      void askRef.current?.(entry.frozenQuestion, scope)
    },
    [],
  )

  /** §15：修改问题 = 把原问题放回输入框，并恢复其 scope */
  const editTurn = useCallback(
    (entry: AiEntry) => {
      const scope: AiScope =
        entry.scopeType === "dimension"
          ? { type: "dimension", dimensionId: entry.dimensionId }
          : entry.scopeType === "claim"
            ? { type: "claim", claimId: entry.claimId }
            : entry.scopeType === "evidence"
              ? { type: "evidence", evidenceId: entry.evidenceIds[0] }
              : { type: "company" }
      focusAiLensRef.current?.(scope, entry.frozenQuestion)
    },
    [],
  )

  /** §23–§25：所有 Ask 入口只改变 scope 并聚焦同一个 Lens */
  const focusAiLens = useCallback((scope: AiScope | null, preset?: string) => {
    setAiScopeOverride(scope)
    setAiOpen(true)
    if (preset !== undefined) setAiInput(preset)
    window.setTimeout(() => aiInputRef.current?.focus(), 60)
  }, [])

  useEffect(() => {
    focusAiLensRef.current = focusAiLens
    askRef.current = handleAskAI
    payloadRef.current = payload
  }, [focusAiLens, handleAskAI, payload])

  // ---- 进入即更新（2026-10-09 用户拍板）：每次进入研究空间，后台自动刷数据层 ----
  // 顺序纪律：本 effect 必须排在上面 payloadRef 同步 effect 之后（runEvidenceRefresh 读的是 ref）。
  // 首屏不受影响：先渲染存档/fixture 载荷，刷新在后台跑，完成后原地合并 + 顶部出提示。
  // 两个例外：
  // - 录制示例：它是演示 fixture（带「录制示例」标记），自动刷会把真实行情合并进演示载荷，
  //   破坏秒开与确定性——示例画布保持 fixture 原样，要看实时走 live=1。
  // - 本次进入就是 live 链路（?live=1）：数据是刚拉的，再刷一次纯属浪费，直接标记已刷。
  useEffect(() => {
    if (!payload || isRecordedSample) return
    const code = payload.company.stockCode
    if (autoRefreshedCodesRef.current.has(code)) return
    autoRefreshedCodesRef.current.add(code)
    void runEvidenceRefresh("auto")
  }, [payload, isRecordedSample, runEvidenceRefresh])

  const externalJob = useMemo(() => {
    const code = payload?.company.stockCode
    if (!code) return null
    const rows = Object.entries(aiThreads).filter(
      ([c, turns]) =>
        c !== code &&
        turns.some((t) => t.status === "running" || (t.status === "completed" && !threadReady[c])),
    )
    return rows.length > 0 ? rows : null
  }, [aiThreads, payload, threadReady])

  const closeReading = useCallback(() => {
    setReadingId(null)
    setReadingEvidenceId(null)
    // §A5：返回 Company Canvas 时恢复进入 Reading 之前的空间状态
    const prev = preReadingCameraRef.current
    setCamera(prev ?? { x: DESIGN.width / 2, y: DESIGN.height / 2, scale: 1 })
  }, [])

  useEffect(() => {
    closeReadingRef.current = closeReading
  }, [closeReading])

  const searchCompany = useCallback(async (q: string) => {
    setCompanyQuery(q)
    if (q.trim().length === 0) {
      setCompanyResults([])
      setCompanySearched("")
      return
    }
    const results = await searchCompanies(q)
    setCompanyResults(results)
    setCompanySearched(q.trim())
  }, [])

  /** §B14/§A5：把当前画布现场写进该公司快照（内存 + sessionStorage） */
  const snapshotCurrent = useCallback(() => {
    const code = payloadRef.current?.company.stockCode
    if (!code) return
    const snap: CanvasSnapshot = {
      camera,
      positions,
      parked,
      notes: notes as CanvasSnapshot["notes"],
      selection,
      lastDimensionId: readingId ?? apertureId,
      updatedAt: Date.now(),
    }
    canvasCacheRef.current[code] = snap
    saveCanvas(code, snap)
    setResearchTimes((m) => ({ ...m, [code]: snap.updatedAt }))
  }, [camera, positions, parked, notes, selection, readingId, apertureId])

  // 刷新/关闭页面前立即保存一次，避免 900ms 节流窗口内的最后操作丢失。
  useEffect(() => {
    const saveBeforeLeave = () => snapshotCurrent()
    window.addEventListener("pagehide", saveBeforeLeave)
    return () => window.removeEventListener("pagehide", saveBeforeLeave)
  }, [snapshotCurrent])

  /** 把某公司的会话恢复到画布（缓存路径与未缓存路径共用） */
  const applySession = useCallback(
    (
      data: ResearchSpacePayload,
      stockCode: string,
      snap: CanvasSnapshot | null,
      opts?: { fetchedAt?: number },
    ) => {
      restoredCompaniesRef.current.add(stockCode)
      payloadCacheRef.current[stockCode] = data
      if (opts?.fetchedAt) payloadCachedAtRef.current[stockCode] = opts.fetchedAt
      setIsRecordedSample(recordedSampleCodesRef.current.has(stockCode))
      setPayload(data)
      const safeSnapshot = snap
        ? reconcileCanvasSnapshot(snap, data.dimensions.map((dimension) => dimension.dimensionId))
        : null
      if (safeSnapshot) {
        canvasCacheRef.current[stockCode] = safeSnapshot
        // Sidekick 会改变画布可用宽度。恢复研究内容和手动位置，但按当前分栏重新适配视角，
        // 避免旧宽度保存的相机把所有标签恢复到屏幕外。
        const rect = rootRef.current?.getBoundingClientRect()
        setCamera(
          workspaceLab
            ? fitDesignCamera({
                width: Math.max(1, Math.round(rect?.width ?? viewport.width)),
                height: Math.max(1, Math.round(rect?.height ?? viewport.height)),
              })
            : safeSnapshot.camera,
        )
        setPositions(safeSnapshot.positions)
        setParked(safeSnapshot.parked)
        setNotes(safeSnapshot.notes as PinnedNote[])
        setSelection(safeSnapshot.selection)
        setLastResearchAt(safeSnapshot.updatedAt)
        setResearchTimes((m) => ({ ...m, [stockCode]: safeSnapshot.updatedAt }))
        if (safeSnapshot.lastDimensionId) {
          pendingRestoreRef.current = { code: stockCode, dimensionId: safeSnapshot.lastDimensionId }
        }
      } else {
        delete canvasCacheRef.current[stockCode]
        setCamera({ x: DESIGN.width / 2, y: DESIGN.height / 2, scale: 1 })
        setPositions({})
        setParked([])
        setNotes([])
        setSelection([])
        setLastResearchAt(null)
      }
      setApertureId(null)
      setDisplaced({})
      setReadingId(null)
      setReadingEvidenceId(null)
      if (isSaved(savedCompanies, stockCode)) {
        const nextSaved = touchSaved(savedCompanies, stockCode)
        setSavedCompanies(nextSaved)
        saveSaved(nextSaved)
      }
      // §14：占位 → 真实锚点，逐个显现（60–100ms 间隔，总计 ≤700ms）
      setRevealCount(0)
      for (let i = 0; i < 9; i++) {
        window.setTimeout(() => setRevealCount(i + 1), i * 80)
      }
      pushNav({ sl: true, stockCode, dim: null, read: false, ev: null })
    },
    [pushNav, savedCompanies, viewport.height, viewport.width, workspaceLab],
  )

  const recordVisit = useCallback((data: ResearchSpacePayload) => {
    const now = Date.now()
    const entry = {
      stockCode: data.company.stockCode,
      name: data.company.stockName,
      industry: data.company.industryName ?? undefined,
      dimensionCount: data.dimensions.length,
      evidenceCount: data.evidence.length,
      aiStatus: data.ai.status,
      lastResearchAt: now,
    }
    setRecentCompanies((previous) => {
      const next = pushRecent(previous, entry, now)
      saveRecent(next)
      return next
    })
    setLibraryCompanies((previous) => {
      const next = upsertLibrary(previous, entry, now)
      saveLibrary(next)
      return next
    })
    setResearchTimes((times) => ({ ...times, [data.company.stockCode]: now }))
  }, [])

  /** §13：取消解析中的切换——旧 Canvas 一直在屏上，因此只需移除过渡层 */
  const cancelSwitch = useCallback(() => {
    switchSeqRef.current += 1
    switchAbortRef.current?.abort()
    setPendingCompany(null)
    setSwitchPhase("idle")
    setSwitchError(null)
    setResolvingName(null)
    setRevealCount(99)
    setSwitchMorph(false)
    setSwitchStartedAt(null)
    // §16：只说事实——不声称服务端 AI 计算已取消
    setCancelNotice("已取消等待")
    window.setTimeout(() => setCancelNotice(null), 1800)
  }, [])

  const switchCompany = useCallback(
    async (stockCode: string, meta?: { name?: string; industry?: string }, opts?: { mode?: "refresh"; force?: boolean }) => {
      const currentCode = payloadRef.current?.company.stockCode
      if (currentCode === stockCode && !opts?.force) {
        switchSeqRef.current += 1
        switchAbortRef.current?.abort()
        setPendingCompany(null)
        setSwitchPhase("idle")
        setResolvingName(null)
        setCompanyQuery(null)
        return
      }
      snapshotCurrent()
      const known = [...savedCompanies, ...recentCompanies].find((c) => c.stockCode === stockCode)
      const target = {
        stockCode,
        name: meta?.name ?? known?.name ?? stockCode,
        industry: meta?.industry ?? known?.industry,
      }
      setCompanyQuery(null)
      setCompanyResults([])

      // ---- §6/§20 CACHED PATH：有会话就不调用 /api/research/init，也不开全屏 ----
      const cachedAt = payloadCachedAtRef.current[stockCode]
      const cacheFresh = typeof cachedAt === "number" && Date.now() - cachedAt <= RESEARCH_CACHE_TTL_MS
      const cached = opts?.force || !cacheFresh ? undefined : payloadCacheRef.current[stockCode]
      if (!cacheFresh) {
        delete payloadCacheRef.current[stockCode]
        delete payloadCachedAtRef.current[stockCode]
      }
      if (cached) {
        const seq = ++switchSeqRef.current
        interactionPerf.markStart(`company:cache:${stockCode}`, "local")
        applySession(cached, stockCode, canvasCacheRef.current[stockCode] ?? (await loadCanvas(stockCode)))
        recordVisit(cached)
        if (seq !== switchSeqRef.current) return
        interactionPerf.markVisual(`company:cache:${stockCode}`)
        return
      }

      // ---- §7–§13 UNCACHED PATH：立即过渡，不让界面看起来卡住 ----
      const seq = ++switchSeqRef.current
      interactionPerf.markStart(`company:init:${stockCode}`, "remote")
      setLastCompanyName(payloadRef.current?.company.stockName ?? null)
      setSwitchMode(opts?.mode ?? "company")
      setSwitchStartedAt(Date.now())
      setElapsedSec(0)
      setCancelNotice(null)
      setPendingCompany(target)
      setSwitchPhase("resolving")
      setSwitchError(null)
      setResolvingName(target.name)
      setRevealCount(0)
      // 本轮 setState 后即进入"正在构建研究空间"的中间态（下一帧可见）
      window.requestAnimationFrame(() => interactionPerf.markVisual(`company:init:${stockCode}`))
      const controller = new AbortController()
      switchAbortRef.current = controller
      try {
        const existing = opts?.force ? undefined : inFlightInitRef.current[stockCode]
        const inflight =
          existing ??
          // P2-3：切换公司同样走流式端点（此处 UI 是 CompanyTransition，不渲染阶段帧，仅取结果）
          streamInitResearchSpace({ body: { stockCode }, signal: controller.signal })
            .catch(() => null)
            .finally(() => {
              delete inFlightInitRef.current[stockCode]
            })
        if (!opts?.force) inFlightInitRef.current[stockCode] = inflight
        const data = await inflight
        if (!data) throw new Error("init failed")
        if (seq !== switchSeqRef.current) return // §15：过期响应不得覆盖更新的目标
        recordedSampleCodesRef.current.delete(stockCode)
        applySession(
          data,
          stockCode,
          canvasCacheRef.current[stockCode] ?? (await loadCanvas(stockCode)),
          { fetchedAt: Date.now() },
        )
        recordVisit(data)
        // §17/§18：不硬切——身份保持位置连续，占位逐个被真实维度取代后再退出
        setSwitchMorph(true)
        window.setTimeout(() => {
          setSwitchMorph(false)
          setPendingCompany(null)
          setSwitchPhase("idle")
          setSwitchError(null)
        }, 900)
      } catch (e) {
        if (seq !== switchSeqRef.current) return
        if ((e as Error)?.name === "AbortError") return
        // §42：失败不静默回退，保留目标身份 + 明确失败文案
        setSwitchPhase("failed")
        setSwitchError("研究空间暂时无法完成")
      } finally {
        if (seq === switchSeqRef.current) setResolvingName(null)
      }
    },
    [applySession, recordVisit, savedCompanies, recentCompanies, snapshotCurrent],
  )

  useEffect(() => {
    switchCompanyRef.current = switchCompany
  }, [switchCompany])

  // 对账：payload 变化后，仍指向不存在维度的 reading/evidence 必须清掉（否则头部被空的 Reading 占住）
  useEffect(() => {
    if (!payload) return
    const dims = payload.dimensions.map((d) => d.dimensionId)
    if (readingId && !dims.includes(readingId)) {
      const raf = window.requestAnimationFrame(() => {
        setReadingId(null)
        setReadingEvidenceId(null)
      })
      return () => window.cancelAnimationFrame(raf)
    }
    return undefined
  }, [payload, readingId])

  // §B15/§A5：恢复该公司最后的研究焦点（等 anchors 就绪，只执行一次）
  useEffect(() => {
    const pending = pendingRestoreRef.current
    if (!pending || !payload || payload.company.stockCode !== pending.code) return
    const anchor = anchors.find((a) => a.dimensionId === pending.dimensionId)
    if (!anchor) return
    pendingRestoreRef.current = null
    const raf = window.requestAnimationFrame(() => openAperture(anchor))
    return () => window.cancelAnimationFrame(raf)
  }, [payload, anchors, openAperture])

  // §9：真实 elapsed（来自 requestStart，不是预测）
  useEffect(() => {
    if (switchPhase !== "resolving" || switchStartedAt === null) return
    const id = window.setInterval(() => setElapsedSec(Math.floor((Date.now() - switchStartedAt) / 1000)), 1000)
    return () => window.clearInterval(id)
  }, [switchPhase, switchStartedAt])

  // §3：?perfDebug=1 才启用的交互计时（自动标记 pointer → 首个视觉更新）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      if (!perfDebugEnabled()) return
      setPerfOn(true)
      setPerfRows(interactionPerf.all())
      const el = rootRef.current
      const off = el ? instrumentPointer(el) : undefined
      const unsub = interactionPerf.subscribe(() => setPerfRows(interactionPerf.all()))
      cleanupRef.current = () => {
        off?.()
        unsub()
      }
    })()
    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [])

  // §C20/§C34：首次访问提示 + prefers-reduced-motion
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
      setReducedMotion(mq.matches)
      reducedMotionRef.current = mq.matches
      const onChange = (e: MediaQueryListEvent) => {
        setReducedMotion(e.matches)
        reducedMotionRef.current = e.matches
      }
      mq.addEventListener?.("change", onChange)
      setDemoPrompt(!(await demoSeen()) && !(await demoCompleted()))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // §B8/§B9：研究架数据（localStorage）+ 各公司最近一次研究时间
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      await ensureShelfMigrated()
      if (cancelled) return
      const saved = await loadSaved()
      const recent = await loadRecent()
      const library = mergeLibraryCompanies(await loadLibrary(), saved, recent)
      setSavedCompanies(saved)
      setRecentCompanies(recent)
      setLibraryCompanies(library)
      await saveLibrary(library)
      const times: Record<string, number> = {}
      for (const c of library) {
        if (times[c.stockCode]) continue
        const snap = canvasCacheRef.current[c.stockCode] ?? (await loadCanvas(c.stockCode))
        if (snap) times[c.stockCode] = snap.updatedAt
        else if (c.lastResearchAt) times[c.stockCode] = c.lastResearchAt
      }
      setResearchTimes(times)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 首屏载荷就绪后恢复刷新前的画布。先对账维度 ID，旧维度引用不会进入新研究空间。
  useEffect(() => {
    if (!payload) return
    const stockCode = payload.company.stockCode
    if (restoredCompaniesRef.current.has(stockCode)) return
    restoredCompaniesRef.current.add(stockCode)

    let raf: number | null = null
    let cancelled = false
    void (async () => {
      const stored = await loadCanvas(stockCode)
      if (cancelled || !stored) return
      const snapshot = reconcileCanvasSnapshot(
        stored,
        payload.dimensions.map((dimension) => dimension.dimensionId),
      )
      canvasCacheRef.current[stockCode] = snapshot
      raf = window.requestAnimationFrame(() => {
        const rect = rootRef.current?.getBoundingClientRect()
        setCamera(
          workspaceLab
            ? fitDesignCamera({
                width: Math.max(1, Math.round(rect?.width ?? window.innerWidth)),
                height: Math.max(1, Math.round(rect?.height ?? window.innerHeight)),
              })
            : snapshot.camera,
        )
        setPositions(snapshot.positions)
        setParked(snapshot.parked)
        setNotes(snapshot.notes as PinnedNote[])
        setSelection(snapshot.selection)
        setLastResearchAt(snapshot.updatedAt)
        setResearchTimes((times) => ({ ...times, [stockCode]: snapshot.updatedAt }))
        if (snapshot.lastDimensionId) {
          pendingRestoreRef.current = {
            code: stockCode,
            dimensionId: snapshot.lastDimensionId,
          }
        }
      })
    })()
    return () => {
      cancelled = true
      if (raf !== null) window.cancelAnimationFrame(raf)
    }
  }, [payload, workspaceLab])

  // §A4：基准 history entry（replaceState，保证 Back 不会离开 StockLens）
  useEffect(() => {
    if (navBaseSetRef.current || !payload) return
    navBaseSetRef.current = true
    try {
      window.history.replaceState(
        { sl: true, stockCode: payload.company.stockCode, dim: null, read: false, ev: null } as NavState,
        "",
        window.location.href,
      )
      navDepthRef.current = 0
    } catch {
      // 忽略
    }
    // §6：首次载入的公司也进入会话缓存（切走再切回即走缓存路径，不再请求 init）
    payloadCacheRef.current[payload.company.stockCode] = payload
    payloadCachedAtRef.current[payload.company.stockCode] ??= Date.now()
    const raf = window.requestAnimationFrame(() => {
      // 首次载入同样写入 RECENT 与持久研究库；公司切换路径会复用同一记录函数。
      recordVisit(payload)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [payload, recordVisit])

  useEffect(() => {
    if (!payload) return
    let cancelled = false
    void (async () => {
      await saveResearch(payload, isRecordedSample)
      if (cancelled) return
      const previous = await loadLibrary()
      await saveLibrary(
        upsertLibrary(previous, {
          stockCode: payload.company.stockCode,
          name: payload.company.stockName,
          industry: payload.company.industryName ?? undefined,
          dimensionCount: payload.dimensions.length,
          evidenceCount: payload.evidence.length,
          aiStatus: payload.ai.status,
          lastResearchAt: previous.find((company) => company.stockCode === payload.company.stockCode)?.lastResearchAt,
        }),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [payload, isRecordedSample])

  // §A4：浏览器 Back/Forward → 语义后退
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as NavState | null
      if (!st || st.sl !== true) return
      navDepthRef.current = Math.max(0, navDepthRef.current - 1)
      navApplyingRef.current = true
      const apply = (state: NavState) => {
        // 只恢复仍然存在的维度：否则会把用户带进一个已经没有内容的面板
        const dims = payloadRef.current?.dimensions.map((d) => d.dimensionId) ?? []
        const valid = Boolean(state.dim) && dims.includes(state.dim as string)
        setReadingEvidenceId(valid ? (state.ev ?? null) : null)
        setReadingId(valid && state.read ? state.dim : null)
        setApertureId(valid && !state.read ? state.dim : null)
        setDisplaced({})
        setMenuOpen(false)
      }
      const code = payloadRef.current?.company.stockCode
      if (st.stockCode && st.stockCode !== code && switchCompanyRef.current) {
        void switchCompanyRef.current(st.stockCode).then(() => apply(st))
      } else {
        apply(st)
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // §B14：现场快照（节流写 sessionStorage；只存产品状态）
  useEffect(() => {
    if (!payload) return
    const id = window.setTimeout(() => {
      const code = payload.company.stockCode
      const snap: CanvasSnapshot = {
        camera,
        positions,
        parked,
        notes: notes as CanvasSnapshot["notes"],
        selection,
        lastDimensionId: readingId ?? apertureId,
        updatedAt: Date.now(),
      }
      canvasCacheRef.current[code] = snap
      saveCanvas(code, snap)
    }, 900)
    return () => window.clearTimeout(id)
  }, [payload, camera, positions, parked, notes, selection, readingId, apertureId])

  // ---- lens（§34 context-sensitive） ----
  const lensItems = useMemo(() => {
    const out: { label: string; run: () => void }[] = []
    if (selection.length > 0) {
      out.push(
        { label: `Focus selected (${selection.length})`, run: () => { closeAperture(); setFocusSet(true) } },
        {
          label: "Gather",
          run: () => {
            closeAperture()
            setPositions((p) => {
              const targets = gatherTargets(selection)
              return { ...p, ...(targets as Record<string, { x: number; y: number }>) }
            })
          },
        },
        {
          label: "Spread",
          run: () => {
            closeAperture()
            setPositions((p) => {
              const next = { ...p }
              selection.forEach((id) => delete next[id])
              return next
            })
          },
        },
        { label: "Clear selection", run: () => { setSelection([]); setFocusSet(false) } },
      )
    } else if (active) {
      out.push(
        // 仅在用户点击该菜单项时执行（ref 写入发生在事件回调内，非渲染期；编译器保守报错）
        // eslint-disable-next-line react-hooks/refs
        { label: `Explore · ${active.label}`, run: () => openReading(active) },
        { label: "Ask", run: () => setAsk({ anchorId: active.dimensionId, question: "", status: "idle" }) },
        { label: "Pin", run: () => pinNote(active) },
        { label: "Park", run: () => park(active.dimensionId) },
      )
    } else {
      out.push(
        { label: "Ask company", run: () => setAsk({ anchorId: focalId ?? "", question: "", status: "idle" }) },
        { label: "Fit view", run: fitAll },
      )
    }
    out.push({ label: "Add research angle", run: () => setAddAngle("") })
    if (parked.length > 0) out.push({ label: `Restore all parked (${parked.length})`, run: () => setParked([]) })
    out.push({ label: "Change company", run: () => setCompanyQuery("") })
    return out
  }, [selection, active, focalId, parked, fitAll, openReading, pinNote, park, closeAperture])

  useEffect(() => {
    addDimensionRef.current = addDimension
  }, [addDimension])

  // §8：贴底才自动跟随；上翻时只标记有未读
  useEffect(() => {
    const el = aiThreadRef.current
    if (!el || !aiOpen) return
    const raf = window.requestAnimationFrame(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight
      else setHasNewResponse(true)
    })
    return () => window.cancelAnimationFrame(raf)
  }, [aiThreads, aiOpen])

  // ---- §C：Guided Demo V2（6 场景；同一时刻一个焦点事件；不等待后端） ----
  const demoSnapshotRef = useRef<{
    camera: CameraState
    positions: Record<string, { x: number; y: number }>
    selection: string[]
    parked: string[]
    notes: PinnedNote[]
    apertureId: string | null
    readingId: string | null
    readingEvidenceId: string | null
    hoverId: string | null
    aiOpen: boolean
    aiInput: string
    addAngle: string | null
    companyQuery: string | null
    lensOpen: boolean
  } | null>(null)
  const demoTimersRef = useRef<number[]>([])
  const demoTypeTimerRef = useRef<number | null>(null)

  const enterSceneRef = useRef<((index: number) => void) | null>(null)

  const clearDemoTimers = useCallback(() => {
    demoTimersRef.current.forEach((id) => window.clearTimeout(id))
    demoTimersRef.current = []
    if (demoTypeTimerRef.current !== null) {
      window.clearInterval(demoTypeTimerRef.current)
      demoTypeTimerRef.current = null
    }
  }, [])

  const demoPrimary = useCallback((): AnchorSpec | null => {
    const list = anchors.filter((a) => !parked.includes(a.dimensionId))
    return list.find((a) => a.tier === "primary") ?? list[0] ?? null
  }, [anchors, parked])

  /** 演示只调度既有 UI action；不从网络取任何数据 */
  const applyDemoAction = useCallback(
    (kind: DemoActionKind) => {
      const primary = demoPrimary()
      if (kind === "pan") {
        if (!reducedMotionRef.current) setCamera((c) => ({ ...c, x: c.x + 46, y: c.y + 10 }))
        return
      }
      if (kind === "hover-dimension" && primary) {
        setHoverId(primary.dimensionId)
        return
      }
      if (kind === "open-aperture" && primary) {
        setHoverId(null)
        openAperture(primary)
        return
      }
      if (kind === "open-reading" && primary) {
        openReading(primary)
        return
      }
      if (kind === "select-evidence" && primary) {
        const first = payloadRef.current?.dimensions.find((d) => d.dimensionId === primary.dimensionId)?.evidenceIds[0]
        if (first) setReadingEvidenceId(first)
        return
      }
      if (kind === "focus-ai-typing") {
        setAiOpen(true)
        focusAiLensRef.current?.(null)
        // 演示打字：只改 composer 文本，绝不提交
        let i = 0
        if (demoTypeTimerRef.current !== null) window.clearInterval(demoTypeTimerRef.current)
        demoTypeTimerRef.current = window.setInterval(() => {
          i += 1
          setAiInput(DEMO_TYPED_QUESTION.slice(0, i))
          if (i >= DEMO_TYPED_QUESTION.length) {
            if (demoTypeTimerRef.current !== null) window.clearInterval(demoTypeTimerRef.current)
            demoTypeTimerRef.current = null
          }
        }, 90)
        return
      }
      if (kind === "clear-ai-input") {
        setAiInput("")
        return
      }
      if (kind === "close-ai") {
        setAiOpen(false)
        return
      }
      if (kind === "close-add-angle") {
        setAddAngle(null)
        return
      }
      if (kind === "open-add-dimension") {
        setAddAngle(DEMO_ANGLE_PLACEHOLDER)
        return
      }
      if (kind === "close-reading") {
        closeReadingRef.current?.()
        return
      }
      if (kind === "open-shelf") {
        setCompanyQuery("")
        return
      }
    },
    [demoPrimary, openAperture, openReading],
  )

  const enterScene = useCallback(
    (index: number) => {
      const scene = sceneAt(index)
      const first = scene.captions[0]
      if (first) setDemoCaption({ title: first.title, text: first.text })
      clearDemoTimers()
      scene.actions.forEach((a) => {
        demoTimersRef.current.push(window.setTimeout(() => applyDemoAction(a.kind), a.atMs))
      })
      scene.captions.forEach((c) => {
        demoTimersRef.current.push(window.setTimeout(() => setDemoCaption({ title: c.title, text: c.text }), c.atMs))
      })
      demoTimersRef.current.push(
        window.setTimeout(() => {
          if (isLastScene(index)) setDemoFinal(true)
          else setDemoIndex(index + 1)
        }, scene.ms),
      )
    },
    [applyDemoAction, clearDemoTimers],
  )

  const demoStart = useCallback(() => {
    if (demoIndex !== null) return
    demoSnapshotRef.current = {
      camera,
      positions,
      selection,
      parked,
      notes,
      apertureId,
      readingId,
      readingEvidenceId,
      hoverId,
      aiOpen,
      aiInput,
      addAngle,
      companyQuery,
      lensOpen,
    }
    markDemoSeen()
    setDemoPrompt(false)
    setDemoPaused(false)
    setDemoFinal(false)
    setDemoIndex(0)
  }, [demoIndex, camera, positions, selection, parked, notes, apertureId, readingId, readingEvidenceId, hoverId, aiOpen, aiInput, addAngle, companyQuery, lensOpen])

  const demoExit = useCallback(() => {
    clearDemoTimers()
    const snap = demoSnapshotRef.current
    if (snap) {
      setCamera(snap.camera)
      setPositions(snap.positions)
      setSelection(snap.selection)
      setParked(snap.parked)
      setNotes(snap.notes)
      setApertureId(snap.apertureId)
      setReadingId(snap.readingId)
      setReadingEvidenceId(snap.readingEvidenceId)
      setHoverId(snap.hoverId)
      setAiOpen(snap.aiOpen)
      setAiInput(snap.aiInput)
      setAddAngle(snap.addAngle)
      setCompanyQuery(snap.companyQuery)
      setLensOpen(snap.lensOpen)
      setDisplaced({})
      demoSnapshotRef.current = null
      markDemoCompleted()
    }
    setDemoIndex(null)
    setDemoPaused(false)
    setDemoFinal(false)
    setDemoCaption({ title: "", text: "" })
  }, [clearDemoTimers])

  useEffect(() => {
    demoExitRef.current = demoIndex !== null ? () => demoExit() : null
  }, [demoExit, demoIndex])

  // 场景调度：进入场景时排布该场景内的动作/字幕；暂停即清表
  useEffect(() => {
    enterSceneRef.current = enterScene
  }, [enterScene])

  useEffect(() => {
    if (demoIndex === null || demoPaused || demoFinal) return
    // 只按场景号驱动：定时器不再被无关重渲染清掉（否则会永远停在 Scene 1）
    const id = window.setTimeout(() => enterSceneRef.current?.(demoIndex), 0)
    return () => {
      window.clearTimeout(id)
      clearDemoTimers()
    }
  }, [demoIndex, demoPaused, demoFinal, clearDemoTimers])

  // §37：用户主动操作 → 暂停演示（不抢鼠标，也不吞掉控件点击）
  useEffect(() => {
    if (demoIndex === null) return
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest("[data-demo-controls]") || el?.closest("[data-demo-final]")) return
      setDemoPaused(true)
      clearDemoTimers()
    }
    window.addEventListener("pointerdown", onDown, true)
    return () => window.removeEventListener("pointerdown", onDown, true)
  }, [demoIndex, clearDemoTimers])

  // §28：Space 暂停/继续，→/← 场景步进，Esc 退出
  useEffect(() => {
    if (demoIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault()
        e.stopPropagation()
        setDemoPaused((v) => !v)
        return
      }
      if (e.key === "ArrowRight") {
        e.preventDefault()
        e.stopPropagation()
        setDemoFinal(false)
        setDemoIndex((i) => (i === null ? null : sceneBy(i, 1)))
        return
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        e.stopPropagation()
        setDemoFinal(false)
        setDemoIndex((i) => (i === null ? null : sceneBy(i, -1)))
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [demoIndex])

  // ---- derived ----
  const transform = `translate3d(${-camera.x * camera.scale}px, ${-camera.y * camera.scale}px, 0) scale(${camera.scale})`
  const zoomPct = Math.round(camera.scale * 100)
  const isMobile = viewport.width < 768
  // 在 Sidekick 并排模式里，把左侧完整宽度留给 Reading：证据页本身已经是
  // “论点 + 原始证据”双栏，再保留缩略画布会在常见笔记本宽度下形成四栏挤压。
  const panelW = readingId
    ? (isMobile || (workspaceLab && aiOpen) ? 0 : Math.round(Math.max(viewport.width * 0.3, 300)))
    : viewport.width
  const visible = anchors.filter((a) => !parked.includes(a.dimensionId))
  // §B10：切换器里的 SAVED / RECENT（已收藏的公司不在 RECENT 重复出现）
  const recentOnly = recentCompanies.filter((c) => !isSaved(savedCompanies, c.stockCode))
  const lastResearchFor = (code: string) => formatLastResearch(researchTimes[code] ?? null)
  const currentSaved = payload ? isSaved(savedCompanies, payload.company.stockCode) : false
  const confirmedLabels = new Set((payload?.dimensions ?? []).map((dimension) => dimension.label.trim()))
  const suggestions = (payload?.suggestions ?? [])
    .filter((suggestion) => !confirmedLabels.has(suggestion.label.trim()))
    .slice(0, 3)
  const readingDimension = payload && readingId ? payload.dimensions.find((d) => d.dimensionId === readingId) ?? null : null
  const hitStyle = (on: boolean) => (on ? { outline: "1px dashed rgba(47,102,255,0.6)", outlineOffset: 2, background: "rgba(47,102,255,0.06)" } : undefined)
  const sidekickTurns: SidekickTurn[] = payload
    ? (aiThreads[payload.company.stockCode] ?? []).map((entry) => ({
        id: entry.id,
        question: entry.question,
        scopeLabel: entry.scopeLabel,
        evidenceIds: entry.evidenceIds,
        dimensionId: entry.dimensionId,
        status: entry.status,
        summary: entry.summary,
        confirmed: entry.confirmed,
        inferred: entry.inferred,
        unknowns: entry.unknowns,
      }))
    : []
  const sidekickContext = payload
    ? [
        { id: payload.company.stockCode, label: payload.company.stockName, kind: "company" as const },
        ...(selection.length > 0
          ? selection.flatMap((dimensionId) => {
              const dimension = payload.dimensions.find((item) => item.dimensionId === dimensionId)
              return dimension ? [{ id: dimension.dimensionId, label: dimension.label, kind: "dimension" as const }] : []
            })
          : aiScope.type === "dimension" && aiScope.dimensionId
            ? [{ id: aiScope.dimensionId, label: scopeLabel(aiScope).split(" / ").at(-1) ?? "当前维度", kind: "dimension" as const }]
            : aiScope.type === "claim" && aiScope.claimId
              ? [{ id: aiScope.claimId, label: "当前结论", kind: "claim" as const }]
              : aiScope.type === "evidence" && aiScope.evidenceId
                ? [{ id: aiScope.evidenceId, label: payload.evidence.find((item) => item.evidenceId === aiScope.evidenceId)?.title ?? "当前证据", kind: "evidence" as const }]
                : []),
      ]
    : []

  const openEvidenceFromSidekick = (evidenceId: string) => {
    if (!payload) return
    const dimension = payload.dimensions.find((item) => item.evidenceIds.includes(evidenceId))
    setReadingEvidenceId(evidenceId)
    setAiScopeOverride({ type: "evidence", evidenceId })
    if (dimension) setReadingId(dimension.dimensionId)
  }

  const saveSidekickTurn = (turn: SidekickTurn) => {
    if (!turn.summary) return
    const dimension = turn.dimensionId ? payload?.dimensions.find((item) => item.dimensionId === turn.dimensionId) : null
    setNotes((current) => {
      const id = `ai-note-${turn.id}`
      if (current.some((item) => item.id === id)) return current
      return [
        ...current,
        {
          id,
          title: dimension ? `${dimension.label} · AI 研究便签` : "AI 研究便签",
          summary: turn.summary!.slice(0, 88),
          x: camera.x + 120,
          y: camera.y + 90,
        },
      ].slice(-3)
    })
    setSidekickNotice("回答已保存为画布便签")
  }

  const submitSidekick = () => {
    const text = aiInput.trim()
    if (!payload || !text) return
    if (sidekickMode === "ask") {
      void handleAskAI(text, aiScope)
      return
    }
    setSidekickDraft(researchAngleDraftFor(text, payload))
    setAiInput("")
    setSidekickNotice(null)
  }

  const confirmSidekickDraft = async () => {
    if (!sidekickDraft) return
    const draft = sidekickDraft
    setSidekickNotice(`正在把“${draft.title}”写入研究空间…`)
    const ok = await addDimension(draft.title)
    setSidekickDraft(null)
    setSidekickMode("ask")
    setSidekickNotice(ok ? `“${draft.title}”已加入画布` : `“${draft.title}”暂时无法解析，画布已保留可重试入口`)
  }

  /** 首次研究重试：清掉失败/中止态，init effect 随 initRun 递增整体重跑 */
  const retryInitialResearch = useCallback(() => {
    setFailed(false)
    setInitCancelled(false)
    setPayload(null)
    setInitialElapsedSec(0)
    setInitRun((run) => run + 1)
  }, [])

  /** 用户中止首次研究：abort 请求，加载页据此切换为"已中止"确认态 */
  const cancelInitialResearch = useCallback(() => {
    initAbortRef.current?.abort()
  }, [])

  if (failed) {
    // 原先这里只有一行英文、没有任何出口（死胡同）；补齐中文文案与出路，与 CompanyTransition 的失败态措辞一致
    return (
      <main
        data-research-failed
        className="flex h-screen w-screen flex-col items-center justify-center gap-6 px-6 text-center"
        style={{ background: C.bg, color: C.ink }}
      >
        <div>
          <div className="font-mono text-[11px] tracking-[0.22em]" style={{ color: C.secondary }}>
            RESEARCH SPACE UNAVAILABLE
          </div>
          <h1 className="mt-3 text-[26px] font-medium tracking-[-0.02em] md:text-[34px]">研究空间暂时无法完成</h1>
          <p className="mx-auto mt-3 max-w-[560px] text-[12.5px] leading-6" style={{ color: C.secondary }}>
            {initialRequest.stockCode ? `${initialRequest.stockCode} 的` : "本次"}
            研究没有生成任何数据。通常是数据源临时不可用，重试一般即可恢复。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            data-research-failed-retry
            onClick={retryInitialResearch}
            className="flex min-h-11 items-center rounded-full bg-[#11151B] px-5 text-[12.5px] text-white transition hover:bg-[#2F66FF]"
          >
            重试 →
          </button>
          <WipeLink
            href={RESEARCH_LIBRARY_HREF}
            className="flex min-h-11 items-center border px-4 font-mono text-[11px] transition hover:opacity-80"
            style={{ borderColor: C.hair, background: "rgba(255,255,255,0.7)", color: C.ink }}
          >
            ← 返回研究库
          </WipeLink>
        </div>
      </main>
    )
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden" style={{ background: C.bg }}>
    {!payload && (
      <InitialResearchLoading
        stockCode={initialRequest.stockCode}
        question={initialRequest.question}
        elapsedSec={initialElapsedSec}
        serverPhase={initServerPhase}
        reducedMotion={reducedMotion}
        cancelled={initCancelled}
        onCancel={cancelInitialResearch}
        onRetry={retryInitialResearch}
      />
    )}
    <main
      ref={rootRef}
      className="relative h-full select-none overflow-hidden overflow-x-hidden"
      style={{
        width: workspaceLab && aiOpen && !isMobile ? `calc(100% - ${sidekickWidth}px)` : "100%",
        background: C.bg,
        color: C.ink,
        transition: "width 360ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {/* 画布底纹（§12） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(17,21,27,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(17,21,27,0.028) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
          maskImage: "radial-gradient(125% 105% at 50% 45%, black 42%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(125% 105% at 50% 45%, black 42%, transparent 100%)",
        }}
      />

      {/* CANVAS PANE（§21：Reading 时压缩到 36%，仍可 hover / 可点面包屑） */}
      <div
        ref={containerRef}
        className="absolute left-0 top-0 h-full"
        style={{
          width: panelW,
          cursor: grabbing ? "grabbing" : spaceDown ? "grab" : "default",
          transition: "width 560ms cubic-bezier(0.22,1,0.36,1)",
          overflow: "hidden",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <div
          data-canvas-world
          data-switching={switchPhase === "resolving" ? "resolving" : "idle"}
          className="absolute left-1/2 top-1/2"
          style={{
            transform,
            transformOrigin: "0 0",
            transition: "transform 560ms cubic-bezier(0.22,1,0.36,1), opacity 320ms ease, filter 320ms ease",
            opacity: 1,
            filter: "none",
          }}
        >
          {/* Evidence Trace（§13） */}
          {payload && (
            <CanvasEvidenceTrace
              payload={payload}
              anchors={visible}
              positionOf={anchorPos}
              activeDimensionId={activeId}
              apertureDimensionId={apertureId}
              readingDimensionId={readingId}
              readingEvidenceId={readingEvidenceId}
            />
          )}

          {/* Research Anchors */}
          {payload && (
            <CanvasAnchorLayer
              payload={payload}
              anchors={visible}
              positionOf={anchorPos}
              activeDimensionId={activeId}
              apertureDimensionId={apertureId}
              hoverDimensionId={hoverId}
              selectedDimensionIds={selection}
              focusSet={focusSet}
              revealCount={revealCount}
              showHitAreas={hitAreas}
              setHoverDimensionId={setHoverId}
              setSelectedDimensionIds={setSelection}
              onRemoveDimension={removeAddedDimension}
            />
          )}

          {/* Focus Aperture（§5–§14/§33）：专属排除区 + 半透明白面，非 SaaS 卡 */}
          {/* 菜单项里的 ref 读取发生在点击回调内（非渲染期），编译器保守报错 */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {apertureId && apertureMetrics && (() => {
            const a = anchors.find((x) => x.dimensionId === apertureId)
            if (!a) return null
            const f = tierFont(a.tier)
            const summary = payload?.claims.find((c) => c.dimensionId === a.dimensionId && c.type !== "unknown")?.text ?? ""
            const rows = payload ? evidenceAnnotations(payload, a.dimensionId, 3) : []
            const missing = payload?.dimensions.find((d) => d.dimensionId === a.dimensionId)?.missingInformation ?? []
            return (
              <div
                data-aperture={a.dimensionId}
                data-collisions-before={apertureMetrics.collisionsBefore}
                data-collisions-after={apertureMetrics.collisionsAfter}
                data-displaced-count={Object.keys(apertureMetrics.displaced).length}
                className="absolute"
                style={{
                  left: apertureMetrics.rect.x,
                  top: apertureMetrics.rect.y,
                  width: apertureMetrics.rect.width,
                  minHeight: apertureMetrics.rect.height,
                  zIndex: 30,
                  background: "rgba(255,255,255,0.62)",
                  border: "1px solid rgba(17,21,27,0.06)",
                  padding: "16px 20px 14px",
                  animation: "v5-aperture-in 380ms cubic-bezier(0.22,1,0.36,1)",
                  transition: "left 400ms cubic-bezier(0.22,1,0.36,1), top 400ms cubic-bezier(0.22,1,0.36,1)",
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between">
                  <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: C.secondary }}>
                    {a.index} / {a.tier.toUpperCase()}
                  </div>
                  <button
                    type="button"
                    data-aperture-menu
                    onClick={() => setMenuOpen((v) => !v)}
                    className="px-2 leading-none"
                    style={{ color: C.secondary, minWidth: 36, minHeight: 36 }}
                    title="More"
                  >
                    •••
                  </button>
                </div>
                <div className="mt-1 font-medium leading-tight tracking-[-0.01em]" style={{ fontSize: f.size + 4, color: C.ink }}>
                  {a.label}
                </div>
                {a.status === "unknown" ? (
                  <ul className="mt-3 space-y-1 text-[12.5px] leading-relaxed" style={{ color: C.secondary }}>
                    <li style={{ color: C.amber }}>Evidence incomplete</li>
                    {missing.slice(0, 4).map((m) => (
                      <li key={m}>· {m}</li>
                    ))}
                  </ul>
                ) : (
                  <>
                    {summary && (
                      <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: C.secondary }}>
                        {trimSummary(summary, 58)}
                      </p>
                    )}
                    <div className="mt-3 space-y-1.5">
                      {rows.map((r) => (
                        <div key={r.index} className="flex items-baseline justify-between gap-4">
                          <span className="text-[12px]" style={{ color: C.secondary, whiteSpace: "nowrap" }}>
                            {r.name}
                          </span>
                          <span className="font-mono text-[12.5px]" style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                            {r.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <button
                  type="button"
                  data-aperture-explore
                  onClick={() => openReading(a)}
                  className="mt-3 rounded-[4px] px-3.5 font-mono text-[11px] tracking-[0.06em] text-white"
                  style={{ background: C.blue, minHeight: 40 }}
                >
                  Explore research →
                </button>

                {ask?.anchorId === a.dimensionId && (
                  <div className="mt-3 border-t pt-2.5" style={{ borderColor: C.hair }}>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={ask.question}
                        onChange={(e) => setAsk({ ...ask, question: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void runAsk(a)
                        }}
                        placeholder="沿这个研究角度继续问…"
                        className="min-w-0 flex-1 bg-transparent pb-1 text-[12.5px] outline-none"
                        style={{ borderBottom: `1px solid ${C.hair}`, minHeight: 34 }}
                      />
                      <button
                        type="button"
                        onClick={() => void runAsk(a)}
                        className="rounded-[4px] px-3 text-white"
                        style={{ background: C.blue, minHeight: 34 }}
                      >
                        {ask.status === "loading" ? "…" : "Ask →"}
                      </button>
                    </div>
                    {ask.status !== "idle" && ask.status !== "loading" && (
                      <div className="mt-2 space-y-1 text-[12px] leading-relaxed" style={{ color: C.secondary }}>
                        {ask.summary && <p style={{ color: C.ink }}>{ask.summary}</p>}
                        {ask.confirmed?.length ? <p>可以确认：{ask.confirmed.slice(0, 2).join("；")}</p> : null}
                        {ask.inferred?.length ? <p>基于证据可以推断：{ask.inferred.slice(0, 2).join("；")}</p> : null}
                        {ask.unknowns?.length ? <p>不能确认：{ask.unknowns.slice(0, 2).join("；")}</p> : null}
                        {ask.message && <p>{ask.message}</p>}
                      </div>
                    )}
                  </div>
                )}

                {menuOpen && (
                  <div
                    data-aperture-context-menu
                    className="absolute right-3 top-12 w-[168px] border bg-white py-1"
                    style={{ borderColor: C.hair, zIndex: 40, boxShadow: "0 8px 24px rgba(17,21,27,0.10)" }}
                  >
                    {[
                      { label: "Pin summary", key: "pin", run: () => pinNote(a) },
                      { label: "Ask about this", key: "ask", run: () => focusAiLensRef.current?.({ type: "dimension", dimensionId: a.dimensionId }) },
                      { label: "Park", key: "park", run: () => park(a.dimensionId) },
                      ...(a.origin !== "ai_initial"
                        ? [{ label: "Remove from research", key: "remove", run: () => removeAddedDimension(a.dimensionId) }]
                        : []),
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        data-menu-item={item.key}
                        onClick={() => {
                          item.run()
                          setMenuOpen(false)
                        }}
                        className="block w-full px-3 text-left font-mono text-[11px] hover:bg-black/[0.04]"
                        style={{ color: item.key === "remove" ? C.coral : C.ink, minHeight: 36 }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Add Dimension resolving 态（§30） */}
          {adding && (
            <div className="pointer-events-none absolute" style={{ left: adding.x - 20, top: adding.y - 20, zIndex: 30 }}>
              <div className="font-mono text-[10px]" style={{ color: C.secondary }}>
                {String(anchors.length + 1).padStart(2, "0")}
              </div>
              <div className="text-[22px] font-medium" style={{ color: C.ink }}>
                {adding.label}
              </div>
              <div className="mt-1 font-mono text-[10.5px] tracking-[0.16em]" style={{ color: C.blue }}>
                resolving…
              </div>
            </div>
          )}

          {/* §43：失败的临时研究角度——不删除用户意图，可就地重试 */}
          {failedAngle && (
            <div className="absolute" data-failed-angle style={{ left: failedAngle.x - 20, top: failedAngle.y - 20, zIndex: 30 }}>
              <div className="text-[22px] font-medium" style={{ color: C.ink }}>
                {failedAngle.label}
              </div>
              <div className="mt-1 flex items-center gap-3">
                <span className="font-mono text-[10.5px] tracking-[0.12em]" style={{ color: C.coral }}>
                  Unable to resolve
                </span>
                <button
                  type="button"
                  data-ui
                  data-failed-angle-retry
                  onClick={() => void addDimension(failedAngle.label, failedAngle.x, failedAngle.y)}
                  className="font-mono text-[10.5px]"
                  style={{ color: C.blue, minHeight: 28, cursor: "pointer" }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Pinned notes（§26） */}
          {notes.map((n) => (
            <div
              key={n.id}
              data-note-id={n.id}
              data-hit="note"
              className="absolute w-[250px]"
              style={{ left: n.x, top: n.y, cursor: "move", ...hitStyle(hitAreas) }}
              onPointerDown={(e) => {
                e.stopPropagation()
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return
                const world = screenToWorld(camera, viewport, e.clientX - rect.left, e.clientY - rect.top)
                noteDragRef.current = { id: n.id, offsetX: world.x - n.x, offsetY: world.y - n.y }
                try {
                  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                } catch {
                  // 合成事件下可能失败
                }
              }}
            >
              <div className="border-l pl-3" style={{ borderColor: "rgba(17,21,27,0.2)" }}>
                <div className="font-mono text-[9.5px] tracking-[0.2em]" style={{ color: C.secondary }}>
                  RESEARCH NOTE
                </div>
                <div className="mt-1 text-[13.5px] font-medium">{n.title}</div>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: C.secondary }}>
                  {n.summary}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 待加入建议从公司信息栏拖出时使用屏幕坐标，不跟随世界缩放。 */}
        {suggestDrag && (
          <div
            data-suggestion-ghost
            className="pointer-events-none absolute z-40"
            style={{ left: suggestDrag.x - 62, top: suggestDrag.y - 18 }}
          >
            <span
              className="whitespace-nowrap rounded-full border px-3 py-2 text-[12px] shadow-lg"
              style={{
                background: suggestDrag.over ? C.blue : "rgba(255,255,255,0.96)",
                color: suggestDrag.over ? "#fff" : C.ink,
                borderColor: suggestDrag.over ? C.blue : C.hair,
              }}
            >
              {suggestDrag.over ? "松开并加入研究" : suggestDrag.label}
            </span>
          </div>
        )}

        {marquee && (
          <div
            className="pointer-events-none absolute z-30"
            style={{
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
              border: `1px solid ${C.blue}`,
              background: "rgba(47,102,255,0.06)",
            }}
          />
        )}
      </div>

      {/* READING SHEET（§21–§24：复用 Claim Spine / Evidence / Ask / Challenge） */}
      {!readingId && payload && (
        <MobileResearchList
          payload={payload}
          isRecordedSample={isRecordedSample}
          onOpenDimension={(dimensionId) => {
            const anchor = anchors.find((item) => item.dimensionId === dimensionId)
            if (anchor) openReading(anchor)
          }}
        />
      )}

      {readingId && payload && readingDimension && readingEvidenceId && !(workspaceLab && aiOpen) && (
        <div
          data-evidence-breadcrumb
          className="absolute z-[70] hidden items-center gap-2 font-mono text-[10.5px] md:flex"
          style={{ left: workspaceLab && aiOpen ? "3rem" : `calc(30% + 3rem)`, top: 12, color: C.secondary }}
        >
          <button
            type="button"
            onClick={() => {
              closeReadingRef.current?.()
              backNav()
            }}
            className="transition hover:opacity-70"
            style={{ minHeight: 24, cursor: "pointer" }}
          >
            {payload.company.stockName}
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={() => {
              setReadingEvidenceId(null)
              backNav()
            }}
            className="transition hover:opacity-70"
            style={{ minHeight: 24, cursor: "pointer" }}
          >
            {readingDimension.label}
          </button>
          {(() => {
            const claims = payload.claims.filter((c) => c.dimensionId === readingDimension.dimensionId)
            const ci = claims.findIndex((c) => c.evidenceIds.includes(readingEvidenceId))
            const dim = payload.dimensions.find((d) => d.dimensionId === readingDimension.dimensionId)
            const ei = dim ? dim.evidenceIds.indexOf(readingEvidenceId) + 1 : 0
            if (ci < 0) return null
            return (
              <>
                <span>/</span>
                <span style={{ color: C.ink }}>Claim {String(ci + 1).padStart(2, "0")}</span>
                {ei > 0 && (
                  <>
                    <span>/</span>
                    <span style={{ color: C.ink }}>Evidence {anchorGlyph(ei)}</span>
                  </>
                )}
              </>
            )
          })()}
        </div>
      )}

      {readingId && payload && readingDimension && (
        <div
          data-reading-sheet
          className="absolute right-0 top-0 z-[80] h-full overflow-hidden md:z-40"
          style={{
            width: `calc(100% - ${panelW}px)`,
            background: C.bg,
            boxShadow: "-30px 0 80px rgba(17,21,27,0.10)",
            animation: "v5-sheet-in 560ms cubic-bezier(0.22,1,0.36,1)",
            transition: "width 560ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <ReadingV3
            space={payload}
            dimension={readingDimension}
            flipTitleFrom={flipFrom}
            initialClaimId={null}
            initialEvidenceId={readingEvidenceId}
            onEvidenceFocus={setReadingEvidenceId}
            onAsk={(claimId) => focusAiLens({ type: "claim", claimId })}
            escOwnedByParent
            onBack={closeReading}
            updatedClaimIds={updatedClaims?.stockCode === payload.company.stockCode ? updatedClaims.ids : undefined}
            onReorganize={() => void runReorganize(readingDimension)}
            reorganizing={reorganizingDimId === readingDimension.dimensionId}
          />
        </div>
      )}

      {/* ---- CHROME ---- */}
      {!(workspaceLab && aiOpen && readingId) && (
      <header className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-4 whitespace-nowrap px-8 py-6">
        <div className="flex items-center gap-3">
          <WipeLink
            href={HOME_HREF}
            data-home-link
            aria-label="返回 StockLens 首页"
            className="pointer-events-auto inline-flex items-center gap-3 font-mono text-[11px] tracking-[0.3em] transition hover:opacity-65"
            style={{ color: C.ink, minHeight: 36 }}
          >
            <StockLensMark size={31} decorative />
            <span>STOCKLENS</span>
          </WipeLink>
          {/* 手机上整组右上导航因放不下被隐藏，这里补一个研究库出口，避免"手机上回不去研究库" */}
          <WipeLink
            href={RESEARCH_LIBRARY_HREF}
            data-research-library-link-mobile
            aria-label="打开研究库"
            className="pointer-events-auto inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] transition hover:opacity-65 md:hidden"
            style={{ color: C.ink, minHeight: 36 }}
          >
            <span aria-hidden>▦</span>
            <span>研究库</span>
            {libraryCompanies.length > 0 && (
              <span className="text-[9px] tracking-normal" style={{ color: C.secondary }}>
                {String(libraryCompanies.length).padStart(2, "0")}
              </span>
            )}
          </WipeLink>
          {isRecordedSample && (
            <span
              data-recorded-sample
              className="border px-2 py-1 font-mono text-[9px] tracking-[0.12em]"
              style={{ borderColor: C.hair, color: C.secondary }}
            >
              录制示例 · 2026-09-30
            </span>
          )}
        </div>
        {readingId && payload && readingDimension ? (
          <button
            type="button"
            data-ui
            data-breadcrumb
            onClick={closeReading}
            className="pointer-events-auto absolute left-8 top-16 font-mono text-[11px] tracking-[0.14em]"
            style={{ color: C.secondary, minHeight: 36 }}
          >
            ← {payload.company.stockName} / <span style={{ color: C.ink }}>{readingDimension?.label}</span>
          </button>
        ) : (
          <div data-ui className="pointer-events-auto relative hidden items-center gap-4 whitespace-nowrap font-mono text-[12px] tracking-[0.14em] md:flex" style={{ color: C.secondary }}>
            <WipeLink
              href={RESEARCH_LIBRARY_HREF}
              data-research-library-link
              className="flex items-center gap-2 border-r pr-5 transition hover:opacity-80"
              style={{ minHeight: 36, borderColor: C.hair, color: C.ink }}
            >
              <span aria-hidden>▦</span>
              <span>研究库</span>
              {libraryCompanies.length > 0 && (
                <span className="text-[9px] tracking-normal" style={{ color: C.secondary }}>
                  {String(libraryCompanies.length).padStart(2, "0")}
                </span>
              )}
            </WipeLink>
            <SearchGlyph />
            <button
              type="button"
              data-ui
              data-company-identity
              onClick={() => setCompanyQuery((q) => (q === null ? "" : null))}
              className="flex items-center gap-2 transition hover:opacity-80"
              style={{ minHeight: 36, cursor: "pointer" }}
            >
              <span style={{ color: C.ink }}>{payload ? payload.company.stockName : "—"}</span>
              <span data-ticker className="font-mono text-[10.5px]" style={{ color: C.secondary }}>
                {payload ? payload.company.stockCode : "—"}
              </span>
            </button>
            <button
              type="button"
              data-ui
              data-save-company
              onClick={() => {
                if (!payload) return
                const entry = {
                  stockCode: payload.company.stockCode,
                  name: payload.company.stockName,
                  industry: payload.company.industryName ?? undefined,
                }
                const next = toggleSaved(savedCompanies, entry)
                setSavedCompanies(next)
                saveSaved(next)
              }}
              className="transition hover:opacity-80"
              style={{ minHeight: 36, cursor: "pointer", color: currentSaved ? C.amber : C.secondary }}
            >
              {currentSaved ? "★ 已保存" : "☆ 保存到研究架"}
            </button>
            <button
              type="button"
              data-change-company
              onClick={() => setCompanyQuery((q) => (q === null ? "" : null))}
              className="transition hover:opacity-80"
              style={{ minHeight: 36, cursor: "pointer" }}
            >
              更换公司 →
            </button>
            {payload && (
              <button
                type="button"
                data-ui
                data-export-notes
                onClick={() => setNotesOpen(true)}
                className="transition hover:opacity-80"
                style={{ minHeight: 36, cursor: "pointer" }}
              >
                导出笔记
              </button>
            )}
            {payload && hasStaleTimeSensitiveEvidence(payload) ? (
              <button
                type="button"
                data-ui
                data-refresh-evidence
                disabled={evidenceRefreshing}
                onClick={() => void runEvidenceRefresh()}
                className="transition hover:opacity-80 disabled:opacity-60"
                style={{ minHeight: 36, cursor: evidenceRefreshing ? "wait" : "pointer", color: C.amber }}
              >
                {evidenceRefreshing
                  ? "刷新中…"
                  : `行情数据已过期 · 快速刷新`}
              </button>
            ) : (
              // 手动更新常驻（2026-10-09 用户拍板）：数据不靠 Calendar 兜底，进入已自动刷，
              // 这里给用户一个随时可点的入口。录制示例是 fixture，不提供刷新（看实时走 live=1）。
              payload && !isRecordedSample && (
                <button
                  type="button"
                  data-ui
                  data-refresh-evidence
                  disabled={evidenceRefreshing}
                  onClick={() => void runEvidenceRefresh()}
                  className="transition hover:opacity-80 disabled:opacity-60"
                  style={{ minHeight: 36, cursor: evidenceRefreshing ? "wait" : "pointer" }}
                >
                  {evidenceRefreshing ? "更新中…" : "手动更新"}
                </button>
              )
            )}
            {resolvingName && (
              <span data-resolving className="font-mono text-[10.5px]" style={{ color: C.secondary }}>
                Resolving {resolvingName}…
              </span>
            )}
            <button
              type="button"
              data-ui
              data-demo-start
              onClick={demoStart}
              disabled={!payload}
              className="border px-2 font-mono text-[10.5px] transition hover:opacity-80 disabled:cursor-default disabled:opacity-55"
              style={{ borderColor: C.hair, color: C.ink, minHeight: 30, cursor: payload ? "pointer" : "default" }}
            >
              {/* §P2：不承诺精确秒数（Demo 约 30 秒）；研究空间未就绪时不进入演示 */}
              {payload ? "▶ 快速演示" : "研究空间准备中…"}
            </button>
            {companyQuery !== null && (
              <div data-ui data-company-search className="absolute right-0 top-10 w-[340px] border bg-white p-3" style={{ borderColor: C.hair }}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.22em]" style={{ color: C.secondary }}>
                    CHANGE COMPANY
                  </span>
                  {payload && (
                    <span data-last-research className="font-mono text-[9.5px]" style={{ color: C.secondary }}>
                      {lastResearchFor(payload.company.stockCode) ?? ""}
                    </span>
                  )}
                </div>
                {payload && (
                  <button
                    type="button"
                    data-refresh-research
                    onClick={() => {
                      const code = payloadRef.current?.company.stockCode
                      if (!code) return
                      setRefreshNote("Refreshing…")
                      void switchCompanyRef.current?.(code, undefined, { mode: "refresh", force: true })
                      window.setTimeout(() => setRefreshNote(null), 2600)
                    }}
                    className="mt-1 font-mono text-[10px] underline decoration-dotted transition hover:opacity-80"
                    style={{ color: C.secondary, minHeight: 26, cursor: "pointer" }}
                  >
                    Refresh research
                  </button>
                )}
                {refreshNote && (
                  <span className="ml-2 font-mono text-[9.5px]" style={{ color: C.secondary }}>
                    {refreshNote}
                  </span>
                )}
                {savedCompanies.length > 0 && (
                  <>
                    <div className="mt-3 font-mono text-[9.5px] tracking-[0.2em]" style={{ color: C.secondary }}>
                      SAVED
                    </div>
                    <ul data-shelf-saved className="mt-1">
                      {savedCompanies.map((c) => (
                        <li key={c.stockCode}>
                          <button
                            type="button"
                            data-saved-company={c.stockCode}
                            onClick={() => void switchCompany(c.stockCode)}
                            className="flex w-full items-center gap-2 px-2 text-left text-[12px] hover:bg-black/[0.04]"
                            style={{ minHeight: 34, color: C.ink, cursor: "pointer" }}
                          >
                            <span style={{ color: C.amber }}>★</span>
                            <span>{c.name}</span>
                            <span className="font-mono text-[10.5px]" style={{ color: C.secondary }}>
                              {c.stockCode}
                            </span>
                            {lastResearchFor(c.stockCode) && (
                              <span className="ml-auto font-mono text-[9.5px]" style={{ color: C.secondary }}>
                                {lastResearchFor(c.stockCode)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {recentOnly.length > 0 && (
                  <>
                    <div className="mt-3 font-mono text-[9.5px] tracking-[0.2em]" style={{ color: C.secondary }}>
                      RECENT
                    </div>
                    <ul data-shelf-recent className="mt-1">
                      {recentOnly.map((c) => (
                        <li key={c.stockCode}>
                          <button
                            type="button"
                            data-recent-company={c.stockCode}
                            onClick={() => void switchCompany(c.stockCode)}
                            className="flex w-full items-center gap-2 px-2 text-left text-[12px] hover:bg-black/[0.04]"
                            style={{ minHeight: 34, color: C.ink, cursor: "pointer" }}
                          >
                            <span>{c.name}</span>
                            <span className="font-mono text-[10.5px]" style={{ color: C.secondary }}>
                              {c.stockCode}
                            </span>
                            {lastResearchFor(c.stockCode) && (
                              <span className="ml-auto font-mono text-[9.5px]" style={{ color: C.secondary }}>
                                {lastResearchFor(c.stockCode)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="my-2 h-px w-full" style={{ background: C.hair }} />
                <input
                  autoFocus
                  value={companyQuery}
                  onChange={(e) => void searchCompany(e.target.value)}
                  placeholder="搜索公司 / 代码"
                  className="w-full pb-2 text-[12.5px] outline-none"
                  style={{ borderBottom: `1px solid ${C.hair}`, minHeight: 36 }}
                />
                <ul className="mt-2">
                  {companyResults.map((r) => (
                    <li key={r.stockCode}>
                      <button
                        type="button"
                        data-company-result={r.stockCode}
                        onClick={() => void switchCompany(r.stockCode, { name: r.stockName })}
                        className="w-full px-2 text-left text-[12px] hover:bg-black/[0.04]"
                        style={{ minHeight: 36, color: C.ink }}
                      >
                        {r.stockName}{" "}
                        <span className="font-mono text-[10.5px]" style={{ color: C.secondary }}>
                          {r.stockCode}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {companySearched.length > 0 && companyResults.length === 0 && (
                  <div data-company-search-empty className="mt-3 border-t pt-3" style={{ borderColor: C.hair }}>
                    <div className="flex items-center gap-2">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 13 13"
                        aria-hidden
                        className="shrink-0"
                        style={{ color: C.secondary }}
                      >
                        <circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M8.6 8.6 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      <span className="text-[12.5px]" style={{ color: C.ink }}>
                        没有匹配的 A 股
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="font-mono text-[9.5px] tracking-[0.16em]" style={{ color: C.secondary }}>
                        范围
                      </span>
                      {["沪", "深", "北"].map((market) => (
                        <span
                          key={market}
                          className="rounded-full border px-[7px] py-px text-[9.5px] leading-[14px]"
                          style={{ borderColor: C.hair, color: C.secondary }}
                        >
                          {market}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-[1.55]" style={{ color: C.secondary }}>
                      仅 A 股，港股 / 美股不在覆盖内
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </header>
      )}

      {/* 快刷结果提示（全局可见，不依赖侧板开关；阶段 4） */}
      {refreshNote && (
        <div
          data-refresh-note
          className="pointer-events-none absolute left-1/2 top-20 z-[60] -translate-x-1/2 border px-4 py-2 font-mono text-[11px]"
          style={{ borderColor: C.hair, background: "rgba(255,255,255,0.96)", color: C.ink, maxWidth: "80vw" }}
        >
          {refreshNote}
        </div>
      )}

      {payload && !readingId && (
        <div className="pointer-events-none absolute left-8 top-[112px] z-20 max-w-[320px]">
          <h1 className="text-[64px] font-semibold leading-[0.98] tracking-[-0.02em]">{payload.company.stockName}</h1>
          <div className="mt-3 font-mono text-[16px] tracking-[0.34em]" style={{ color: C.secondary }}>
            {payload.company.stockName === "美的集团" ? "MIDEA GROUP" : payload.company.stockName.toUpperCase().slice(0, 14)}
          </div>
          <div className="mt-2 font-mono text-[12.5px] tracking-[0.2em]" style={{ color: C.secondary }}>
            {payload.company.stockCode} · {payload.company.industryName ?? "—"}
          </div>

          <MarketTrendStrip history={payload.marketHistory} compact />

          {suggestions.length > 0 && (
            <div
              data-pending-suggestions
              data-ui
              className="pointer-events-auto mt-5 hidden w-[282px] md:block"
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[12px] font-semibold">待加入</span>
                <span className="font-mono text-[8.5px] tracking-[0.14em]" style={{ color: C.secondary }}>
                  AI 建议 · {suggestions.length}
                </span>
              </div>
              <div>
                {suggestions.map((suggestion, suggestionIndex) => {
                  const isAdding = adding?.label === suggestion.label
                  const didFail = failedAngle?.label === suggestion.label
                  return (
                    <button
                      key={suggestion.label}
                      type="button"
                      data-suggestion-trigger={suggestion.label}
                      disabled={adding !== null}
                      title={suggestion.rationale}
                      onPointerDown={(event) => {
                        if (adding) return
                        event.stopPropagation()
                        suggestRef.current = {
                          label: suggestion.label,
                          clientX: event.clientX,
                          clientY: event.clientY,
                        }
                      }}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (suppressSuggestionClickRef.current) {
                          suppressSuggestionClickRef.current = false
                          return
                        }
                        void addDimension(suggestion.label)
                      }}
                      className="group flex w-full items-start gap-3 border-b py-3 text-left transition last:border-b-0 hover:translate-x-1 disabled:cursor-wait disabled:opacity-55"
                      style={{ borderColor: "rgba(17,21,27,0.08)" }}
                    >
                      <span
                        className="mt-0.5 shrink-0 font-mono text-[9px] tracking-[0.12em] transition"
                        style={{ color: didFail ? C.coral : C.blue }}
                      >
                        {isAdding ? "··" : didFail ? "!" : `+${String(suggestionIndex + 1).padStart(2, "0")}`}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium leading-tight tracking-[-0.01em] group-hover:text-[#2F66FF]">{suggestion.label}</span>
                        <span className="mt-1 block font-mono text-[8.5px] tracking-[0.05em]" style={{ color: didFail ? C.coral : C.secondary }}>
                          {isAdding ? "正在加入…" : didFail ? "加入失败 · 点击重试" : "点击加入 · 拖动可定位"}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-6 left-8 z-50 font-mono text-[11px] tracking-[0.26em]" style={{ color: C.secondary }}>
        {payload
          ? `${payload.company.industryName === "白色家电" ? "WHITE GOODS" : (payload.company.industryName ?? "").toUpperCase()} · ${anchors.length} RESEARCH DIMENSIONS${formatLastResearch(lastResearchAt) ? ` · ${formatLastResearch(lastResearchAt)}` : ""}`
          : "—"}
      </div>

      {/* §2/§37：AI Research Lens（真输入框；与 Command Palette 分离） */}
      <div
        data-ui
        data-ai-lens
        onPointerDown={() => setAiOpen(true)}
        className="absolute bottom-6 z-[55] flex items-center gap-3 rounded-full border px-4 backdrop-blur transition-all"
        style={{
          display: workspaceLab && aiOpen ? "none" : undefined,
          left: isMobile ? viewport.width / 2 : readingId ? panelW / 2 : viewport.width / 2,
          transform: "translateX(-50%)",
          width: isMobile ? "calc(100% - 32px)" : 580,
          height: 50,
          zIndex: workspaceLab ? 95 : undefined,
          borderColor: aiOpen ? "rgba(47,102,255,0.45)" : "rgba(17,21,27,0.20)",
          background: aiOpen ? "rgba(255,255,255,0.97)" : "rgba(255,255,255,0.9)",
          boxShadow: aiOpen
            ? "0 6px 24px rgba(47,102,255,0.16), 0 1px 3px rgba(17,21,27,0.08)"
            : "0 3px 14px rgba(17,21,27,0.08)",
        }}
      >
        <span aria-hidden style={{ color: C.blue }}>
          ✦
        </span>
        <span className="font-mono text-[10px] tracking-[0.14em]" style={{ color: C.secondary, whiteSpace: "nowrap" }}>
          {payload ? scopeLabel(aiScope) : ""}
        </span>
        <textarea
          ref={aiInputRef}
          rows={1}
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          onFocus={() => setAiOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void handleAskAI(aiInput, aiScope)
            }
            if (e.key === "Enter" && e.shiftKey) return
          }}
          placeholder={scopePlaceholder()}
          className="min-w-0 flex-1 resize-none bg-transparent py-3 text-[12.5px] outline-none"
          style={{ color: C.ink, maxHeight: 44 }}
          aria-label="AI Research Lens"
        />
        <button
          type="button"
          data-ai-send
          onClick={() => (aiStatus === "loading" ? stopAi() : void handleAskAI(aiInput, aiScope))}
          className="font-mono text-[12px] transition-colors"
          style={
            aiStatus === "loading"
              ? { color: C.coral, minWidth: 28, minHeight: 36 }
              : aiInput.trim()
                ? { background: C.blue, color: "#FFFFFF", borderRadius: 999, width: 30, height: 30, minWidth: 28, minHeight: 28 }
                : { color: C.secondary, minWidth: 28, minHeight: 36 }
          }
          title={aiStatus === "loading" ? "Stop" : "发送（Enter）"}
        >
          {aiStatus === "loading" ? "■" : "↵"}
        </button>
        <button
          type="button"
          data-command-hint
          onClick={() => setLensOpen(true)}
          className="font-mono text-[10px] tracking-[0.12em] rounded-full border px-2.5 py-1 transition-colors hover:bg-[rgba(47,102,255,0.08)]"
          style={{ color: C.blue, borderColor: "rgba(47,102,255,0.35)", background: "rgba(255,255,255,0.92)", minHeight: 26, whiteSpace: "nowrap" }}
          title="打开命令面板"
        >
          ⌘K Commands
        </button>
      </div>

      {/* §30：聚焦后的建议问题（最多 3，随 scope 变化）；线程有历史时让位，避免遮住 Retry/Stop */}
      {!workspaceLab && aiOpen &&
        aiInput.length === 0 &&
        aiStatus === "idle" &&
        (aiThreads[payload?.company.stockCode ?? ""]?.length ?? 0) === 0 && (
        <div
          data-ui
          data-ai-suggestions
          className="absolute z-[55] flex flex-col gap-1"
          style={{ left: readingId ? panelW / 2 : viewport.width / 2, transform: "translateX(-50%)", bottom: 68, width: 580 }}
        >
          {aiSuggestionsFor(aiScope, payload).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => focusAiLens(aiScope, q)}
              className="w-fit rounded-full border px-3 text-left font-mono text-[11px] backdrop-blur"
              style={{ borderColor: C.hair, background: "rgba(255,255,255,0.8)", color: C.secondary, minHeight: 30 }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* §14/§15：Research Thread（editorial；向上展开；单一 thread 模型） */}
      {!workspaceLab && aiOpen && payload && (aiThreads[payload.company.stockCode]?.length ?? 0) > 0 && (
        <div
          data-ui
          data-ai-thread
          ref={aiThreadRef}
          onWheel={(e) => e.stopPropagation()}
          onScroll={(e) => {
            const el = e.currentTarget
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
            atBottomRef.current = nearBottom
            if (nearBottom) setHasNewResponse(false)
          }}
          className="absolute z-[54] overflow-y-auto border px-5 py-4"
          style={{
            left: readingId ? Math.min(panelW / 2, viewport.width / 2 - 300) : viewport.width / 2 - 320,
            bottom: 108,
            width: 640,
            maxHeight: 420,
            borderColor: C.hair,
            background: "rgba(255,255,255,0.94)",
            overscrollBehavior: "contain",
          }}
        >
          {/* §D37/§D38：唯一折叠入口在 Thread header */}
          <div
            data-ai-thread-header
            className="mb-3 flex items-center justify-between gap-3 border-b pb-2"
            style={{ borderColor: C.hair }}
          >
            <span className="font-mono text-[10.5px] tracking-[0.14em]" style={{ color: C.secondary }}>
              {payload.company.stockName} / {aiScope.type === "company" ? "Company Research" : scopeLabel(aiScope)}
            </span>
            <span className="flex items-center gap-3">
              <button
                type="button"
                data-ai-collapse-thread
                onClick={collapseThread}
                title="Collapse"
                className="font-mono text-[12px]"
                style={{ color: C.secondary, minHeight: 26, minWidth: 26, cursor: "pointer" }}
              >
                —
              </button>
              <button
                type="button"
                data-ai-close-thread
                onClick={collapseThread}
                title="收起（保留历史）"
                className="font-mono text-[12px]"
                style={{ color: C.secondary, minHeight: 26, minWidth: 26, cursor: "pointer" }}
              >
                ×
              </button>
              <button
                type="button"
                data-ai-thread-menu
                onClick={() => setThreadMenuOpen((v) => !v)}
                title="线程选项"
                className="font-mono text-[11px]"
                style={{ color: C.secondary, minHeight: 26, minWidth: 26, cursor: "pointer" }}
              >
                •••
              </button>
            </span>
          </div>
          {threadMenuOpen && (
            <div data-ai-thread-menu-panel className="mb-3 flex items-center gap-3 border px-3 py-2" style={{ borderColor: C.hair }}>
              {clearConfirm ? (
                <>
                  <span className="font-mono text-[10.5px]" style={{ color: C.ink }}>
                    Clear thread?
                  </span>
                  <button type="button" data-ai-clear-confirm onClick={clearThread} className="font-mono text-[10.5px]" style={{ color: C.coral, minHeight: 26, cursor: "pointer" }}>
                    Confirm
                  </button>
                  <button type="button" onClick={() => setClearConfirm(false)} className="font-mono text-[10.5px]" style={{ color: C.secondary, minHeight: 26, cursor: "pointer" }}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" data-ai-clear-thread onClick={() => setClearConfirm(true)} className="font-mono text-[10.5px]" style={{ color: C.secondary, minHeight: 26, cursor: "pointer" }}>
                  Clear thread
                </button>
              )}
            </div>
          )}
          {aiThreads[payload.company.stockCode].map((entry, i, arr) => (
            <div key={entry.id} className="mb-4 last:mb-0">
              {i > 0 && arr[i - 1].scopeLabel !== entry.scopeLabel && (
                <div className="mb-2 font-mono text-[9.5px] tracking-[0.18em]" style={{ color: C.secondary, opacity: 0.8 }}>
                  CONTEXT CHANGED → {entry.scopeLabel}
                </div>
              )}
              <p className="text-[13px] font-medium" style={{ color: C.ink }}>
                {entry.question}
              </p>
              <div className="mt-1.5 h-px w-full" style={{ background: C.hair }} />
              {entry.status === "running" && (
                <div className="mt-2 flex items-center gap-3" data-ai-thinking>
                  <p className="font-mono text-[11px]" style={{ color: C.secondary }}>
                    正在结合 {entry.evidenceIds.length > 0 ? entry.evidenceIds.length + " 条证据" : "当前证据"}组织回答…
                  </p>
                  <button
                    type="button"
                    data-ai-stop
                    onClick={stopAi}
                    className="rounded-[4px] border px-2.5 font-mono text-[10.5px]"
                    style={{ borderColor: C.hair, color: C.coral, minHeight: 30 }}
                  >
                    ■ Stop
                  </button>
                </div>
              )}
              {entry.status === "failed" && (
                <div className="mt-2 space-y-1.5" data-ai-failed>
                  <p className="text-[12px] leading-relaxed" style={{ color: C.secondary }}>
                    AI 解读暂时未能完成，当前证据仍可查看。
                  </p>
                  <div className="flex gap-3">
                    <button type="button" data-ai-retry onClick={() => retryTurn(entry)} className="font-mono text-[10.5px]" style={{ color: C.blue, minHeight: 28 }}>
                      重试回答
                    </button>
                    <button type="button" onClick={() => editTurn(entry)} className="font-mono text-[10.5px]" style={{ color: C.secondary, minHeight: 28 }}>
                      修改问题
                    </button>
                  </div>
                </div>
              )}
              {entry.status === "stopped" && (
                <div className="mt-2 space-y-1.5" data-ai-stopped>
                  <p className="font-mono text-[11px]" style={{ color: C.coral }}>
                    已停止
                  </p>
                  <div className="flex gap-3">
                    <button type="button" data-ai-retry onClick={() => retryTurn(entry)} className="font-mono text-[10.5px]" style={{ color: C.blue, minHeight: 28 }}>
                      重试回答
                    </button>
                    <button type="button" onClick={() => editTurn(entry)} className="font-mono text-[10.5px]" style={{ color: C.secondary, minHeight: 28 }}>
                      修改问题
                    </button>
                  </div>
                </div>
              )}
              {entry.status === "completed" && (
                <div className="mt-2 space-y-2 text-[12.5px] leading-relaxed" style={{ color: C.secondary }}>
                  {entry.summary && <p style={{ color: C.ink }}>{entry.summary}</p>}
                  {entry.confirmed?.length ? (
                    <div>
                      <div className="font-mono text-[9.5px] tracking-[0.18em]">可以确认</div>
                      {entry.confirmed.slice(0, 4).map((c, j) => (
                        <p key={j} className="mt-0.5">
                          {c}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {entry.inferred?.length ? (
                    <div>
                      <div className="font-mono text-[9.5px] tracking-[0.18em]">基于证据可以推断</div>
                      {entry.inferred.slice(0, 3).map((c, j) => (
                        <p key={j} className="mt-0.5">
                          {c}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {entry.unknowns?.length ? (
                    <div>
                      <div className="font-mono text-[9.5px] tracking-[0.18em]">暂时不能确认</div>
                      {entry.unknowns.slice(0, 3).map((c, j) => (
                        <p key={j} className="mt-0.5">
                          {c}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {/* §16：回答内 Evidence anchors 可点 → Canvas 高亮 + Inspector */}
                  {entry.evidenceIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {entry.evidenceIds.slice(0, 4).map((id, j) => {
                        const ev = payload.evidence.find((e) => e.evidenceId === id)
                        const label = ev?.title ?? id.replace(/^EV_/, "").slice(0, 12)
                        return (
                          <button
                            key={`${id}-${j}`}
                            type="button"
                            data-ai-anchor={id}
                            onClick={() => {
                              setReadingEvidenceId(id)
                              const ev2 = payload.evidence.find((e) => e.evidenceId === id)
                              if (ev2) {
                                const dim = payload.dimensions.find((d) => d.evidenceIds.includes(id))
                                if (dim) {
                                  setReadingId(dim.dimensionId)
                                  return
                                }
                              }
                            }}
                            className="font-mono text-[11px] rounded-full border px-2 transition-colors hover:bg-[rgba(47,102,255,0.08)]"
                            style={{ color: C.blue, borderColor: "rgba(47,102,255,0.35)", background: "rgba(255,255,255,0.92)", minHeight: 28 }}
                            title={ev ? `点击查看证据：${ev.title}` : id}
                          >
                            {["①", "②", "③", "④"][j]} {label.length > 12 ? `${label.slice(0, 12)}…` : label}
                          </button>
                        )
                      })}
                      {payload.dimensions
                        .filter((d) => d.dimensionId !== entry.dimensionId && (entry.summary ?? "").includes(d.label))
                        .slice(0, 2)
                        .map((d) => (
                          <button
                            key={d.dimensionId}
                            type="button"
                            data-ai-dimlink={d.dimensionId}
                            onClick={() => {
                              const anchor = anchors.find((x) => x.dimensionId === d.dimensionId)
                              if (anchor) openAperture(anchor)
                            }}
                            className="font-mono text-[10.5px]"
                            style={{ color: C.blue, minHeight: 28 }}
                          >
                            {d.label} ↗
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* §8/§9：用户上翻时不强制拉回底部，出现 ↓ New response */}
      {hasNewResponse && aiOpen && !workspaceLab && (
        <button
          type="button"
          data-ui
          data-ai-new
          onClick={() => {
            const el = aiThreadRef.current
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
            setHasNewResponse(false)
            atBottomRef.current = true
          }}
          className="absolute z-[56] rounded-full border px-3 font-mono text-[10.5px] backdrop-blur"
          style={{ left: readingId ? panelW / 2 : viewport.width / 2, transform: "translateX(-50%)", bottom: 96, borderColor: C.hair, background: "rgba(255,255,255,0.92)", color: C.blue, minHeight: 30 }}
        >
          ↓ New response
        </button>
      )}

      {/* §18/§23/§46：跨公司后台任务胶囊（不劫持当前公司） */}
      {externalJob && payload && (
          <button
            type="button"
            data-ui
            data-ai-capsule
            onClick={() => {
              const other = Object.entries(aiThreads).find(([code, turns]) => code !== payload.company.stockCode && turns.length > 0)
              if (other) {
                setThreadReady((r) => ({ ...r, [other[0]]: true }))
                void switchCompany(other[0])
              }
            }}
            className="absolute bottom-6 left-8 z-[56] flex items-center gap-2 rounded-full border px-3 font-mono text-[10.5px] backdrop-blur"
            style={{ borderColor: C.hair, background: "rgba(255,255,255,0.92)", color: C.secondary, minHeight: 36 }}
          >
            {Object.entries(aiThreads)
              .filter(([code, turns]) => code !== payload.company.stockCode && turns.some((t) => t.status === "running"))
              .map(([code, turns]) => {
                const running = turns.filter((t) => t.status === "running").slice(-1)[0]
                return (
                  <span key={code} data-ai-background-job={code}>
                    ✦ {running?.stockName ?? code} · {running?.scopeLabel ?? ""} · Answering… ■
                  </span>
                )
              })}
            {Object.entries(aiThreads)
              .filter(([code, turns]) => code !== payload.company.stockCode && turns.some((t) => t.status === "completed") && !turns.some((t) => t.status === "running") && !threadReady[code])
              .map(([code, turns]) => (
                <span key={code + "-ready"} data-ai-answer-ready={code}>
                  ✓ {turns[turns.length - 1]?.stockName ?? code} · Answer ready
                </span>
              ))}
          </button>
        )}

      {/* Task 17.1 §P3：取消等待的确认。过渡层在同一次提交里卸载，所以提示必须挂在画布上才看得见 */}
      {cancelNotice && (
        <div
          data-cancel-notice
          className="pointer-events-none absolute left-1/2 top-16 z-[60] -translate-x-1/2 font-mono text-[11px]"
          style={{ color: C.secondary }}
        >
          {cancelNotice}
        </div>
      )}

      {/* §25：单活跃任务提示 */}
      {aiNotice && (
        <div
          data-ui
          className="absolute z-[56] rounded border px-3 py-2 font-mono text-[10.5px]"
          style={{ left: readingId ? panelW / 2 : viewport.width / 2, transform: "translateX(-50%)", bottom: 64, borderColor: C.hair, background: "rgba(255,255,255,0.94)", color: C.coral }}
        >
          {aiNotice}
        </div>
      )}

      {removedDimension && (
        <div
          data-dimension-removed-toast
          role="status"
          aria-live="polite"
          className="absolute z-[72] flex items-center gap-3 rounded-full border px-4 py-2.5 text-[11.5px] shadow-[0_10px_30px_rgba(17,21,27,0.10)]"
          style={{
            left: viewport.width / 2,
            bottom: 78,
            transform: "translateX(-50%)",
            borderColor: C.hair,
            background: "rgba(255,255,255,0.97)",
            color: C.secondary,
          }}
        >
          <span>已移除“{removedDimension.dimension.label}”</span>
          <button
            type="button"
            data-undo-remove-dimension
            onClick={undoRemovedDimension}
            className="font-medium"
            style={{ color: C.blue, minHeight: 24 }}
          >
            撤销
          </button>
        </div>
      )}

      {/* §1–§21：Full-Screen Research Transition（Transition 就是当前页面） */}
      {pendingCompany && (switchPhase === "resolving" || switchPhase === "failed" || switchMorph) && (
        <CompanyTransition
          target={pendingCompany}
          mode={switchMode}
          phase={switchPhase === "failed" ? "failed" : "resolving"}
          elapsedSec={elapsedSec}
          error={switchError}
          notice={switchMorph ? null : cancelNotice}
          reducedMotion={reducedMotion}
          previousName={lastCompanyName ?? undefined}
          exiting={switchMorph}
          onCancel={cancelSwitch}
          onRetry={() => {
            setSwitchPhase("resolving")
            setSwitchError(null)
            void switchCompanyRef.current?.(pendingCompany.stockCode, { name: pendingCompany.name, industry: pendingCompany.industry }, { force: true, mode: switchMode === "refresh" ? "refresh" : undefined })
          }}
        />
      )}

      {/* §3：开发期交互计时面板（仅 ?perfDebug=1） */}
      {perfOn && (
        <div
          data-perf-panel
          className="pointer-events-none absolute left-8 top-24 z-[75] rounded border px-3 py-2 font-mono text-[10px] leading-relaxed"
          style={{ borderColor: C.hair, background: "rgba(255,255,255,0.94)", color: C.secondary }}
        >
          <div style={{ color: C.ink }}>interaction perf</div>
          {perfRows.length === 0 && <div>— no samples —</div>}
          {perfRows
            .slice()
            .reverse()
            .map((r, i) => (
              <div key={`${r.at}-${i}`} data-perf-row>
                {r.name} · {r.type} · {r.visualMs ?? "—"}ms · net:{r.network ? "yes" : "no"}
                {r.network && r.networkUrls[0] ? ` (${r.networkUrls[0]})` : ""}
              </div>
            ))}
        </div>
      )}

      {/* §C20：首次访问轻提示（非 Modal），关闭后不再自动出现 */}
      {!workspaceLab && demoPrompt && demoIndex === null && payload && companyQuery === null && (
        <div
          data-demo-prompt
          className="absolute right-8 top-20 z-[62] w-[300px] border p-4 backdrop-blur"
          style={{ borderColor: C.hair, background: "rgba(255,255,255,0.95)", boxShadow: "0 14px 44px rgba(17,21,27,0.10)" }}
        >
          <div className="font-mono text-[10.5px] tracking-[0.18em]" style={{ color: C.secondary }}>
            第一次使用 STOCKLENS？
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              data-ui
              data-demo-prompt-start
              onClick={demoStart}
              className="text-left text-[12.5px] transition hover:opacity-75"
              style={{ color: C.blue, minHeight: 30, cursor: "pointer" }}
            >
              ▶ 观看快速演示
            </button>
            <button
              type="button"
              data-demo-prompt-dismiss
              onClick={() => {
                markDemoSeen()
                setDemoPrompt(false)
              }}
              className="text-left text-[12.5px] transition hover:opacity-75"
              style={{ color: C.secondary, minHeight: 30, cursor: "pointer" }}
            >
              自行探索 →
            </button>
          </div>
        </div>
      )}

      {/* §C22：DemoController 的视觉层（只展示，不产生业务逻辑） */}
      {demoIndex !== null && (
        <DemoOverlay
          scene={sceneAt(demoIndex)}
          index={demoIndex}
          total={DEMO_SCENES.length}
          caption={demoCaption}
          paused={demoPaused}
          final={demoFinal}
          reducedMotion={reducedMotion}
          onTogglePause={() => setDemoPaused((v) => !v)}
          onSkip={() => {
            setDemoFinal(false)
            setDemoIndex((i) => (i === null ? null : isLastScene(i) ? i : sceneBy(i, 1)))
          }}
          onExit={demoExit}
        />
      )}

      {/* §52：?aiDebug=1 */}
      {aiDebugOn && (
        <div
          className="pointer-events-none absolute bottom-24 left-8 z-[70] rounded border px-3 py-2 font-mono text-[10px] leading-relaxed"
          data-ai-debug
          style={{ borderColor: C.hair, background: "rgba(255,255,255,0.92)", color: C.secondary }}
        >
          <div>scope: {aiScope.type}</div>
          <div>stockCode: {payload?.company.stockCode ?? "—"}</div>
          <div>dimensionId: {aiScope.dimensionId ?? "—"}</div>
          <div>claimId: {aiScope.claimId ?? "—"}</div>
          <div>evidenceId: {aiScope.evidenceId ?? "—"}</div>
          <div>followup: {aiStatus === "loading" ? "in-flight" : (aiThreads[payload?.company.stockCode ?? ""]?.slice(-1)[0]?.status ?? "idle")}</div>
        </div>
      )}

      <div
        data-ui
        data-hit="zoom"
        className="absolute bottom-6 right-8 z-50 flex items-center gap-1 rounded-full border px-2"
        style={{ borderColor: C.hair, background: "rgba(255,255,255,0.8)", color: C.secondary, minHeight: 40, ...hitStyle(hitAreas) }}
      >
        <button type="button" data-zoom-out onClick={() => zoomBy(1 / 1.25)} className="px-2" style={{ minWidth: 36, minHeight: 36 }}>
          −
        </button>
        <button
          type="button"
          data-zoom-pct
          onClick={resetZoom}
          className="px-1 font-mono text-[11px]"
          style={{ color: C.ink, minWidth: 46, minHeight: 36, fontVariantNumeric: "tabular-nums" }}
          title="Reset to 100%"
        >
          <span data-zoom-value>{zoomPct}</span>%
        </button>
        <button type="button" data-zoom-in onClick={() => zoomBy(1.25)} className="px-2" style={{ minWidth: 36, minHeight: 36 }}>
          +
        </button>
        <span aria-hidden style={{ width: 1, height: 14, background: C.hair, display: "inline-block", margin: "0 3px" }} />
        <button type="button" data-zoom-fit onClick={fitSelection} className="px-2" style={{ minWidth: 36, minHeight: 36 }} title="Fit selection (Shift+2)">
          ⛶
        </button>
        <button
          type="button"
          data-auto-arrange
          data-layout-mode={Object.keys(positions).length > 0 ? "manual" : "auto"}
          onClick={autoArrange}
          className="rounded-full px-3 text-[10px] font-medium"
          style={{
            minWidth: Object.keys(positions).length > 0 ? 88 : 72,
            minHeight: 30,
            color: C.blue,
            background: "rgba(47,102,255,0.08)",
          }}
          title={Object.keys(positions).length > 0 ? "清除手动位置并按编号重新排列" : "当前已按编号自动排列"}
        >
          {Object.keys(positions).length > 0 ? `↻ 恢复自动 · ${Object.keys(positions).length}` : "✓ 自动排列"}
        </button>
        <button
          type="button"
          data-zoom-fit-all
          onClick={fitAll}
          className="px-2 font-mono text-[10px]"
          style={{ minWidth: 36, minHeight: 36 }}
          title="Fit all (Shift+1)"
        >
          ALL
        </button>
      </div>

      {parked.length > 0 && (
        <div className="absolute bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4">
          {parked.map((id) => {
            const a = anchors.find((x) => x.dimensionId === id)
            return (
              <button
                key={id}
                type="button"
                data-ui
                data-parked={id}
                onClick={() => setParked((p) => p.filter((x) => x !== id))}
                className="font-mono text-[11px] tracking-[0.14em]"
                style={{ color: C.secondary, minHeight: 36, borderBottom: `1px dashed ${C.hair}` }}
              >
                {a?.label ?? id} · parked
              </button>
            )
          })}
        </div>
      )}

      {lensOpen && (
        <div
          data-ui
          data-lens
          className="absolute bottom-20 left-1/2 z-[60] w-[400px] -translate-x-1/2 border bg-white p-3"
          style={{ borderColor: C.hair, boxShadow: "0 12px 40px rgba(17,21,27,0.12)" }}
        >
          <input
            autoFocus
            value={lensText}
            onChange={(e) => setLensText(e.target.value)}
            placeholder="Research commands"
            className="w-full px-1 pb-2 text-[13px] outline-none"
            style={{ borderBottom: `1px solid ${C.hair}`, minHeight: 36, color: C.ink }}
          />
          <ul className="mt-2">
            {lensItems
              .filter((i) => lensText.trim().length === 0 || i.label.toLowerCase().includes(lensText.toLowerCase()))
              .map((i) => (
                <li key={i.label}>
                  <button
                    type="button"
                    data-lens-item={i.label}
                    onClick={() => {
                      i.run()
                      setLensOpen(false)
                      setLensText("")
                    }}
                    className="w-full px-2 text-left font-mono text-[11.5px] hover:bg-black/[0.04]"
                    style={{ color: C.ink, minHeight: 40 }}
                  >
                    {i.label}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {addAngle !== null && (
        <div
          data-ui
          data-add-angle
          className="absolute left-1/2 top-1/2 z-[60] w-[360px] -translate-x-1/2 -translate-y-1/2 border bg-white p-3"
          style={{ borderColor: C.hair, boxShadow: "0 12px 40px rgba(17,21,27,0.12)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.18em]" style={{ color: C.secondary }}>
            ADD RESEARCH ANGLE
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              autoFocus
              value={addAngle}
              onChange={(e) => setAddAngle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && addAngle.trim()) void addDimension(addAngle.trim())
              }}
              placeholder="例如：库存压力 / 海外业务"
              className="min-w-0 flex-1 pb-1 text-[12.5px] outline-none"
              style={{ borderBottom: `1px solid ${C.hair}`, minHeight: 36 }}
            />
            <button
              type="button"
              data-add-submit
              onClick={() => addAngle.trim() && void addDimension(addAngle.trim())}
              className="rounded-[4px] px-3 text-white"
              style={{ background: C.blue, minHeight: 36 }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        /* §E43：所有可见可点对象都有响应；§E44：键盘可达 + focus-visible */
        [data-anchor-id],
        [data-evidence-node],
        [data-ai-send],
        [data-ai-anchor],
        [data-ai-dimlink],
        [data-suggestion],
        [data-suggestion-trigger],
        [data-zoom-in],
        [data-zoom-out],
        [data-zoom-fit],
        [data-zoom-fit-all],
        [data-hit],
        button:not([data-demo-overlay] *) {
          cursor: pointer;
        }
        [data-anchor-id]:hover,
        [data-evidence-node]:hover,
        [data-suggestion]:hover,
        [data-suggestion-trigger]:hover {
          opacity: 0.82;
        }
        [data-anchor-id],
        [data-evidence-node],
        [data-ai-anchor],
        [data-ai-dimlink],
        button {
          transition: opacity 160ms ease;
        }
        :focus-visible {
          outline: 2px solid rgba(47,102,255,0.55);
          outline-offset: 2px;
        }
        @keyframes v5-transition-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes v5-transition-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes v5-scan {
          0% { transform: translateY(-40vh); }
          100% { transform: translateY(120vh); }
        }
        @keyframes v5-placeholder {
          0%, 100% { opacity: 0.32; }
          50% { opacity: 0.72; }
        }
        [data-reveal="out"] { opacity: 0; }
        [data-anchor-id] { transition: opacity 300ms ease; }
        @keyframes v5-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes v5-aperture-in {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes v5-sheet-in {
          from { opacity: 0.4; transform: translateX(3%); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </main>
    {workspaceLab && aiOpen && payload && (
      <ResearchSidekickPanel
        payload={payload}
        width={isMobile ? viewport.width : sidekickWidth}
        mode={sidekickMode}
        turns={sidekickTurns}
        contextItems={sidekickContext}
        input={aiInput}
        status={aiStatus}
        draft={sidekickDraft}
        notice={sidekickNotice ?? aiNotice}
        suggestions={aiSuggestionsFor(aiScope, payload)}
        onWidthChange={setSidekickWidth}
        onClose={() => setAiOpen(false)}
        onModeChange={(mode) => {
          setSidekickMode(mode)
          setSidekickNotice(null)
        }}
        onInputChange={setAiInput}
        onSubmit={submitSidekick}
        onStop={stopAi}
        onSuggestion={setAiInput}
        onEvidence={openEvidenceFromSidekick}
        onDimension={(dimensionId) => {
          const anchor = anchors.find((item) => item.dimensionId === dimensionId)
          if (anchor) openAperture(anchor)
        }}
        onSaveTurn={saveSidekickTurn}
        onConfirmDraft={() => void confirmSidekickDraft()}
        onDiscardDraft={() => {
          setSidekickDraft(null)
          setSidekickNotice(null)
        }}
      />
    )}
      {payload && (
        <ResearchNotesExport payload={payload} open={notesOpen} onClose={() => setNotesOpen(false)} />
      )}
    </div>
  )
}

/** 摘要截断：优先在句读处收束，不留半个括号（§35 可读性） */
function trimSummary(text: string, limit: number): string {
  const cleaned = text.replace(/（[^）]*）\s*$/, "").trim()
  if (cleaned.length <= limit) return cleaned
  const cut = cleaned.slice(0, limit)
  const lastPunct = Math.max(cut.lastIndexOf("，"), cut.lastIndexOf("；"), cut.lastIndexOf("。"))
  const base = lastPunct > limit * 0.45 ? cut.slice(0, lastPunct) : cut
  return `${base}。`
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="6" cy="6" r="4.2" fill="none" stroke={C.secondary} strokeWidth="1.2" />
      <line x1="9.2" y1="9.2" x2="12.4" y2="12.4" stroke={C.secondary} strokeWidth="1.2" />
    </svg>
  )
}
