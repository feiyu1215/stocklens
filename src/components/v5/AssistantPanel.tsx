"use client"

// P1 AI 助手 —— 轻量面板（页面级显式入口，非常驻悬浮球）。
// 职责：单输入 → 调度（intent 接口）→ 渲染回复/操作卡片/澄清/解释 → 交给页面执行白名单动作。
// 边界：面板自身不执行任何动作（ActionExecutor 在页面侧）；P1 只保留当前一轮交互，不做聊天历史。

import { useEffect, useRef, useState } from "react"

import { PALETTE } from "@/components/v5/palette"
import { ACTION_REGISTRY, type AssistantResolution, type PlannedAction } from "@/lib/v5/assistant/capabilities"

const C = PALETTE

interface ConceptExplanation {
  term: string
  explanation: string
  formula?: string
  usage?: string
  caveats: string[]
  ai: { status: "success" | "failed" }
}

type Phase = "idle" | "working" | "done" | "error"

const SUGGESTIONS = ["打开研究库", "对比美的集团和格力电器", "ROE 是什么意思", "怎么导出笔记"]

function actionLabel(action: PlannedAction): string {
  const base = ACTION_REGISTRY[action.action].label
  if (action.action === "company.open" && action.stockName) return `打开「${action.stockName}」的研究空间`
  if (action.action === "navigate.compare" && action.stockCodes) {
    return `对比「${action.stockCodes[0].stockName}」×「${action.stockCodes[1].stockName}」`
  }
  return base
}

export interface AssistantPanelProps {
  open: boolean
  onClose: () => void
  /** 来源页面（进入能力检查的上下文） */
  pageContext: "home" | "library"
  /** ActionExecutor：只执行通过能力检查的白名单动作（由页面实现） */
  onExecute: (action: PlannedAction) => void
}

