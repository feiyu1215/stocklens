"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { StockSearchItem } from "@/lib/data/stock-search"
import { Discovery } from "./Discovery"
import { FocusView } from "./FocusView"
import { ResearchWorkspace, type WorkspaceActions } from "./ResearchWorkspace"
import { MyWorldWorkspace } from "./MyWorldWorkspace"
import { PearlFieldRenderer } from "./renderers/pearl"
import { DuskRenderer } from "./renderers/dusk"
import { TerrainRenderer } from "./renderers/terrain"
import { CosmosRenderer } from "./renderers/cosmos"
import type { WorldRenderer } from "./renderers/types"
import { IDENTITY_CAMERA, type CameraState } from "@/lib/spatial/camera"
import {
  loadWorld,
  saveWorld,
  setLastRenderer,
  toggleSavedCompany,
  withExploredDimensions,
  withVisitedCompany,
  worldCompanies,
} from "@/lib/world/my-world"
import type { LocalResearchWorld, WorldRendererId } from "@/lib/world/types"
import { RENDERER_LABELS } from "@/lib/world/types"
import { getCachedSpace, setCachedSpace } from "@/lib/world/session-cache"
import { isResearchSpace } from "@/lib/world/payload-guard"
import {
  INITIAL_EXPERIENCE,
  MOTION,
  breadcrumbSegments,
  shouldShowGlobalError,
  transition,
  type ExperienceEvent,
  type ExperienceState,
  type SemanticLevel,
} from "@/lib/experience/state"
import { contextCommands } from "@/lib/experience/detail"
import { COPY } from "@/lib/experience/copy"
import type { AddedDimensionResult, ObservatoryScene, ResearchSpacePayload } from "./theme"

// Observatory 主控（Architecture §31/§85–§86 + Visual Spec §3–§5/§54–§69）：
//   状态机 DISCOVERY → ASSEMBLING → SPACE_OVERVIEW → DIMENSION_FOCUS
//   常驻：顶部 chrome、底部 Command Lens；overlay：ADD_DIMENSION
//   刷新即重新构建（URL = stockCode + 可选 question；无持久化）。

