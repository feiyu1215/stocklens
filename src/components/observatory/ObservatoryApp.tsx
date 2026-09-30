"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { StockSearchItem } from "@/lib/data/stock-search"
import { Discovery } from "./Discovery"
import { SpaceView } from "./SpaceView"
import { FocusView } from "./FocusView"
import { OBSERVATORY_COLORS, type AddedDimensionResult, type ObservatoryScene, type ResearchSpacePayload } from "./theme"

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
  const [assemblingDimensionId, setAssemblingDimensionId] = useState<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandText, setCommandText] = useState("")
  const addInputRef = useRef<HTMLInputElement>(null)
  const commandInputRef = useRef<HTMLInputElement>(null)
  const [activeStockCode, setActiveStockCode] = useState<string | null>(initialStockCode ?? null)

  const loadSpace = useCallback(async (stockCode: string) => {
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
      const payload = (await res.json()) as ResearchSpacePayload
      setSpace(payload)
      setScene("SPACE_OVERVIEW")
    } catch {
      setError("无法连接研究服务，请重试。")
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
        const payload = (await res.json()) as ResearchSpacePayload
        if (cancelled) return
        setSpace(payload)
        setScene("SPACE_OVERVIEW")
      } catch {
        if (cancelled) return
        setError(`fixture 加载失败：${fixture}`)
        setScene("DISCOVERY")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fixture])

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
        setAddMessage("维度创建失败，请重试。")
        return
      }
      // 新对象以 outline 形式先进入空间（assembling → 结果状态）
      setAssemblingDimensionId(body.dimensionId ?? null)
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
      setTimeout(() => setAssemblingDimensionId(null), 900)
    } catch {
      setAddStatus("error")
      setAddMessage("无法连接研究服务。")
    }
  }

  const commandActions = useMemo(() => {
    if (!space) return []
    if (selectedDimension) {
      return [
        { label: `Ask about ${selectedDimension.label}`, run: () => { setCommandOpen(false) } },
        { label: "Inspect evidence", run: () => { setCommandOpen(false); setScene("DIMENSION_FOCUS") } },
        { label: "Add related dimension", run: () => { setCommandOpen(false); setAddLensOpen(true) } },
      ]
    }
    return [
      { label: "Ask about this company", run: () => { setCommandOpen(false) } },
      { label: "Add dimension", run: () => { setCommandOpen(false); setAddLensOpen(true) } },
      { label: "Search another company", run: () => { setCommandOpen(false); setScene("DISCOVERY"); setSpace(null) } },
    ]
  }, [space, selectedDimension])

  const handleSelect = (item: StockSearchItem) => {
    setActiveStockCode(item.stockCode)
    void loadSpace(item.stockCode)
  }

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        background: `radial-gradient(1200px 640px at 50% 38%, #0C1018 0%, ${OBSERVATORY_COLORS.background} 68%)`,
        color: OBSERVATORY_COLORS.primaryText,
      }}
    >
      {/* Global Chrome（§4） */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={() => {
            setScene("DISCOVERY")
            setSpace(null)
            setSelectedDimensionId(null)
          }}
          className="pointer-events-auto font-mono text-[11px] tracking-[0.34em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
          style={{ color: scene === "DIMENSION_FOCUS" ? "#676A70" : "#8C94A8" }}
        >
          STOCKLENS
        </button>
        {space && scene !== "DIMENSION_FOCUS" && (
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-[#232838] bg-[#0E1118]/80 px-3.5 py-1.5 backdrop-blur">
            <span className="text-[12px] text-[#F1F3F5]">{space.company.stockName}</span>
            <span className="font-mono text-[11px] text-[#8C94A8]">{space.company.stockCode}</span>
            {space.company.industryName && (
              <span className="text-[11px] text-[#5A6274]">{space.company.industryName}</span>
            )}
          </div>
        )}
      </header>

      {/* Scenes */}
      <div className="absolute inset-0">
        {scene === "DISCOVERY" && (
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

        {scene === "ASSEMBLING" && (
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
            <div className="text-[12px] text-[#8C94A8]">Building your evidence space…</div>
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

        {scene === "SPACE_OVERVIEW" && space && (
          <SpaceView
            space={space}
            selectedDimensionId={selectedDimensionId}
            onDimensionSelect={(id) => {
              setSelectedDimensionId(id)
              setScene("DIMENSION_FOCUS")
            }}
            onAddDimension={() => setAddLensOpen(true)}
            onSuggestionAdd={(label) => void submitAddDimension(label)}
            onSuggestionDismiss={(label) => setDismissedSuggestions((prev) => [...prev, label])}
            dismissedSuggestions={dismissedSuggestions}
            addingDimensionId={assemblingDimensionId}
            addLensOpen={addLensOpen}
            onOpenCommandLens={() => setCommandOpen(true)}
          />
        )}

        {scene === "DIMENSION_FOCUS" && space && selectedDimension && (
          <FocusView
            space={space}
            dimension={selectedDimension}
            metrics={space.metrics}
            onBack={() => setScene("SPACE_OVERVIEW")}
          />
        )}
      </div>

      {/* Add Dimension Lens（§54–§60：在原位置扩张，不是中央 Modal） */}
      {addLensOpen && space && (
        <div className="absolute bottom-24 right-10 z-40 w-[360px]">
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
        <div className="absolute bottom-5 left-1/2 z-40 -translate-x-1/2">
          {!commandOpen ? (
            <button
              type="button"
              onClick={() => {
                setCommandOpen(true)
                setTimeout(() => commandInputRef.current?.focus(), 30)
              }}
              className="flex h-[46px] w-[420px] items-center gap-3 rounded-full border border-[#232838] px-5 backdrop-blur transition hover:border-[#3A4156] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
              style={{ background: "rgba(14,17,24,0.8)" }}
              aria-label="打开命令面板（Command Lens）"
            >
              <span className="font-mono text-[11px] text-[#8C94A8]">⌘K</span>
              <span className="text-[12px] text-[#5A6274]">Ask · Focus · Add</span>
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

      <style jsx global>{`
        @keyframes observatory-zoom {
          from { transform: scale(0.86); opacity: 0.4; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes observatory-breathe {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
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