export default function AssistantPanel({ open, onClose, pageContext, onExecute }: AssistantPanelProps) {
  const [input, setInput] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [question, setQuestion] = useState("")
  const [resolution, setResolution] = useState<AssistantResolution | null>(null)
  const [explanation, setExplanation] = useState<ConceptExplanation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 打开时聚焦输入框（rAF 延迟一帧，规避 set-state-in-effect 的既有处理惯例）
  useEffect(() => {
    if (!open) return
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(raf)
  }, [open])

  // ESC 关闭（ResearchHome 无既有 ESC 链，这里自成一体）
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  const askConcept = async (term: string) => {
    try {
      const res = await fetch("/api/assistant/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as ConceptExplanation
      setExplanation(body)
    } catch {
      setError("解释服务暂时不可用，稍后可重试。")
    }
  }

  const submit = async (raw?: string) => {
    const text = (raw ?? input).trim()
    if (!text || phase === "working") return
    setQuestion(text)
    setInput("")
    setResolution(null)
    setExplanation(null)
    setError(null)
    setPhase("working")
    try {
      const res = await fetch("/api/assistant/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: text, page: pageContext }),
      })
      if (res.status === 429) throw new Error("rate")
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as AssistantResolution
      setResolution(body)
      setPhase("done")
      if (body.intent === "concept_explain" && body.explainTerm) {
        void askConcept(body.explainTerm)
      }
    } catch (err) {
      setPhase("error")
      setError(err instanceof Error && err.message === "rate" ? "请求太频繁，稍等片刻再试。" : "助手暂时不可用，稍后可重试；导航、研究库与对比功能不受影响。")
    }
  }

  const runAction = (action: PlannedAction) => {
    onExecute(action)
  }

  if (!open) return null

  return (
    <div
      data-assistant-panel
      className="fixed bottom-5 right-5 z-[70] flex max-h-[76vh] w-[min(416px,calc(100vw-40px))] flex-col overflow-hidden rounded-[18px] border border-black/[0.08] bg-white shadow-[0_32px_90px_rgba(17,21,27,0.24),0_2px_8px_rgba(17,21,27,0.06)]"
      role="dialog"
      aria-label="AI 助手"
    >
      {/* 顶栏 */}
      <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-6 w-6 place-items-center rounded-[8px] bg-[#11151B] text-[11px] leading-none text-white"
          >
            ✦
          </span>
          <span className="text-[13px] font-semibold tracking-[-0.01em]">AI 助手</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden rounded-[6px] border border-black/[0.08] px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.08em] text-[#9AA0AA] sm:block">
            ⌘K
          </span>
          <button
            type="button"
            data-assistant-close
            aria-label="关闭助手"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-full text-[14px] leading-none text-[#6D7480] transition hover:bg-[#F5F7FA] hover:text-[#11151B]"
          >
            ×
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {phase === "idle" && (
          <div data-assistant-intro className="space-y-4">
            <p className="text-[13px] font-medium leading-6">
              用一句话，调用 StockLens 已经具备的能力。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  data-assistant-suggestion
                  onClick={() => void submit(suggestion)}
                  className="group rounded-[12px] border border-black/[0.08] bg-[#FBFCFE] px-3 py-2.5 text-left text-[11.5px] leading-5 text-[#4A5058] transition hover:border-[#2F66FF]/40 hover:bg-white hover:text-[#2F66FF]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <p className="border-t border-black/[0.06] pt-3 text-[10.5px] leading-5 text-[#9AA0AA]">
              不做投资建议与全市场筛选；公司分析请进入研究空间，由证据回答。
            </p>
          </div>
        )}

        {phase !== "idle" && (
          <div className="space-y-3.5">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-[14px] rounded-br-[4px] bg-[#F5F7FA] px-3.5 py-2 text-[12px] leading-5">
                {question}
              </p>
            </div>

            {phase === "working" && (
              <p data-assistant-working className="px-1 text-[11.5px] text-[#9AA0AA]">
                正在识别<span className="assistant-dots" aria-hidden>…</span>
              </p>
            )}

            {phase === "error" && error && (
              <p data-assistant-error className="rounded-[12px] px-1 text-[11.5px] leading-5" style={{ color: C.amber }}>
                {error}
              </p>
            )}

            {phase === "done" && resolution && (
              <div data-assistant-resolution className="space-y-3">
                {/* 概念解释成功时隐藏中间态回复，避免"解释中"字样与结果并存 */}
                {!(explanation && explanation.ai.status === "success") && (
                  <p
                    className="px-1 text-[12.5px] leading-6"
                    style={{ color: resolution.availability === "unavailable" ? C.amber : C.ink }}
                  >
                    {resolution.reply}
                  </p>
                )}

                {explanation && (
                  <div data-assistant-explanation className="overflow-hidden rounded-[14px] border border-black/[0.08]">
                    <div className="flex items-center justify-between border-b border-black/[0.06] bg-[#FBFCFE] px-3.5 py-2">
                      <span className="text-[12px] font-semibold">{explanation.term}</span>
                      <span className="font-mono text-[8.5px] tracking-[0.16em] text-[#9AA0AA]">CONCEPT</span>
                    </div>
                    <div className="space-y-2.5 px-3.5 py-3">
                      {explanation.ai.status === "failed" ? (
                        <p className="text-[11.5px] leading-5" style={{ color: C.amber }}>{explanation.explanation}</p>
                      ) : (
                        <>
                          <p className="text-[12px] leading-6">{explanation.explanation}</p>
                          {explanation.formula && (
                            <p className="rounded-[8px] bg-[#F5F7FA] px-2.5 py-1.5 font-mono text-[10px] leading-5 text-[#4A5058]">
                              {explanation.formula}
                            </p>
                          )}
                          {explanation.usage && (
                            <p className="text-[11px] leading-5 text-[#6D7480]">{explanation.usage}</p>
                          )}
                          {explanation.caveats.length > 0 && (
                            <ul className="space-y-1 text-[11px] leading-5 text-[#6D7480]">
                              {explanation.caveats.map((caveat) => (
                                <li key={caveat} className="flex gap-1.5">
                                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#C7CCD4]" />
                                  <span>{caveat}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="border-t border-black/[0.06] pt-2 text-[9.5px] leading-4 text-[#9AA0AA]">
                            通用概念解释 · 不含任何公司的真实数据与投资建议
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {resolution.clarifyCompanies && resolution.clarifyCompanies.length > 0 && (
                  <div data-assistant-clarify className="overflow-hidden rounded-[14px] border border-black/[0.08]">
                    {resolution.clarifyCompanies.map((company, index) => (
                      <button
                        key={company.stockCode}
                        type="button"
                        onClick={() => runAction({ action: "company.open", stockCode: company.stockCode, stockName: company.stockName })}
                        className={`flex w-full items-center justify-between px-3.5 py-2.5 text-left transition hover:bg-[#F8FAFF] ${
                          index > 0 ? "border-t border-black/[0.06]" : ""
                        }`}
                      >
                        <span className="text-[12px] font-medium">{company.stockName}</span>
                        <span className="font-mono text-[9px] text-[#9AA0AA]">{company.stockCode}</span>
                      </button>
                    ))}
                  </div>
                )}

                {resolution.actions && resolution.actions.length > 0 && (
                  <div data-assistant-actions className="space-y-1.5">
                    {resolution.actions.map((action, index) => (
                      <button
                        key={`${action.action}-${index}`}
                        type="button"
                        data-assistant-action={action.action}
                        onClick={() => runAction(action)}
                        className="group flex w-full items-center justify-between rounded-[12px] border border-black/[0.08] bg-white px-3.5 py-2.5 text-left transition hover:border-[#2F66FF]/50 hover:bg-[#2F66FF]/[0.04]"
                      >
                        <span className="text-[12px] font-medium">{actionLabel(action)}</span>
                        <span
                          aria-hidden
                          className="text-[12px] text-[#9AA0AA] transition group-hover:translate-x-0.5 group-hover:text-[#2F66FF]"
                        >
                          →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <form
        className="flex items-center gap-2 border-t border-black/[0.07] px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <input
          ref={inputRef}
          data-assistant-input
          value={input}
          onChange={(event) => setInput(event.target.value.slice(0, 500))}
          placeholder="输入一句话，或点击上方建议"
          className="flex-1 bg-transparent px-1.5 text-[12.5px] outline-none placeholder:text-[#9AA0AA]"
        />
        <button
          type="submit"
          data-assistant-send
          disabled={phase === "working" || input.trim().length === 0}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#11151B] text-[13px] text-white transition hover:bg-[#2F66FF] disabled:cursor-not-allowed disabled:bg-[#D2D6DC]"
          aria-label="发送"
        >
          ↑
        </button>
      </form>
      <style>{`
        .assistant-dots::after {
          content: "";
          animation: assistant-dots 1.2s steps(4, end) infinite;
        }
        @keyframes assistant-dots {
          0% { content: ""; }
          25% { content: "·"; }
          50% { content: "··"; }
          75% { content: "···"; }
        }
        @media (prefers-reduced-motion: reduce) {
          .assistant-dots::after { animation: none; content: "…"; }
        }
      `}</style>
    </div>
  )
}
