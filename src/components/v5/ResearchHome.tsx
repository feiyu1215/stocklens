"use client"

import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { WipeLink, useRouteWipe } from "@/components/v5/RouteWipe"
import StockLensMark from "@/components/v5/StockLensMark"
import AssistantPanel from "@/components/v5/AssistantPanel"
import type { PlannedAction } from "@/lib/v5/assistant/capabilities"
import {
  ensureShelfMigrated,
  cleanupOldestCachedResearch,
  getLastStorageEviction,
  getLastStorageFailure,
  isSaved,
  loadLibrary,
  loadRecent,
  loadSaved,
  mergeLibraryCompanies,
  onStorageEviction,
  onStorageFailure,
  saveLibrary,
  searchCompanies,
  type SavedCompany,
  type StorageEviction,
  type StorageFailure,
} from "@/lib/v5/shelf"
import { HOME_HREF, RESEARCH_LIBRARY_HREF } from "@/lib/v5/routes"

const SAMPLE: SavedCompany = {
  stockCode: "000333.SZ",
  name: "美的集团",
  industry: "白色家电",
  savedAt: 0,
  lastVisitedAt: 0,
  dimensionCount: 7,
  evidenceCount: 38,
  aiStatus: "success",
}

type Locale = "zh" | "en"
type HomeSurface = "start" | "library"
type TouchSwitchState = {
  y: number
  canMoveForward: boolean
  canMoveBack: boolean
}

const COPY = {
  zh: {
    library: "研究库",
    sampleCanvas: "打开示例画布 →",
    eyebrow: "RESEARCH STARTS WITH A COMPANY",
    title: <>今天想研究哪家公司？</>,
    newResearch: "NEW RESEARCH",
    chooseAgain: "重新选择 ×",
    companySearch: "搜索公司 / 股票代码",
    searching: "SEARCHING…",
    emptyTitle: "没有匹配的 A 股",
    emptyScope: "检索范围",
    emptyMarkets: ["沪", "深", "北"],
    emptyNote: "仅 A 股，港股 / 美股不在覆盖内",
    storageLocal: "仅保存在本机",
    storageFailTitle: "本次研究没有写进本机存储",
    storageFailQuota: "本机存储空间已满。已自动清理最旧的缓存研究来腾空间；如果仍然失败，请点击下方按钮再清一轮。研究库里的公司记录不会丢失。",
    storageFailOther: "本机存储不可用（可能处于隐私模式），这次研究不会被保存。",
    storageCleanupAction: "清理旧研究缓存",
    storageCleaning: "正在清理…",
    storageEvictionNotice: "为腾出空间，已自动清理最旧的缓存研究（研究库里的公司记录保留，重新打开会重新生成）",
    question: "可选：你最想先回答什么？",
    quickQuestions: ["当前经营韧性如何？", "现金转化与分红能力如何？", "估值与行业相对定价如何？"],
    sample: "先看美的示例",
    enter: "进入研究空间",
    libraryEyebrow: "RESEARCH LIBRARY",
    matrix: "你的公司研究矩阵",
    matrixNote: "每次进入画布都会自动入库；“最近”只影响快捷列表，不再把旧研究挤出去。",
    columns: ["公司", "子行业", "研究维度", "证据", "研究状态", "最近研究", ""],
    sampleStatus: "可体验示例",
    sampleHint: "当前显示录制示例。完成第一次公司研究后，它会自动被真实记录取代。",
    unknownIndustry: "待识别",
    browseMatrix: "查看公司研究矩阵",
    backToResearch: "返回新研究",
    filterLibrary: "搜索研究库中的公司 / 代码",
    emptyLibrary: "没有匹配的公司研究",
    compareToggle: "对比",
    compareStart: "开始对比 →",
    compareExit: "退出对比",
    comparePick: "点选两家公司（已选 0/2）",
    comparePickOne: "点选两家公司（已选 1/2）",
    compareMaxHint: "最多选择两家，点击已选可取消",
  },
  en: {
    library: "Library",
    sampleCanvas: "Open sample canvas →",
    eyebrow: "RESEARCH STARTS WITH A COMPANY",
    title: <>Which company are you researching?</>,
    newResearch: "NEW RESEARCH",
    chooseAgain: "Choose again ×",
    companySearch: "Search company / ticker",
    searching: "SEARCHING…",
    emptyTitle: "No A-share match",
    emptyScope: "Scope",
    emptyMarkets: ["SH", "SZ", "BJ"],
    emptyNote: "A-shares only; HK / US listings are out of scope",
    storageLocal: "Stored on this device only",
    storageFailTitle: "This research was not saved to local storage",
    storageFailQuota: "Device storage is full. The oldest cached research was cleared automatically to make room; if it still fails, clear more with the button below. Your library entries are kept.",
    storageFailOther: "Local storage is unavailable (possibly private mode); this research won't be saved.",
    storageCleanupAction: "Clear old research caches",
    storageCleaning: "Clearing…",
    storageEvictionNotice: "Oldest cached research was cleared automatically to make room. Library entries are kept; reopening a company regenerates its research.",
    question: "Optional: what do you want to answer first?",
    quickQuestions: ["How resilient are current operations?", "How strong are cash conversion and dividends?", "How does valuation compare with the industry?"],
    sample: "Explore the Midea sample",
    enter: "Enter research space",
    libraryEyebrow: "RESEARCH LIBRARY",
    matrix: "Your company research matrix",
    matrixNote: "Every opened canvas is saved here. Recent activity never removes older research.",
    columns: ["Company", "Subsector", "Angles", "Evidence", "Status", "Last research", ""],
    sampleStatus: "Interactive sample",
    sampleHint: "A recorded sample is shown until your first company research is created.",
    unknownIndustry: "Unclassified",
    browseMatrix: "Browse company research",
    backToResearch: "Back to new research",
    filterLibrary: "Search the library by company or ticker",
    emptyLibrary: "No matching company research",
    compareToggle: "Compare",
    compareStart: "Start compare →",
    compareExit: "Exit compare",
    comparePick: "Pick two companies (0/2 selected)",
    comparePickOne: "Pick two companies (1/2 selected)",
    compareMaxHint: "Two companies max; click a selected one to deselect",
  },
} as const

