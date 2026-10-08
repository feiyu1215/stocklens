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
      className="fixed bottom-5 right-5 z-[70] flex max-h-[72vh] w-[min(400px,calc(100vw-40px))] flex-col overflow-hidden rounded-[16px] border border-black/10 bg-white shadow-[0_24px_70px_rgba(17,21,27,0.22)]"
      role="dialog"
      aria-label="AI 助手"
    >
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] tracking-[0.24em] text-[#6D7480]">ASSISTANT</span>
          <span className="text-[13px] font-medium">AI 助手</span>
        </div>
        <button
          type="button"
          data-assistant-close
          aria-label="关闭助手"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-full text-[13px] text-[#6D7480] transition hover:bg-[#F5F7FA] hover:text-[#11151B]"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {phase === "idle" && (
          <div className="space-y-2 text-[11.5px] leading-5 text-[#6D7480]">
            <p>用一句话告诉我你想做什么。我能做的是：</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>打开页面或某家公司的研究（「打开研究库」「打开美的的研究」）</li>
              <li>发起双公司对比（「对比美的和格力」）</li>
              <li>解释金融概念（「ROE 是什么意思」）</li>
              <li>说明产品功能（「怎么导出笔记」）</li>
            </ul>
            <p className="text-[10.5px] text-[#9AA0AA]">公司分析请在研究空间内进行；我不提供全市场筛选或投资建议。</p>
          </div>
        )}

        {phase !== "idle" && (
          <div className="space-y-3">
            <div className="rounded-[10px] bg-[#F5F7FA] px-3 py-2 text-right text-[12px]">{question}</div>

            {phase === "working" && <p className="text-[11.5px] text-[#6D7480]">处理中…</p>}

            {phase === "error" && error && (
              <p data-assistant-error className="text-[11.5px]" style={{ color: C.coral }}>
                {error}
              </p>
            )}

            {phase === "done" && resolution && (
              <div data-assistant-resolution className="space-y-3">
                <p
                  className="text-[12px] leading-5"
                  style={{ color: resolution.availability === "unavailable" ? C.amber : C.ink }}
                >
                  {resolution.reply}
                </p>

                {explanation && (
                  <div data-assistant-explanation className="rounded-[10px] border border-black/10 bg-[#FBFCFE] px-3 py-2.5">
                    <p className="font-mono text-[8.5px] tracking-[0.16em] text-[#9AA0AA]">{explanation.term}</p>
                    {explanation.ai.status === "failed" ? (
                      <p className="mt-1 text-[11.5px]" style={{ color: C.amber }}>{explanation.explanation}</p>
                    ) : (
                      <>
                        <p className="mt-1 text-[12px] leading-5">{explanation.explanation}</p>
                        {explanation.formula && (
                          <p className="mt-1.5 font-mono text-[10px] text-[#6D7480]">{explanation.formula}</p>
                        )}
                        {explanation.usage && <p className="mt-1.5 text-[11px] leading-5 text-[#6D7480]">用途：{explanation.usage}</p>}
                        {explanation.caveats.length > 0 && (
                          <ul className="mt-1.5 ml-4 list-disc space-y-0.5 text-[11px] leading-5 text-[#6D7480]">
                            {explanation.caveats.map((caveat) => (
                              <li key={caveat}>{caveat}</li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-1.5 text-[9.5px] text-[#9AA0AA]">通用概念解释，不含任何公司的真实数据与投资建议。</p>
                      </>
                    )}
                  </div>
                )}

                {resolution.clarifyCompanies && resolution.clarifyCompanies.length > 0 && (
                  <div data-assistant-clarify className="flex flex-wrap gap-2">
                    {resolution.clarifyCompanies.map((company) => (
                      <button
                        key={company.stockCode}
                        type="button"
                        onClick={() => runAction({ action: "company.open", stockCode: company.stockCode, stockName: company.stockName })}
                        className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] transition hover:border-[#2F66FF]/50 hover:text-[#2F66FF]"
                      >
                        {company.stockName}
                        <span className="ml-1 font-mono text-[8.5px] text-[#9AA0AA]">{company.stockCode}</span>
                      </button>
                    ))}
                  </div>
                )}

                {resolution.actions && resolution.actions.length > 0 && (
                  <div data-assistant-actions className="flex flex-wrap gap-2">
                    {resolution.actions.map((action, index) => (
                      <button
                        key={`${action.action}-${index}`}
                        type="button"
                        data-assistant-action={action.action}
                        onClick={() => runAction(action)}
                        className="rounded-full bg-[#11151B] px-3.5 py-1.5 text-[11px] text-white transition hover:bg-[#2F66FF]"
                      >
                        {actionLabel(action)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t border-black/10 px-3 py-2.5"
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
          placeholder="试试「打开研究库」或「对比美的和格力」"
          className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#9AA0AA]"
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
    </div>
  )
}

function actionLabel(action: PlannedAction): string {
  const base = ACTION_REGISTRY[action.action].label
  if (action.action === "company.open" && action.stockName) return `打开「${action.stockName}」的研究空间`
  if (action.action === "navigate.compare" && action.stockCodes) {
    return `对比「${action.stockCodes[0].stockName}」和「${action.stockCodes[1].stockName}」`
  }
  return base
}