export function ObservatoryApp({
  initialStockCode,
  fixture,
}: {
  initialStockCode?: string
  fixture?: string
}) {
  const [scene, setScene] = useState<ObservatoryScene>(initialStockCode ? "ASSEMBLING" : "DISCOVERY")
  const [space, setSpace] = useState<ResearchSpacePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(null)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([])
  const [addLensOpen, setAddLensOpen] = useState(false)
  const [addText, setAddText] = useState("")
  const [addStatus, setAddStatus] = useState<"idle" | "submitting" | "unknown" | "ready" | "error" | "redirect">("idle")
  const [addMessage, setAddMessage] = useState<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [rendererId, setRendererId] = useState<WorldRendererId>("terrain")
  // Task 15 §7/§10：语义层级只有一个所有者，组件不得各自决定 transition
  const [experience, setExperience] = useState<ExperienceState>(
    initialStockCode
      ? { level: "company", activeCompany: initialStockCode, transitionSource: "click" }
      : INITIAL_EXPERIENCE,
  )
  /** §26–§29：My World 中被 Explore 的 company object（morph 期间保持可见） */
  const [enteringCompany, setEnteringCompany] = useState<string | null>(null)
  const [experienceDebug, setExperienceDebug] = useState(false)
  /** Company World 的空间 camera（仅用于 debug 面板显示，§99） */
  const [spaceCamera, setSpaceCamera] = useState<CameraState>({ ...IDENTITY_CAMERA })
  const [localWorld, setLocalWorld] = useState<LocalResearchWorld>(() => ({ recentCompanies: [], savedCompanies: [] }))
  const [worldCamera, setWorldCamera] = useState<CameraState>({ ...IDENTITY_CAMERA })
  const [activeCompanyCode, setActiveCompanyCode] = useState<string | null>(null)
  /** Company World 的交互状态提升到这里：切换 renderer 不丢失（Task 14 §56–§57） */
  const [spaceInteractionSeed, setSpaceInteractionSeed] = useState(0)
  const [worldHydrated, setWorldHydrated] = useState(false)
  const [workspaceActions, setWorkspaceActions] = useState<WorkspaceActions | null>(null)
  const [isCompact, setIsCompact] = useState(false)
  const [commandText, setCommandText] = useState("")
  const addInputRef = useRef<HTMLInputElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const [activeStockCode, setActiveStockCode] = useState<string | null>(initialStockCode ?? null)

  const worldLevel: "MY_WORLD" | "COMPANY" = experience.level === "world" ? "MY_WORLD" : "COMPANY"

  const dispatchExperience = useCallback((event: ExperienceEvent) => {
    setExperience((prev) => transition(prev, event))
  }, [])

  /** 面包屑跳级：反向 semantic transition（§24/§107） */
  const jumpToLevel = useCallback((target: SemanticLevel, stockCode?: string) => {
    setExperience((prev) => {
      if (prev.level === target) return prev
      if (target === "world") return transition(prev, { type: "zoom_out" })
      if (target === "company" && prev.level === "world" && stockCode) {
        return transition(prev, { type: "select_company", stockCode, source: "back" })
      }
      let next = prev
      for (let i = 0; i < 4 && next.level !== target; i += 1) next = transition(next, { type: "back" })
      return next
    })
    if (target === "company" || target === "world") {
      setScene("SPACE_OVERVIEW")
      setSelectedDimensionId(null)
    }
  }, [])

  const loadSpace = useCallback(async (stockCode: string) => {
    const cached = getCachedSpace(stockCode)
    if (cached) {
      // 会话内复用，避免重复 LLM 调用（§66）
      setSpace(cached)
      setSpaceInteractionSeed((n) => n + 1)
      setScene("SPACE_OVERVIEW")
      return
    }
    setScene("ASSEMBLING")
    setSpace(null)
    setError(null)
    setSelectedDimensionId(null)
    try {
      const res = await fetch("/api/research/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? `服务返回 ${res.status}`)
        setScene("DISCOVERY")
        return
      }
      const payload: unknown = await res.json()
      if (!isResearchSpace(payload)) {
        setError("研究空间未能建立，请重试。")
        setScene("SPACE_OVERVIEW")
        return
      }
      setCachedSpace(stockCode, payload)
      setSpace(payload)
      setSpaceInteractionSeed((n) => n + 1)
      setScene("SPACE_OVERVIEW")
    } catch {
      setError("研究服务暂时未响应，请重试。")
      setScene("DISCOVERY")
    }
  }, [])

  useEffect(() => {
    if (!fixture) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/observatory/fixture?name=${encodeURIComponent(fixture)}`)
        if (!res.ok) throw new Error(`fixture ${fixture} not found`)
        const payload: unknown = await res.json()
        if (cancelled) return
        if (!isResearchSpace(payload)) {
          setError(`fixture 不可用：${fixture}`)
          setScene("SPACE_OVERVIEW")
          return
        }
        setSpace(payload)
        dispatchExperience({ type: "select_company", stockCode: payload.company.stockCode, source: "click" })
        setScene("SPACE_OVERVIEW")
      } catch {
        if (cancelled) return
        setError(`fixture 不可用：${fixture}`)
        setScene("DISCOVERY")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fixture, dispatchExperience])

  useEffect(() => {
    if (fixture || !initialStockCode) return
    let cancelled = false
    ;(async () => {
      // 异步边界：loadSpace 内部会同步设置 ASSEMBLING 状态
      await Promise.resolve()
      if (!cancelled) await loadSpace(initialStockCode)
    })()
    return () => {
      cancelled = true
    }
  }, [fixture, initialStockCode, loadSpace])

  useEffect(() => {
    if (worldHydrated) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      setLocalWorld(loadWorld())
      setWorldHydrated(true)
    })()
    return () => {
      cancelled = true
    }
  }, [worldHydrated])

  useEffect(() => {
    if (!worldHydrated) return
    saveWorld(localWorld)
  }, [localWorld, worldHydrated])

  useEffect(() => {
    if (!worldHydrated) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (!cancelled) setLocalWorld((w) => (w.lastRenderer === rendererId ? w : setLastRenderer(w, rendererId)))
    })()
    return () => {
      cancelled = true
    }
  }, [rendererId, worldHydrated])

  useEffect(() => {
    if (!worldHydrated) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      const last = localWorld.lastRenderer
      if (!cancelled && last) setRendererId(last)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldHydrated])

  useEffect(() => {
    // ?experienceDebug=1：仅开发/评审用，展示 semantic level 与对象 detail level（§99）
    let cancelled = false
    void (async () => {
      await Promise.resolve() // 异步边界：避免 effect 内同步 setState
      if (cancelled) return
      const params = new URLSearchParams(window.location.search)
      if (params.get("experienceDebug") === "1") setExperienceDebug(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const update = () => setIsCompact(window.innerWidth < 1024)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  // ⌘K / Ctrl+K 打开 Command Lens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((v) => !v)
        setTimeout(() => commandInputRef.current?.focus(), 30)
      }
      if (e.key === "Escape" && commandOpen) setCommandOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [commandOpen])

  useEffect(() => {
    if (!addLensOpen) return
    const timer = setTimeout(() => addInputRef.current?.focus(), 60)
    return () => clearTimeout(timer)
  }, [addLensOpen])

  const rendererById: Record<WorldRendererId, WorldRenderer> = useMemo(
    () => ({
      pearl: PearlFieldRenderer,
      dusk: DuskRenderer,
      terrain: TerrainRenderer,
      cosmos: CosmosRenderer,
    }),
    [],
  )
  const renderer = rendererById[rendererId]

  const globalUnavailable = useMemo(() => {
    if (!space) return false
    return shouldShowGlobalError({
      companyResolved: Boolean(space.company?.stockCode),
      truthAvailable: space.evidence.length > 0,
      aiStatus: space.ai.status,
    })
  }, [space])

  const selectedDimension = useMemo(
    () => space?.dimensions.find((d) => d.dimensionId === selectedDimensionId) ?? null,
    [space, selectedDimensionId],
  )

  const submitAddDimension = async (text: string) => {
    if (!space || text.trim().length === 0) return
    setAddStatus("submitting")
    setAddMessage(null)
    try {
      const res = await fetch("/api/research/dimension", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: space.company.stockCode,
          dimensionText: text.trim(),
          currentDimensions: space.dimensions.map((d) => d.label),
          ...(space.entryQuestion ? { entryQuestion: space.entryQuestion } : {}),
        }),
      })
      const body = (await res.json()) as AddedDimensionResult
      if (body.mode === "compliance_redirect") {
        setAddStatus("redirect")
        setAddMessage(body.compliance?.message ?? "不提供买卖建议。")
        return
      }
      if (!body.dimension) {
        setAddStatus("error")
        setAddMessage("该研究角度暂未加入，请稍后重试。")
        return
      }
      // 新对象以 outline 形式先进入空间（assembling → 结果状态）
      setSpace((prev) =>
        prev
          ? {
              ...prev,
              dimensions: [...prev.dimensions, body.dimension!],
              claims: [...prev.claims, ...body.claims],
              evidence: [
                ...prev.evidence,
                ...body.evidence.filter((e) => !prev.evidence.some((x) => x.evidenceId === e.evidenceId)),
              ],
            }
          : prev,
      )
      setAddStatus(body.dimension.status === "unknown" ? "unknown" : "ready")
      setAddMessage(
        body.dimension.status === "unknown"
          ? "该研究方向当前证据不足——已创建为待验证对象。"
          : "研究角度已加入空间。",
      )
      setAddText("")
      // 保持 Lens 打开以展示结果（ready/unknown 提示），用户自行关闭
    } catch {
      setAddStatus("error")
      setAddMessage("研究服务暂时未响应。")
    }
  }

  const backToWorld = useCallback(() => {
    if (space) {
      setLocalWorld((w) => withExploredDimensions(w, space.company.stockCode, space.dimensions.length))
    }
    dispatchExperience({ type: "zoom_out" })
    setScene("SPACE_OVERVIEW")
  }, [space, dispatchExperience])

  const enterResearch = useCallback(
    (stockCode: string) => {
      const company = worldCompanies(localWorld).find((c) => c.stockCode === stockCode)
      setLocalWorld((w) =>
        withVisitedCompany(
          w,
          {
            stockCode,
            stockName: company?.stockName ?? stockCode,
            ...(company?.industryName ? { industryName: company.industryName } : {}),
          },
          new Date().toISOString(),
        ),
      )
      setActiveStockCode(stockCode)
      setEnteringCompany(stockCode)
      // 先让 company object 完成 morph（760ms），数据在后台并行解析（§61：不产生空白等待）
      void loadSpace(stockCode)
      window.setTimeout(() => {
        setEnteringCompany(null)
        dispatchExperience({ type: "select_company", stockCode, source: "click" })
      }, Number.parseInt(MOTION.companyToCompanyWorld, 10))
    },
    [localWorld, loadSpace, dispatchExperience],
  )

  const commandActions = useMemo(() => {
    if (!space) return []
    const focusedClaim = experience.activeClaim ?? selectedDimension?.claimIds?.[0] ?? null
    const contextual = contextCommands(experience.level).map((spec) => ({
      label: spec.label,
      run: () => {
        setCommandOpen(false)
        switch (spec.id) {
          case "explore_company":
            if (activeCompanyCode) enterResearch(activeCompanyCode)
            break
          case "explore_dimension":
            if (selectedDimensionId) {
              dispatchExperience({ type: "open_dimension", dimensionId: selectedDimensionId, source: "command" })
              setScene("SPACE_OVERVIEW")
            }
            break
          case "open_research":
            if (selectedDimensionId) {
              dispatchExperience({ type: "open_research", dimensionId: selectedDimensionId, source: "command" })
              setScene("DIMENSION_FOCUS")
            }
            break
          case "inspect_evidence":
            if (focusedClaim) {
              dispatchExperience({ type: "select_claim", claimId: focusedClaim, source: "command" })
              setScene("DIMENSION_FOCUS")
            }
            break
          case "return_to_claim":
            dispatchExperience({ type: "clear_evidence", source: "command" })
            setScene("DIMENSION_FOCUS")
            break
          case "add_research_angle":
            setAddLensOpen(true)
            break
          case "search_company":
            setSpace(null)
            setExperience({ ...INITIAL_EXPERIENCE })
            setScene("DISCOVERY")
            break
          default:
            break
        }
      },
    }))
    const spatial = workspaceActions
      ? [
          { label: "Gather", run: () => { setCommandOpen(false); workspaceActions.gather() } },
          { label: "Spread", run: () => { setCommandOpen(false); workspaceActions.spread() } },
          { label: "Fit", run: () => { setCommandOpen(false); workspaceActions.fit() } },
          { label: "Reset layout", run: () => { setCommandOpen(false); workspaceActions.resetLayout() } },
          { label: "Focus selected", run: () => { setCommandOpen(false); workspaceActions.focusSelected() } },
          { label: "Show all", run: () => { setCommandOpen(false); workspaceActions.showAll() } },
          { label: "Collapse summaries", run: () => { setCommandOpen(false); workspaceActions.collapseSummaries() } },
        ]
      : []
    const appearance = [
      ...(["terrain", "cosmos", "pearl"] as WorldRendererId[]).map((id) => ({
        label: `World · ${RENDERER_LABELS[id]}${rendererId === id ? " ✓" : ""}`,
        run: () => {
          setCommandOpen(false)
          setRendererId(id)
        },
      })),
      ...(worldLevel === "COMPANY"
        ? [{ label: "Back to My World", run: () => { setCommandOpen(false); backToWorld() } }]
        : []),
    ]
    return [...contextual, ...spatial, ...appearance]
  }, [
    space,
    selectedDimension,
    selectedDimensionId,
    workspaceActions,
    rendererId,
    worldLevel,
    backToWorld,
    experience,
    activeCompanyCode,
    enterResearch,
    dispatchExperience,
  ])

  const addCompanyToWorld = useCallback((item: StockSearchItem) => {
    setLocalWorld((w) =>
      withVisitedCompany(
        w,
        { stockCode: item.stockCode, stockName: item.stockName, ...(item.market ? {} : {}) },
        new Date().toISOString(),
      ),
    )
    setActiveCompanyCode(item.stockCode)
  }, [])

  const handleSelect = (item: StockSearchItem) => {
    setActiveStockCode(item.stockCode)
    dispatchExperience({ type: "select_company", stockCode: item.stockCode, source: "click" })
    void loadSpace(item.stockCode)
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        background: renderer.tokens.light
          ? "radial-gradient(1200px 640px at 50% 38%, #F6F5F1 0%, #EFEEE9 68%)"
          : `radial-gradient(1200px 640px at 50% 38%, #14171F 0%, ${renderer.tokens.background} 68%)`,
        color: renderer.tokens.textPrimary,
      }}
    >
      {/* Global Chrome（§4） */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => {
            setScene("SPACE_OVERVIEW")
            setSpace(null)
            setSelectedDimensionId(null)
            setError(null)
            setExperience({ ...INITIAL_EXPERIENCE })
          }}
          className="pointer-events-auto font-mono text-[12px] tracking-[0.34em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
          style={{
            color: scene === "DIMENSION_FOCUS"
              ? "#676A70"
              : renderer.tokens.light
                ? "#5C6068"
                : "#A6AEC0",
          }}
        >
          STOCKLENS
        </button>
        {space && worldLevel === "COMPANY" && scene !== "DIMENSION_FOCUS" && (
          <nav
            aria-label="Semantic location"
            className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-2 font-mono text-[11px]"
            style={{ color: renderer.tokens.textSecondary }}
          >
            {breadcrumbSegments(experience, {
              company: space.company.stockName,
              dimension: space.dimensions.find((d) => d.dimensionId === experience.activeDimension)?.label,
              claim: experience.activeClaim
                ? (space.claims.find((c) => c.claimId === experience.activeClaim)?.text ?? "").slice(0, 26)
                : undefined,
            }).map((seg, i) => (
              <span key={`${seg.level}-${i}`} className="flex items-center gap-2">
                {i > 0 && <span style={{ opacity: 0.45 }}>/</span>}
                <button
                  type="button"
                  onClick={() => jumpToLevel(seg.level, space.company.stockCode)}
                  className="transition hover:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
                  style={{ color: i === 0 ? renderer.tokens.textPrimary : renderer.tokens.textSecondary }}
                >
                  {seg.label}
                </button>
              </span>
            ))}
          </nav>
        )}

        {space && scene !== "DIMENSION_FOCUS" && worldLevel === "COMPANY" && (
          <div
            className="pointer-events-auto flex items-center gap-3 rounded-full border border-[#2A3040] bg-[#12161F]/85 px-4 py-1.5 backdrop-blur"
            title={space.company.industryName ? `所属行业：${space.company.industryName}` : undefined}
          >
            <span className="text-[13px] text-[#F1F3F5]">{space.company.stockName}</span>
            <span className="font-mono text-[11.5px] text-[#A6AEC0]">{space.company.stockCode}</span>
          </div>
        )}
      </header>

      {/* Scenes */}
      <div className="absolute inset-0">
        {worldLevel === "MY_WORLD" && (
          <MyWorldWorkspace
            renderer={renderer}
            companies={worldCompanies(localWorld)}
            activeCode={activeCompanyCode}
            camera={worldCamera}
            onCameraChange={setWorldCamera}
            onActiveChange={setActiveCompanyCode}
            onEnterResearch={enterResearch}
            onToggleSaved={(code) => setLocalWorld((w) => toggleSavedCompany(w, code))}
            onAddCompany={addCompanyToWorld}
            enteringCode={enteringCompany}
          />
        )}

        {worldLevel === "COMPANY" && scene === "DISCOVERY" && (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-[720px] w-full max-w-[1100px]">
              {error && (
                <div className="mx-auto mb-4 w-fit rounded-lg border border-[#F06B5E]/40 bg-[#F06B5E]/10 px-4 py-2 text-[12px] text-[#F06B5E]">
                  {error}
                </div>
              )}
              <Discovery onSelect={handleSelect} onOpenCompany={(code) => handleSelect({ stockCode: code, stockName: code })} />
            </div>
          </div>
        )}

        {worldLevel === "COMPANY" && scene === "ASSEMBLING" && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-6">
            {activeStockCode && (
              <div
                className="flex h-[200px] w-[200px] flex-col items-center justify-center rounded-full border border-[#232838]"
                style={{
                  background: "radial-gradient(circle, rgba(69,184,255,0.10) 0%, rgba(14,17,24,0.9) 64%)",
                  animation: "observatory-zoom 600ms cubic-bezier(0.22,1,0.36,1)",
                }}
              >
                <span className="font-mono text-[12px] text-[#8C94A8]">{activeStockCode}</span>
              </div>
            )}
            <div className="text-[12px] text-[#8C94A8]">{COPY.resolvingRegions}</div>
            {/* 抽象场：模糊 dots + 网格，不代表真实 Evidence（§16） */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(rgba(140,148,168,0.10) 1px, transparent 1px), radial-gradient(rgba(140,148,168,0.05) 1px, transparent 1px)",
                backgroundSize: "60px 60px, 23px 23px",
                maskImage: "radial-gradient(circle at center, black 22%, transparent 70%)",
                WebkitMaskImage: "radial-gradient(circle at center, black 22%, transparent 70%)",
                filter: "blur(1px)",
                animation: "observatory-breathe 5200ms ease-in-out infinite",
              }}
            />
          </div>
        )}

        {worldLevel === "COMPANY" && !space && error && (
          <div className="flex h-full w-full items-center justify-center">
            <div className="max-w-[420px] border-t border-[#2A3040] px-5 pt-4 text-center">
              <div className="text-[13px] text-[#F1F3F5]">{error}</div>
              <div className="mt-1 text-[11.5px] text-[#8C94A8]">数据不可用时不会生成任何结论。</div>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setSpace(null)
                  setExperience({ ...INITIAL_EXPERIENCE })
                  setScene("SPACE_OVERVIEW")
                }}
                className="mt-3 rounded-md border border-[#2A3040] px-3 py-1.5 text-[11.5px] text-[#F1F3F5] transition hover:bg-white/5"
              >
                回到 My World
              </button>
            </div>
          </div>
        )}

        {worldLevel === "COMPANY" && scene === "SPACE_OVERVIEW" && space && globalUnavailable && (
          <div className="flex h-full w-full items-center justify-center">
            <div className="max-w-[420px] border-t border-[#2A3040] px-5 pt-4 text-center">
              <div className="text-[13px] text-[#F1F3F5]">{COPY.worldUnavailable}</div>
              <div className="mt-1 text-[11.5px] text-[#8C94A8]">
                没有可用证据时不会生成任何结论。
              </div>
              <button
                type="button"
                onClick={() => {
                  setExperience({ ...INITIAL_EXPERIENCE })
                  setScene("DISCOVERY")
                  setSpace(null)
                }}
                className="mt-3 rounded-md border border-[#2A3040] px-3 py-1.5 text-[11.5px] text-[#F1F3F5] transition hover:bg-white/5"
              >
                Search another company
              </button>
            </div>
          </div>
        )}

        {worldLevel === "COMPANY" && scene === "SPACE_OVERVIEW" && space && !globalUnavailable && !isCompact && (
          <ResearchWorkspace
            key={`${space.company.stockCode}:${spaceInteractionSeed}`}
            space={space}
            renderer={renderer}
            onOpenDimension={(id) => {
              setSelectedDimensionId(id)
              dispatchExperience({ type: "open_research", dimensionId: id, source: "click" })
              setScene("DIMENSION_FOCUS")
            }}
            onAddDimension={() => setAddLensOpen(true)}
            onSuggestionAdd={(label) => void submitAddDimension(label)}
            onSuggestionDismiss={(label) => setDismissedSuggestions((prev) => [...prev, label])}
            dismissedSuggestions={dismissedSuggestions}
            addLensOpen={addLensOpen}
            registerActions={setWorkspaceActions}
            semanticState={experience}
            onSemanticEvent={dispatchExperience}
            onCameraSample={setSpaceCamera}
          />
        )}

        {worldLevel === "COMPANY" && scene === "SPACE_OVERVIEW" && space && !globalUnavailable && isCompact && (
          <div className="flex h-full w-full flex-col justify-center gap-4 overflow-x-auto px-5">
            <div className="text-center">
              <div className="text-[18px] font-medium" style={{ color: "#F1F3F5" }}>{space.company.stockName}</div>
              <div className="mt-1 font-mono text-[11.5px] text-[#8C94A8]">{space.company.stockCode}{space.company.industryName ? ` · ${space.company.industryName}` : ""}</div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {space.dimensions.map((d) => (
                <button
                  key={d.dimensionId}
                  type="button"
                  onClick={() => {
                    setSelectedDimensionId(d.dimensionId)
                    dispatchExperience({ type: "open_research", dimensionId: d.dimensionId, source: "click" })
                    setScene("DIMENSION_FOCUS")
                  }}
                  className="min-w-[160px] shrink-0 rounded-xl border border-[#232838] bg-[#12161F]/85 px-3.5 py-3 text-left"
                >
                  <div className="text-[14px] text-[#F1F3F5]" style={{ wordBreak: "keep-all" }}>{d.label}</div>
                  <div className="mt-1 text-[11px] text-[#8C94A8]">{d.evidenceIds.length} evidence</div>
                </button>
              ))}
            </div>
            <div className="text-center text-[11px] text-[#6C7488]">点击维度进入研究面</div>
          </div>
        )}

        {worldLevel === "COMPANY" && scene === "DIMENSION_FOCUS" && space && selectedDimension && (
          <FocusView
            space={space}
            dimension={selectedDimension}
            metrics={space.metrics}
            activeClaimId={experience.activeClaim ?? null}
            activeEvidenceId={experience.activeEvidence ?? null}
            onClaimFocus={(claimId) =>
              dispatchExperience({ type: "select_claim", claimId, source: "click" })
            }
            onEvidenceFocus={(evidenceId, claimId) => {
              dispatchExperience({ type: "select_claim", claimId, source: "click" })
              dispatchExperience({ type: "select_evidence", evidenceId, source: "click" })
            }}
            onReturnToClaim={() => dispatchExperience({ type: "clear_evidence", source: "back" })}
            onBack={() => {
              dispatchExperience({ type: "back" })
              setScene("SPACE_OVERVIEW")
            }}
          />
        )}
      </div>

      {/* Add Dimension Lens（§54–§60：在原位置扩张，不是中央 Modal） */}
      {addLensOpen && space && (
        <div className="absolute right-10 top-24 z-40 w-[360px]">
          <div
            className="rounded-2xl border border-[#232838] p-4 backdrop-blur"
            style={{
              background: "rgba(14,17,24,0.92)",
              animation: "observatory-expand 360ms cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            <label htmlFor="add-dimension" className="text-[12px] text-[#F1F3F5]">
              What else do you want to understand?
            </label>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void submitAddDimension(addText)
              }}
            >
              <input
                id="add-dimension"
                ref={addInputRef}
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                maxLength={60}
                placeholder="例如：库存压力 / 分红能力 / 海外业务"
                className="min-w-0 flex-1 rounded-lg border border-[#232838] bg-[#07090E] px-3 py-2 text-[12.5px] text-[#F1F3F5] outline-none focus:border-[#45B8FF]/60 focus:ring-2 focus:ring-[#45B8FF]/20"
              />
              <button
                type="submit"
                disabled={addStatus === "submitting" || addText.trim().length === 0}
                className="rounded-lg bg-[#45B8FF] px-3 py-2 text-[12px] font-medium text-[#06121B] transition hover:opacity-90 disabled:opacity-40"
              >
                {addStatus === "submitting" ? "…" : "Add"}
              </button>
            </form>

            <div className="mt-3">
              <div className="font-mono text-[10px] tracking-wider text-[#5A6274]">StockLens suggests</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {space.suggestions.slice(0, 4).map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => void submitAddDimension(s.label)}
                    className="rounded-full border border-[#232838] px-2.5 py-1 text-[11px] text-[#8C94A8] transition hover:border-[#45B8FF]/50 hover:text-[#F1F3F5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {addMessage && (
              <div
                className="mt-3 rounded-lg border px-3 py-2 text-[11.5px] leading-relaxed"
                style={
                  addStatus === "unknown" || addStatus === "redirect"
                    ? { borderColor: "rgba(234,185,95,0.5)", background: "rgba(234,185,95,0.08)", color: "#EAB95F" }
                    : addStatus === "error"
                      ? { borderColor: "rgba(240,107,94,0.5)", background: "rgba(240,107,94,0.08)", color: "#F06B5E" }
                      : { borderColor: "rgba(69,184,255,0.4)", background: "rgba(69,184,255,0.08)", color: "#45B8FF" }
                }
              >
                {addMessage}
              </div>
            )}

            <button
              type="button"
              onClick={() => setAddLensOpen(false)}
              className="mt-3 text-[11px] text-[#5A6274] transition hover:text-[#8C94A8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/50"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* Bottom Command Lens（§5/§66–§70） */}
      {scene !== "DISCOVERY" && (
        <div className="absolute bottom-7 left-1/2 z-40 -translate-x-1/2">
          {!commandOpen ? (
            <button
              type="button"
              onClick={() => {
                setCommandOpen(true)
                setTimeout(() => commandInputRef.current?.focus(), 30)
              }}
              className="flex h-[48px] w-[500px] items-center gap-3.5 rounded-full border px-5 backdrop-blur transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
              style={{
                background: "rgba(18,22,31,0.88)",
                borderColor: "rgba(58,65,86,0.9)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
              }}
              aria-label="打开命令面板（Command Lens）"
            >
              <span className="font-mono text-[12px] text-[#A6AEC0]">⌘K</span>
              <span className="text-[13px] text-[#8C94A8]">{`Ask · Explore · Add`}</span>
            </button>
          ) : (
            <div
              className="w-[520px] rounded-2xl border border-[#232838] p-3 backdrop-blur"
              style={{ background: "rgba(14,17,24,0.95)", animation: "observatory-expand 220ms ease-out" }}
            >
              <input
                ref={commandInputRef}
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCommandOpen(false)
                }}
                placeholder="Ask · Focus · Add — 输入或选择动作"
                aria-label="Command Lens"
                className="w-full rounded-lg border border-[#232838] bg-[#07090E] px-3 py-2 text-[12.5px] text-[#F1F3F5] outline-none focus:border-[#45B8FF]/60"
              />
              <ul className="mt-2 space-y-1">
                {commandActions
                  .filter((a) => commandText.trim().length === 0 || a.label.toLowerCase().includes(commandText.toLowerCase()))
                  .map((a) => (
                    <li key={a.label}>
                      <button
                        type="button"
                        onClick={a.run}
                        className="w-full rounded-lg px-3 py-2 text-left text-[12.5px] text-[#F1F3F5] transition hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/50"
                      >
                        {a.label}
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {experienceDebug && (
        <div
          className="pointer-events-none absolute bottom-24 right-6 z-40 rounded border border-[#2A3040] px-3 py-2 font-mono text-[10px] leading-relaxed text-[#8C94A8]"
          style={{ background: "rgba(10,12,17,0.9)" }}
        >
          <div>semanticLevel: {experience.level}</div>
          <div>company: {experience.activeCompany ?? "—"}</div>
          <div>dimension: {experience.activeDimension ?? "—"}</div>
          <div>claim: {experience.activeClaim ?? "—"}</div>
          <div>evidence: {experience.activeEvidence ?? "—"}</div>
          <div>renderer: {rendererId}</div>
          <div>
            camera:{" "}
            {(worldLevel === "COMPANY" ? spaceCamera.scale : worldCamera.scale).toFixed(2)} @{" "}
            {Math.round(worldLevel === "COMPANY" ? spaceCamera.x : worldCamera.x)},
            {Math.round(worldLevel === "COMPANY" ? spaceCamera.y : worldCamera.y)}
          </div>
          <div>objectDetail: {spaceCamera.scale < 0.8 ? "micro" : spaceCamera.scale >= 1.15 ? "expanded-capable" : "compact"}</div>
          <div>transitionSource: {experience.transitionSource}</div>
        </div>
      )}

      <style jsx global>{`
        @keyframes observatory-zoom {
          from { transform: scale(0.86); opacity: 0.4; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes observatory-breathe {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
        @keyframes observatory-recede {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes observatory-morph-outward {
          from { transform: scale(0.34); opacity: 0.9; }
          to { transform: scale(1.34); opacity: 0; }
        }
        @keyframes observatory-hold {
          0% { opacity: 0; transform: translateY(8px); }
          24% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0.9; }
        }
        @keyframes observatory-expand {
          from { transform: scale(0.96) translateY(6px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
        }
      `}</style>
    </div>
  )
}