type SearchResult = { stockCode: string; stockName: string }

function workspaceHref(stockCode: string, question = "", recordedSample = false, resume = false) {
  const params = new URLSearchParams({ stockCode })
  if (!recordedSample) params.set("live", "1")
  if (question.trim()) params.set("q", question.trim())
  if (resume) params.set("resume", "1")
  return `/lab/ai-workspace-v1?${params.toString()}`
}

function dateLabel(timestamp?: number) {
  if (!timestamp) return "录制示例"
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp))
}

function statusLabel(status: SavedCompany["aiStatus"] | undefined, locale: Locale) {
  if (status === "success") return { label: locale === "zh" ? "证据就绪" : "Evidence ready", color: "#2F66FF" }
  if (status === "partial_failure") return { label: locale === "zh" ? "部分完成" : "Partial", color: "#B4802A" }
  if (status === "failed") return { label: locale === "zh" ? "待重试" : "Retry needed", color: "#D9534F" }
  return { label: locale === "zh" ? "已访问" : "Visited", color: "#6D7480" }
}

export default function ResearchHome({ initialSurface = "start" }: { initialSurface?: HomeSurface }) {
  const pathname = usePathname()
  const router = useRouter()
  // 移动端首次进入 → 直接落到示例研究空间（产品决策：手机上首页/研究库不是第一印象，
  // 能跑起来的研究才是）。标记是设备本地的：之后从画布回首页/研究库不会再被打断。
  // 放在 useEffect 里用路由软导航：渲染期 window.location.replace 在文档初始加载阶段
  // 会被浏览器静默丢弃（实测复现过），软导航不受影响。
  useEffect(() => {
    try {
      if (!window.matchMedia("(max-width: 767px)").matches) return
      const key = "stocklens.entry.mobile.v1"
      if (window.localStorage.getItem(key)) return
      window.localStorage.setItem(key, String(Date.now()))
      // 与「先看美的示例」同一目的地：录制示例，秒开，不触发真实 API 研究
      router.replace(workspaceHref(SAMPLE.stockCode, "", true, false))
    } catch {
      // 隐私模式下 localStorage 不可用：不跳转，正常显示首页
    }
  }, [router])
  const [library, setLibrary] = useState<SavedCompany[]>([])
  const [saved, setSaved] = useState<SavedCompany[]>([])
  // 阶段 1（P1-1）：存储写失败必须可见——以前是静默吞掉，用户以为存了其实没存。
  const [storageFailure, setStorageFailure] = useState<StorageFailure | null>(() => getLastStorageFailure())
  // 自动腾空间的记录：让用户知道"为了保存，清理了什么"，而不是偷偷删。
  const [eviction, setEviction] = useState<StorageEviction | null>(() => getLastStorageEviction())
  const [cleaning, setCleaning] = useState(false)
  const [cleanedCount, setCleanedCount] = useState<number | null>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [question, setQuestion] = useState("")
  const [libraryQuery, setLibraryQuery] = useState("")
  // 双公司对比 P0（docs/plans/2026-10-08-双公司对比-P0-PRD.md）：
  // 对比模式是显式开关，默认关闭；开启后行变成多选（最多两家），默认导航行为不变。
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState<string[]>([])
  // P1 AI 助手：页面级显式入口（非常驻悬浮球）；动作由页面侧 ActionExecutor 执行
  const [assistantOpen, setAssistantOpen] = useState(false)
  // 语言开关已下线：研究空间内所有文案仍是中文，保留半套 EN 会被当成 bug。
  // COPY.en 与 statusLabel 的 locale 参数刻意保留，作为后续做完整 i18n 的底稿。
  const locale: Locale = "zh"
  const copy = COPY[locale]
  const [surface, setSurface] = useState<HomeSurface>(initialSurface)
  const [transitionToken, setTransitionToken] = useState(0)
  const surfaceRef = useRef<HomeSurface>(initialSurface)
  const switchLockRef = useRef(false)
  const switchTimerRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const wheelResetTimerRef = useRef<number | null>(null)
  const startPanelRef = useRef<HTMLElement>(null)
  const libraryPanelRef = useRef<HTMLElement>(null)
  const touchSwitchRef = useRef<TouchSwitchState | null>(null)

  const goToSurface = useCallback((next: HomeSurface) => {
    if (typeof window === "undefined" || surfaceRef.current === next || switchLockRef.current) return

    switchLockRef.current = true
    wheelDeltaRef.current = 0
    if (wheelResetTimerRef.current !== null) {
      window.clearTimeout(wheelResetTimerRef.current)
      wheelResetTimerRef.current = null
    }
    surfaceRef.current = next
    setSurface(next)
    setTransitionToken((token) => token + 1)

    const destination = next === "library"
      ? `${window.location.pathname}${window.location.search}#research-library`
      : `${window.location.pathname}${window.location.search}`
    window.history.replaceState(window.history.state, "", destination)

    if (switchTimerRef.current !== null) window.clearTimeout(switchTimerRef.current)
    switchTimerRef.current = window.setTimeout(() => {
      switchLockRef.current = false
      switchTimerRef.current = null
    }, 860)
  }, [])

  const wipeTo = useRouteWipe()

  const openStart = useCallback(() => {
    if (pathname === "/research") {
      wipeTo(HOME_HREF)
      return
    }
    goToSurface("start")
  }, [goToSurface, pathname, wipeTo])

  const openLibrary = useCallback(() => {
    if (pathname === "/research") return
    goToSurface("library")
  }, [goToSurface, pathname])

  // 订阅存储失败与自动清理：任何一次写入失败/淘汰都要让用户看见，而不是假装成功。
  useEffect(() => onStorageFailure(setStorageFailure), [])
  useEffect(() => onStorageEviction(setEviction), [])

  const runCleanup = useCallback(async () => {
    setCleaning(true)
    try {
      const keys = await cleanupOldestCachedResearch()
      setCleanedCount(keys.length)
      if (keys.length > 0) setStorageFailure(null)
    } finally {
      setCleaning(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      await ensureShelfMigrated()
      if (cancelled) return
      const savedCompanies = await loadSaved()
      const merged = mergeLibraryCompanies(await loadLibrary(), savedCompanies, await loadRecent())
      if (cancelled) return
      setSaved(savedCompanies)
      setLibrary(merged)
      await saveLibrary(merged)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const locationSurface: HomeSurface = window.location.hash === "#research-library" ? "library" : initialSurface
    surfaceRef.current = locationSurface
    const initialFrame = locationSurface === initialSurface
      ? null
      : window.requestAnimationFrame(() => setSurface(locationSurface))

    const onHashChange = () => {
      const next: HomeSurface = window.location.hash === "#research-library" ? "library" : "start"
      if (surfaceRef.current !== next) goToSurface(next)
    }
    window.addEventListener("hashchange", onHashChange)
    return () => {
      window.removeEventListener("hashchange", onHashChange)
      if (initialFrame !== null) window.cancelAnimationFrame(initialFrame)
      if (switchTimerRef.current !== null) window.clearTimeout(switchTimerRef.current)
      if (wheelResetTimerRef.current !== null) window.clearTimeout(wheelResetTimerRef.current)
    }
  }, [goToSurface, initialSurface])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return

      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault()
        openLibrary()
      }
      if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home") {
        event.preventDefault()
        openStart()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openLibrary, openStart])

  useEffect(() => {
    if (selected || query.trim().length < 1) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      void searchCompanies(query).then((items) => {
        if (cancelled) return
        setResults(items)
        setSearching(false)
      })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, selected])

  const rows = useMemo(() => {
    const source = library.length > 0 ? library : [SAMPLE]
    const needle = libraryQuery.trim().toLowerCase()
    if (!needle) return source
    return source.filter((company) =>
      `${company.name} ${company.stockCode} ${company.industry ?? ""}`.toLowerCase().includes(needle),
    )
  }, [library, libraryQuery])
  const choose = (result: SearchResult) => {
    setSelected(result)
    setQuery(result.stockName)
    setResults([])
    setSearching(false)
  }
  const openSelected = () => {
    if (!selected) return
    wipeTo(workspaceHref(selected.stockCode, question, false, library.some((item) => item.stockCode === selected.stockCode)))
  }
  const toggleCompareRow = (stockCode: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(stockCode)) return prev.filter((code) => code !== stockCode)
      // 已满两家：忽略第三次点击（按钮 aria-pressed 状态让用户知道当前选择）
      if (prev.length >= 2) return prev
      return [...prev, stockCode]
    })
  }
  const exitCompareMode = () => {
    setCompareMode(false)
    setCompareSelection([])
  }
  const startCompare = () => {
    if (compareSelection.length !== 2) return
    wipeTo(`/research/compare?stocks=${compareSelection.join(",")}`)
  }
  const compareSelectedNames = compareSelection
    .map((code) => library.find((item) => item.stockCode === code)?.name ?? code)

  // P1 ActionExecutor：只执行能力白名单内的动作；参数在能力注册表里声明，这里做最终校验
  const executeAssistantAction = useCallback(
    (action: PlannedAction) => {
      switch (action.action) {
        case "navigate.home":
          setAssistantOpen(false)
          wipeTo(HOME_HREF)
          break
        case "navigate.library":
          setAssistantOpen(false)
          wipeTo(RESEARCH_LIBRARY_HREF)
          break
        case "navigate.compare":
          if (action.stockCodes?.length === 2) {
            setAssistantOpen(false)
            wipeTo(`/research/compare?stocks=${action.stockCodes.map((c) => c.stockCode).join(",")}`)
          }
          break
        case "company.open":
          if (action.stockCode) {
            setAssistantOpen(false)
            wipeTo(workspaceHref(action.stockCode, "", false, true))
          }
          break
        case "search.focus": {
          setAssistantOpen(false)
          if (surfaceRef.current === "library") goToSurface("start")
          window.setTimeout(() => document.getElementById("research-company")?.focus(), 60)
          break
        }
        default:
          break
      }
    },
    [wipeTo, goToSurface],
  )

  // ⌘K / Ctrl+K：画布的 ⌘K 绑定的是 AI Lens（画布路由内），首页/研究库路由互不冲突
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setAssistantOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
  const hasSampleResearch = library.some((item) => item.stockCode === SAMPLE.stockCode)

  return (
    <main
      data-research-home
      data-surface={surface}
      className="relative h-screen overflow-hidden bg-[#F5F7FA] text-[#11151B]"
      onWheel={(event) => {
        if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
        const activePanel = surfaceRef.current === "library" ? libraryPanelRef.current : startPanelRef.current
        if (!activePanel) return
        const atTop = activePanel.scrollTop <= 2
        const atBottom = activePanel.scrollTop + activePanel.clientHeight >= activePanel.scrollHeight - 2
        const canMoveForward = event.deltaY > 0 && surfaceRef.current === "start" && atBottom
        const canMoveBack = event.deltaY < 0 && surfaceRef.current === "library" && atTop

        if (!canMoveForward && !canMoveBack) {
          wheelDeltaRef.current = 0
          if (wheelResetTimerRef.current !== null) {
            window.clearTimeout(wheelResetTimerRef.current)
            wheelResetTimerRef.current = null
          }
          return
        }

        const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? activePanel.clientHeight : 1
        const delta = event.deltaY * multiplier
        if (wheelDeltaRef.current !== 0 && Math.sign(wheelDeltaRef.current) !== Math.sign(delta)) {
          wheelDeltaRef.current = 0
        }
        wheelDeltaRef.current += delta

        if (wheelResetTimerRef.current !== null) window.clearTimeout(wheelResetTimerRef.current)
        wheelResetTimerRef.current = window.setTimeout(() => {
          wheelDeltaRef.current = 0
          wheelResetTimerRef.current = null
        }, 220)

        if (Math.abs(wheelDeltaRef.current) < 64) return
        event.preventDefault()
        if (canMoveForward) openLibrary()
        else openStart()
      }}
      onTouchStart={(event) => {
        const activePanel = surfaceRef.current === "library" ? libraryPanelRef.current : startPanelRef.current
        const touch = event.touches[0]
        if (!activePanel || !touch) return
        touchSwitchRef.current = {
          y: touch.clientY,
          canMoveForward: activePanel.scrollTop + activePanel.clientHeight >= activePanel.scrollHeight - 2,
          canMoveBack: activePanel.scrollTop <= 2,
        }
      }}
      onTouchEnd={(event) => {
        const start = touchSwitchRef.current
        const touch = event.changedTouches[0]
        touchSwitchRef.current = null
        if (!start || !touch) return
        const distance = start.y - touch.clientY
        if (distance > 58 && start.canMoveForward && surfaceRef.current === "start") openLibrary()
        if (distance < -58 && start.canMoveBack && surfaceRef.current === "library") openStart()
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-transform duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(17,21,27,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(17,21,27,0.028) 1px, transparent 1px)",
          backgroundSize: "120px 120px",
          maskImage: "radial-gradient(110% 90% at 50% 30%, black 40%, transparent 100%)",
          transform: surface === "library" ? "translateY(-18px)" : "translateY(0)",
        }}
      />

      <header className="absolute inset-x-0 top-0 z-40 flex h-[74px] items-center justify-between border-b border-black/10 bg-[#F5F7FA]/90 px-5 backdrop-blur-md sm:px-9">
        <button
          type="button"
          data-home-nav
          aria-label={locale === "zh" ? "返回首页" : "Back to home"}
          aria-current={surface === "start" ? "page" : undefined}
          onClick={openStart}
          className="group flex items-center gap-3 text-[#11151B]"
        >
          <StockLensMark size={31} decorative />
          <span className="relative font-mono text-[11px] font-semibold tracking-[0.32em]">
            STOCKLENS
            <span
              aria-hidden
              className="absolute -bottom-2 left-0 h-px bg-[#2F66FF] transition-[width,opacity] duration-500"
              style={{ width: surface === "start" ? "100%" : "0%", opacity: surface === "start" ? 1 : 0 }}
            />
          </span>
        </button>
        <div className="flex items-center gap-3 font-mono text-[9.5px] tracking-[0.1em] text-[#6D7480] sm:gap-5">
          <button
            type="button"
            data-library-nav
            aria-current={surface === "library" ? "page" : undefined}
            onClick={openLibrary}
            className="group relative flex items-center gap-2 py-2 text-[#11151B] transition hover:text-[#2F66FF]"
          >
            <span aria-hidden className="text-[13px] leading-none">▦</span>
            <span>{copy.library}</span>
            <span className="text-[8px] text-[#6D7480]">{String(library.length).padStart(2, "0")}</span>
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-px bg-[#2F66FF] transition-[transform,opacity] duration-500"
              style={{ transform: surface === "library" ? "scaleX(1)" : "scaleX(0)", opacity: surface === "library" ? 1 : 0 }}
            />
          </button>
          <WipeLink
            href={workspaceHref(SAMPLE.stockCode, "", true, hasSampleResearch)}
            className="relative hidden border-b border-[#11151B] pb-1 text-[#11151B] transition after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-[''] hover:opacity-60 sm:inline"
          >
            {copy.sampleCanvas}
          </WipeLink>
        </div>
      </header>

      <section
        ref={startPanelRef}
        id="research-start"
        aria-hidden={surface !== "start"}
        inert={surface !== "start"}
        className={`absolute inset-x-0 bottom-0 top-[74px] z-10 overflow-y-auto overscroll-contain transition-[opacity,transform,filter] duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          surface === "start"
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0"
            : "pointer-events-none -translate-y-[6vh] scale-[0.975] opacity-0 blur-[2px]"
        }`}
        style={{ transitionDelay: surface === "start" ? "55ms" : "0ms" }}
      >
        <div className="mx-auto flex min-h-full w-full max-w-[980px] flex-col justify-center px-5 pb-24 pt-8 text-center sm:px-9">
          <div className="mx-auto mb-3"><StockLensMark size={92} /></div>
          <div className="font-mono text-[9px] tracking-[0.3em] text-[#6D7480]">{copy.eyebrow}</div>
          <h1 className="mx-auto mt-3 text-[27px] font-medium tracking-[-0.035em] text-[#11151B] sm:text-[34px]">
            {copy.title}
          </h1>
          <form
            data-research-composer
            className="relative mx-auto mt-8 w-full max-w-[820px] overflow-visible rounded-[24px] border border-black/10 bg-white/95 px-5 pb-4 pt-4 text-left shadow-[0_20px_55px_rgba(17,21,27,0.10)] backdrop-blur sm:px-6 sm:pb-5 sm:pt-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (selected) openSelected()
              else if (results[0]) choose(results[0])
            }}
          >
            <div className="flex items-center justify-between gap-4 px-1 pb-2">
              <span className="font-mono text-[9px] tracking-[0.2em] text-[#6D7480]">{copy.newResearch}</span>
              {selected && (
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null)
                    setQuery("")
                    setQuestion("")
                  }}
                  className="font-mono text-[9px] text-[#6D7480] hover:text-[#11151B]"
                >
                  {copy.chooseAgain}
                </button>
              )}
            </div>

            <div className="relative mt-1 px-1 sm:px-2">
              <label htmlFor="research-company" className="sr-only">{copy.companySearch}</label>
              <div className="flex min-h-[88px] items-start gap-3 pt-3">
                <span className="text-[17px] text-[#6D7480]">⌕</span>
                <input
                  id="research-company"
                  data-research-company-search
                  value={query}
                  readOnly={Boolean(selected)}
                  onChange={(event) => {
                    setSelected(null)
                    setQuery(event.target.value)
                    setResults([])
                    setSearching(false)
                  }}
                  placeholder={copy.companySearch}
                  className="w-full bg-transparent py-1 text-[17px] tracking-[-0.02em] outline-none placeholder:text-[#858B95] sm:text-[19px]"
                  autoComplete="off"
                />
                {searching && <span className="font-mono text-[9px] text-[#6D7480]">{copy.searching}</span>}
              </div>

              {results.length > 0 && (
                <ul
                  data-company-search-results
                  className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-[14px] border border-black/10 bg-white p-2 shadow-[0_18px_42px_rgba(17,21,27,0.13)]"
                >
                  {results.map((result) => (
                    <li key={result.stockCode}>
                      <button
                        type="button"
                        onClick={() => choose(result)}
                        className="flex min-h-11 w-full items-center justify-between px-3 text-left hover:bg-[#F5F7FA]"
                      >
                        <span className="text-[14px] font-medium">{result.stockName}</span>
                        <span className="font-mono text-[10px] text-[#6D7480]">{result.stockCode}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* 空结果不是"没反应"：明确告知检索范围，而不是让用户以为产品坏了 */}
              {!searching && !selected && results.length === 0 && query.trim().length >= 1 && (
                <div
                  data-company-search-empty
                  className="absolute left-0 right-0 top-full z-20 mt-2 rounded-[14px] border border-black/10 bg-white px-4 py-3.5 shadow-[0_18px_42px_rgba(17,21,27,0.13)]"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 13 13"
                      aria-hidden
                      className="shrink-0 text-[#6D7480]"
                    >
                      <circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M8.6 8.6 12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    <span className="text-[13.5px] font-medium text-[#11151B]">{copy.emptyTitle}</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                    <span className="font-mono text-[9.5px] tracking-[0.16em] text-[#6D7480]">{copy.emptyScope}</span>
                    {copy.emptyMarkets.map((market) => (
                      <span
                        key={market}
                        className="rounded-full border border-black/10 px-[7px] py-px font-mono text-[9.5px] leading-[14px] text-[#6D7480]"
                      >
                        {market}
                      </span>
                    ))}
                    <span className="text-[11.5px] text-[#6D7480]">{copy.emptyNote}</span>
                  </div>
                </div>
              )}
            </div>

            <div className={`overflow-hidden transition-all duration-300 ${selected ? "mt-3 max-h-[260px] opacity-100" : "max-h-0 opacity-0"}`}>
              <div className="flex items-start gap-3 border-t border-black/10 px-2 py-3">
                <span className="pt-2 text-[15px] text-[#6D7480]">＋</span>
                  <textarea
                  aria-label={copy.question}
                  data-research-question
                  value={question}
                  onChange={(event) => setQuestion(event.target.value.slice(0, 500))}
                  rows={2}
                  placeholder={copy.question}
                  className="min-h-[64px] w-full resize-none bg-transparent py-2 text-[15px] leading-6 outline-none placeholder:text-[#8D939D]"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 px-1">
                {copy.quickQuestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuestion(item)}
                    className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10.5px] text-[#6D7480] transition hover:border-[#2F66FF]/40 hover:text-[#2F66FF]"
                  >
                    {item.replace("？", "")}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 px-1">
              <button
                type="button"
                onClick={() => wipeTo(workspaceHref(SAMPLE.stockCode, "", true, hasSampleResearch))}
                className="rounded-full border border-black/10 px-3 py-2 font-mono text-[9px] tracking-[0.06em] text-[#6D7480] transition hover:border-black/25 hover:text-[#11151B]"
              >
                {copy.sample}
              </button>
              <button
                type="submit"
                data-start-research
                disabled={!selected}
                className="grid h-10 w-10 place-items-center rounded-full bg-[#11151B] text-[16px] text-white transition hover:bg-[#2F66FF] disabled:cursor-not-allowed disabled:bg-[#D2D6DC]"
                aria-label={copy.enter}
              >
                ↑
              </button>
            </div>
          </form>
          {!selected && question.trim().length > 0 && (
            <p data-question-hint className="mx-auto mt-4 max-w-[820px] text-[11.5px] text-[#6D7480]">
              已选研究问题「{question}」——研究从一家公司开始：先在上方选出公司，进入研究空间后我们会围绕这个问题展开。
            </p>
          )}
          {!selected && (
            <div className="mx-auto mt-3 flex max-w-[820px] flex-wrap justify-center gap-2">
              {copy.quickQuestions.map((item) => {
                const active = question === item
                return (
                  <button
                    key={item}
                    type="button"
                    data-quick-question
                    aria-pressed={active}
                    onClick={() => {
                      // 语义纪律：问题依附于公司存在（没有通用/大盘分析能力）。
                      // chip 只做「预选角度 + 引导选公司」，绝不提前展开问题区制造假状态。
                      const next = active ? "" : item
                      setQuestion(next)
                      if (next) document.getElementById("research-company")?.focus()
                    }}
                    className={`rounded-full border px-3.5 py-2 text-[10.5px] transition ${
                      active
                        ? "border-[#2F66FF]/60 bg-[#2F66FF]/[0.06] text-[#2F66FF]"
                        : "border-black/10 bg-white/75 text-[#6D7480] hover:border-black/25 hover:bg-white hover:text-[#11151B]"
                    }`}
                  >
                    {item.replace("？", "")}
                  </button>
                )
              })}
            </div>
          )}
          {/* 原「查看公司研究矩阵」按钮已并入底部中央 dock（data-dock-surface） */}
        </div>
      </section>

      <section
        ref={libraryPanelRef}
        id="research-library"
        aria-hidden={surface !== "library"}
        inert={surface !== "library"}
        className={`absolute inset-x-0 bottom-0 top-[74px] z-10 overflow-y-auto overscroll-contain transition-[opacity,transform,filter] duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          surface === "library"
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100 blur-0"
            : "pointer-events-none translate-y-[7vh] scale-[0.982] opacity-0 blur-[2px]"
        }`}
        style={{ transitionDelay: surface === "library" ? "55ms" : "0ms" }}
      >
        <div className="mx-auto min-h-full w-full max-w-[1280px] px-5 pb-16 pt-9 sm:px-9 sm:pt-11">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
          <div>
            <button type="button" onClick={openStart} className="relative mb-4 inline-flex items-center gap-2 font-mono text-[9px] tracking-[0.1em] text-[#6D7480] transition after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:text-[#11151B]">
              ↑ {copy.backToResearch}
            </button>
            <div className="font-mono text-[9px] tracking-[0.24em] text-[#6D7480]">{copy.libraryEyebrow}</div>
            <h2 className="mt-2 text-[24px] font-medium tracking-[-0.03em]">{copy.matrix}</h2>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-[380px]">
            <label htmlFor="library-search" className="sr-only">{copy.filterLibrary}</label>
            <div className="flex flex-1 items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-2.5 shadow-[0_8px_24px_rgba(17,21,27,0.04)]">
              <span aria-hidden className="text-[13px] text-[#6D7480]">⌕</span>
              <input
                id="library-search"
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder={copy.filterLibrary}
                className="w-full bg-transparent text-[11px] outline-none placeholder:text-[#9AA0AA]"
              />
            </div>
            <button
              type="button"
              data-library-compare-toggle
              aria-pressed={compareMode}
              disabled={library.length < 2}
              onClick={() => {
                if (compareMode) {
                  exitCompareMode()
                } else {
                  setCompareMode(true)
                  setCompareSelection([])
                }
              }}
              title={library.length < 2 ? copy.compareMaxHint : undefined}
              className={`shrink-0 rounded-full border px-3 py-2 text-[10.5px] transition disabled:cursor-not-allowed disabled:opacity-45 ${
                compareMode
                  ? "border-[#2F66FF] bg-[#2F66FF] text-white"
                  : "border-black/10 bg-white/80 text-[#6D7480] hover:border-[#2F66FF]/40 hover:text-[#2F66FF]"
              }`}
            >
              {copy.compareToggle}
            </button>
          </div>
        </div>

        {storageFailure && (
          <div
            data-storage-failure
            className="mt-5 flex items-start gap-3 rounded-[14px] border px-4 py-3"
            style={{ borderColor: "rgba(182,128,42,0.4)", background: "rgba(182,128,42,0.06)" }}
          >
            <span aria-hidden className="mt-px shrink-0 text-[13px]" style={{ color: "#B4802A" }}>!</span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-medium" style={{ color: "#854F0B" }}>
                {copy.storageFailTitle}
              </p>
              <p className="mt-1 text-[11.5px] leading-5" style={{ color: "#854F0B" }}>
                {storageFailure.reason === "quota" ? copy.storageFailQuota : copy.storageFailOther}
              </p>
              {storageFailure.reason === "quota" && (
                <button
                  type="button"
                  data-storage-cleanup
                  onClick={() => void runCleanup()}
                  disabled={cleaning}
                  className="mt-2.5 rounded-full border px-3 py-1.5 text-[11px] transition disabled:cursor-default disabled:opacity-55"
                  style={{ borderColor: "rgba(182,128,42,0.45)", color: "#854F0B", minHeight: 28 }}
                >
                  {cleaning ? copy.storageCleaning : copy.storageCleanupAction}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 清理结果放在横幅外面：横幅消失后用户仍能看到"到底清了几条" */}
        {cleanedCount !== null && !storageFailure && (
          <p data-storage-cleaned className="mt-2 text-[11px] text-[#6D7480]">
            {locale === "zh" ? `已清理 ${cleanedCount} 条旧缓存` : `Cleared ${cleanedCount} old cache(s)`}
          </p>
        )}

        {!storageFailure && eviction && (
          <p
            data-storage-eviction
            className="mt-4 max-w-[520px] text-[10.5px] leading-5 text-[#6D7480]"
          >
            {copy.storageEvictionNotice}
          </p>
        )}

        <div className="overflow-x-auto rounded-[14px] border border-black/10 bg-white/90 shadow-[0_12px_35px_rgba(17,21,27,0.045)]" data-research-library-matrix>
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1.2fr_1.3fr_48px] border-b border-black/10 bg-[#F5F7FA] font-mono text-[8.5px] tracking-[0.12em] text-[#6D7480]">
              {copy.columns.map((label, index) => (
                <div key={`${label}-${index}`} className="border-r border-black/10 px-4 py-3 last:border-r-0">{label}</div>
              ))}
            </div>

            {rows.map((company) => {
              const isSample = library.length === 0 && company.stockCode === SAMPLE.stockCode
              const state = statusLabel(company.aiStatus, locale)
              const comparePicked = compareMode && compareSelection.includes(company.stockCode)
              const rowBody = (
                <>
                  <div className="flex items-center gap-3 border-r border-black/10 px-4">
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[12px] font-semibold transition ${
                        comparePicked ? "border-[#2F66FF] bg-[#2F66FF] text-white" : "border-black/10 bg-[#F5F7FA]"
                      }`}
                    >
                      {comparePicked ? "✓" : company.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[13px] font-semibold">
                        <span className="truncate">{company.name}</span>
                        {isSaved(saved, company.stockCode) && <span className="text-[#B4802A]">★</span>}
                      </span>
                      <span className="mt-1 block font-mono text-[9px] text-[#6D7480]">{company.stockCode}</span>
                    </span>
                  </div>
                  <div className="flex items-center border-r border-black/10 px-4 text-[12px] text-[#6D7480]">
                    {company.industry ?? copy.unknownIndustry}
                  </div>
                  <div className="flex items-center border-r border-black/10 px-4 font-mono text-[12px]">
                    {company.dimensionCount ?? "—"}<span className="ml-1 text-[9px] text-[#6D7480]">ANGLES</span>
                  </div>
                  <div className="flex items-center border-r border-black/10 px-4 font-mono text-[12px]">
                    {company.evidenceCount ?? "—"}<span className="ml-1 text-[9px] text-[#6D7480]">ITEMS</span>
                  </div>
                  <div className="flex items-center gap-2 border-r border-black/10 px-4 text-[11px]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: state.color }} />
                    <span>{isSample ? copy.sampleStatus : state.label}</span>
                  </div>
                  <div className="flex items-center border-r border-black/10 px-4 font-mono text-[10px] text-[#6D7480]">
                    {dateLabel(company.lastResearchAt ?? company.lastVisitedAt)}
                  </div>
                  <div className="grid place-items-center text-[#6D7480] transition group-hover:translate-x-1 group-hover:text-[#2F66FF]">
                    {compareMode ? "" : "→"}
                  </div>
                </>
              )
              // 对比模式下行是多选按钮；默认模式保持原导航行为不变
              return compareMode ? (
                <button
                  key={company.stockCode}
                  type="button"
                  data-research-library-row={company.stockCode}
                  data-compare-row={company.stockCode}
                  aria-pressed={comparePicked}
                  onClick={() => toggleCompareRow(company.stockCode)}
                  className="group grid min-h-[82px] w-full grid-cols-[2fr_1.2fr_1fr_1fr_1.2fr_1.3fr_48px] border-b border-black/10 text-left last:border-b-0 hover:bg-[#F8FAFF]"
                >
                  {rowBody}
                </button>
              ) : (
                <WipeLink
                  key={company.stockCode}
                  href={isSample ? workspaceHref(company.stockCode, "", true) : workspaceHref(company.stockCode, "", false, true)}
                  data-research-library-row={company.stockCode}
                  className="group grid min-h-[82px] grid-cols-[2fr_1.2fr_1fr_1fr_1.2fr_1.3fr_48px] border-b border-black/10 last:border-b-0 hover:bg-[#F8FAFF]"
                >
                  {rowBody}
                </WipeLink>
              )
            })}
            {rows.length === 0 && (
              <div className="grid min-h-[120px] place-items-center font-mono text-[10px] text-[#6D7480]">
                {copy.emptyLibrary}
              </div>
            )}
          </div>
        </div>

        {compareMode && (
          <div
            data-library-compare-bar
            className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-black/10 bg-white px-4 py-3 shadow-[0_14px_40px_rgba(17,21,27,0.14)]"
          >
            <div className="min-w-0">
              <p className="text-[12px] font-medium">
                {compareSelection.length === 2
                  ? compareSelectedNames.join(" × ")
                  : compareSelection.length === 1
                    ? copy.comparePickOne
                    : copy.comparePick}
              </p>
              {compareSelection.length < 2 && (
                <p className="mt-0.5 text-[10.5px] text-[#9AA0AA]">{copy.compareMaxHint}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                data-library-compare-exit
                onClick={exitCompareMode}
                className="rounded-full border border-black/10 px-3 py-1.5 text-[10.5px] text-[#6D7480] transition hover:border-black/25 hover:text-[#11151B]"
              >
                {copy.compareExit}
              </button>
              <button
                type="button"
                data-library-compare-start
                disabled={compareSelection.length !== 2}
                onClick={startCompare}
                className="rounded-full bg-[#11151B] px-4 py-1.5 text-[10.5px] text-white transition hover:bg-[#2F66FF] disabled:cursor-not-allowed disabled:bg-[#D2D6DC]"
              >
                {copy.compareStart}
              </button>
            </div>
          </div>
        )}

        {library.length === 0 && (
          <p className="mt-3 font-mono text-[9px] tracking-[0.08em] text-[#6D7480]">
            {copy.sampleHint}
          </p>
        )}
        <p className="mt-4 max-w-[520px] text-[10.5px] leading-5 text-[#6D7480]">{copy.matrixNote}</p>
        {library.length > 0 && (
          <p data-storage-local-note className="mt-1.5 font-mono text-[9px] tracking-[0.12em] text-[#9AA0AA]">
            {copy.storageLocal}
          </p>
        )}
        </div>
      </section>

      <nav
        aria-label={locale === "zh" ? "首页视图" : "Home views"}
        className="absolute right-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-2 font-mono text-[8px] text-[#8B919B] md:flex"
      >
        <button
          type="button"
          aria-label={locale === "zh" ? "新研究" : "New research"}
          aria-current={surface === "start" ? "page" : undefined}
          onClick={openStart}
          className="relative px-2 py-1 transition after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] hover:text-[#11151B]"
          style={{ color: surface === "start" ? "#11151B" : "#8B919B" }}
        >
          01
        </button>
        <span className="relative h-16 w-px bg-black/10">
          <span
            className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#2F66FF] shadow-[0_0_0_4px_rgba(47,102,255,0.10)] transition-[top] duration-[760ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ top: surface === "start" ? 0 : "calc(100% - 8px)" }}
          />
        </span>
        <button
          type="button"
          aria-label={copy.library}
          aria-current={surface === "library" ? "page" : undefined}
          onClick={openLibrary}
          className="relative px-2 py-1 transition after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-[''] hover:text-[#11151B]"
          style={{ color: surface === "library" ? "#11151B" : "#8B919B" }}
        >
          02
        </button>
      </nav>

      {transitionToken > 0 && (
        <div key={transitionToken} aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          <span className="stocklens-surface-wipe absolute left-1/2 top-1/2 h-[88px] w-[88px] rounded-full border border-[#2F66FF]/35 shadow-[0_0_36px_rgba(47,102,255,0.16)]" />
        </div>
      )}

      {/* 底部中央 dock：常驻入口——AI 助手 + 面间快捷切换（取代原 browseMatrix 按钮与顶部 AI 按钮） */}
      <div
        data-assistant-dock
        className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-black/10 bg-white/95 p-1.5 shadow-[0_18px_50px_rgba(17,21,27,0.16)] backdrop-blur-md"
      >
        <button
          type="button"
          data-dock-surface
          onClick={surface === "start" ? openLibrary : openStart}
          className="group flex items-center gap-1.5 rounded-full px-3.5 py-2 font-mono text-[9.5px] tracking-[0.1em] text-[#6D7480] transition hover:bg-[#F5F7FA] hover:text-[#11151B]"
        >
          <span aria-hidden className="text-[11px] leading-none">{surface === "start" ? "▦" : "↑"}</span>
          <span className="hidden sm:inline">{surface === "start" ? copy.browseMatrix : copy.backToResearch}</span>
        </button>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-black/10" />
        <button
          type="button"
          data-assistant-toggle
          aria-pressed={assistantOpen}
          onClick={() => setAssistantOpen((value) => !value)}
          className="flex items-center gap-1.5 rounded-full bg-[#11151B] px-3.5 py-2 font-mono text-[9.5px] tracking-[0.1em] text-white transition hover:bg-[#2F66FF]"
        >
          <span aria-hidden className="text-[11px] leading-none">✦</span>
          <span className="hidden sm:inline">AI 助手</span>
        </button>
      </div>

      <AssistantPanel
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        pageContext={surface === "library" ? "library" : "home"}
        onExecute={executeAssistantAction}
      />

      <style>{`
        @keyframes stocklens-surface-wipe {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.08); }
          28% { opacity: .52; }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(28); }
        }
        .stocklens-surface-wipe {
          animation: stocklens-surface-wipe 820ms cubic-bezier(.22, 1, .36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .stocklens-surface-wipe { animation: none; }
        }
      `}</style>
    </main>
  )
}
