"use client"

import { useEffect, useRef } from "react"

import type { ResearchSpacePayload } from "@/components/observatory/theme"
import { PALETTE } from "@/components/v5/palette"

export type SidekickMode = "ask" | "angle"
export type SidekickTurnStatus = "running" | "completed" | "stopped" | "failed"

export interface SidekickTurn {
  id: string
  question: string
  scopeLabel: string
  evidenceIds: string[]
  dimensionId?: string
  status: SidekickTurnStatus
  summary?: string
  confirmed?: string[]
  inferred?: string[]
  unknowns?: string[]
}

export interface ResearchAngleDraft {
  sourceText: string
  title: string
  researchQuestion: string
  rationale: string
  checks: string[]
  evidenceCount: number
}

interface ContextItem {
  id: string
  label: string
  kind: "company" | "dimension" | "claim" | "evidence"
}

const COLORS = PALETTE

// SOURCES 列表的「重复标签」问题：同一指标会有「累计同比 / 单季同比」两条真实存在的
// 不同证据（fact-builder 确定性生成，不可合并证据本身），平铺成两行看起来像重复。
// 这里按基础指标名分组——一行一个指标，口径差异（累计 / 单季）变成行内的独立可点链接，
// 每条证据仍各自直达自己的证据卡，不牺牲 evidence-first 的可溯源性。
interface SourceLinkItem {
  evidenceId: string
  variant: string | null
  period: string | null
}

interface SourceGroup {
  key: string
  title: string
  sharedPeriod: string | null
  items: SourceLinkItem[]
}

const PERIOD_VARIANT_TITLE = /^(.*?)(累计|单季)同比$/

function groupSourceLinks(evidenceIds: string[], payload: ResearchSpacePayload): SourceGroup[] {
  const groups: SourceGroup[] = []
  const byKey = new Map<string, SourceGroup>()
  for (const evidenceId of evidenceIds) {
    const evidence = payload.evidence.find((item) => item.evidenceId === evidenceId)
    const title = evidence?.title ?? evidenceId
    const match = title.match(PERIOD_VARIANT_TITLE)
    const key = match ? `${match[1]}同比` : title
    let group = byKey.get(key)
    if (!group) {
      group = { key, title: key, sharedPeriod: null, items: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.items.push({ evidenceId, variant: match ? match[2] : null, period: evidence?.period ?? null })
  }
  for (const group of groups) {
    const periods = [...new Set(group.items.map((item) => item.period ?? "").filter(Boolean))]
    group.sharedPeriod = periods.length === 1 ? periods[0] : null
  }
  return groups
}

export default function ResearchSidekickPanel({
  payload,
  width,
  mode,
  turns,
  contextItems,
  input,
  status,
  draft,
  notice,
  suggestions,
  onWidthChange,
  onClose,
  onModeChange,
  onInputChange,
  onSubmit,
  onStop,
  onSuggestion,
  onEvidence,
  onDimension,
  onSaveTurn,
  onConfirmDraft,
  onDiscardDraft,
}: {
  payload: ResearchSpacePayload
  width: number
  mode: SidekickMode
  turns: SidekickTurn[]
  contextItems: ContextItem[]
  input: string
  status: "idle" | "loading"
  draft: ResearchAngleDraft | null
  notice: string | null
  suggestions: string[]
  onWidthChange: (width: number) => void
  onClose: () => void
  onModeChange: (mode: SidekickMode) => void
  onInputChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  onSuggestion: (value: string) => void
  onEvidence: (evidenceId: string) => void
  onDimension: (dimensionId: string) => void
  onSaveTurn: (turn: SidekickTurn) => void
  onConfirmDraft: () => void
  onDiscardDraft: () => void
}) {
  const threadRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const lastTurnRef = useRef<{ id: string; status: SidekickTurnStatus } | null>(null)

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const state = resizeRef.current
      if (!state) return
      onWidthChange(Math.max(360, Math.min(560, state.startWidth + state.startX - event.clientX)))
    }
    const onUp = () => {
      resizeRef.current = null
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
  }, [onWidthChange])

  useEffect(() => {
    const element = threadRef.current
    const latest = turns.at(-1)
    if (!element || !latest) return
    const previous = lastTurnRef.current
    const frame = window.requestAnimationFrame(() => {
      if (!previous || previous.id !== latest.id) {
        element.scrollTop = element.scrollHeight
        return
      }
      if (previous.status === "running" && latest.status !== "running") {
        const turn = element.querySelector<HTMLElement>(`[data-sidekick-turn="${latest.id}"]`)
        if (turn) element.scrollTo({ top: Math.max(0, turn.offsetTop - 16), behavior: "smooth" })
      }
    })
    lastTurnRef.current = { id: latest.id, status: latest.status }
    return () => window.cancelAnimationFrame(frame)
  }, [turns])

  useEffect(() => {
    const element = threadRef.current
    if (!element || !draft) return
    const frame = window.requestAnimationFrame(() => element.scrollTo({ top: element.scrollHeight, behavior: "smooth" }))
    return () => window.cancelAnimationFrame(frame)
  }, [draft])

  return (
    <aside
      data-sidekick-panel
      className="absolute bottom-0 right-0 top-0 z-[90] flex max-w-full flex-col border-l shadow-[-22px_0_50px_rgba(17,21,27,0.07)]"
      style={{ width, borderColor: COLORS.hair, color: COLORS.ink, background: "#F7F8FA" }}
    >
      <div
        data-sidekick-resize
        aria-label="调整 AI 面板宽度"
        className="absolute bottom-0 left-[-5px] top-0 hidden w-[10px] cursor-col-resize md:block"
        onPointerDown={(event) => {
          resizeRef.current = { startX: event.clientX, startWidth: width }
          document.body.style.cursor = "col-resize"
          document.body.style.userSelect = "none"
        }}
      />

      <header className="border-b bg-white px-5 pb-4 pt-4" style={{ borderColor: COLORS.hair }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[8.5px] tracking-[0.22em]" style={{ color: COLORS.secondary }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: COLORS.blue }} />
              STOCKLENS AI · CANVAS CONTEXT ON
            </div>
            <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.02em]">研究助手</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: COLORS.secondary }}>
              沿当前画布分析，所有写入都由你确认。
            </p>
          </div>
          <button
            type="button"
            data-sidekick-close
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border text-[15px] hover:bg-black/[0.03]"
            style={{ borderColor: COLORS.hair, color: COLORS.secondary }}
            aria-label="收起 AI Research Sidekick"
          >
            ×
          </button>
        </div>

        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5" data-sidekick-context>
          <span className="shrink-0 font-mono text-[8.5px] tracking-[0.14em]" style={{ color: COLORS.secondary }}>CONTEXT</span>
          {contextItems.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onClick={() => item.kind === "dimension" && onDimension(item.id)}
              className="shrink-0 rounded-full border px-2.5 py-1 font-mono text-[9px]"
              style={{
                borderColor: item.kind === "company" ? COLORS.hair : "rgba(47,102,255,0.3)",
                color: item.kind === "company" ? COLORS.secondary : COLORS.blue,
                background: item.kind === "company" ? "transparent" : COLORS.blueSoft,
              }}
            >
              {item.kind === "company" ? "公司" : item.kind === "dimension" ? "维度" : item.kind === "claim" ? "结论" : "证据"} · {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="border-b bg-white px-5 py-3" style={{ borderColor: COLORS.hair }}>
        <div className="grid grid-cols-2 rounded-lg p-1" style={{ background: "#F1F3F6" }}>
        {(["ask", "angle"] as const).map((item) => (
          <button
            key={item}
            type="button"
            data-sidekick-mode={item}
            onClick={() => onModeChange(item)}
            className="rounded-md px-3 py-2 text-[11.5px] font-medium transition"
            style={{
              color: mode === item ? COLORS.ink : COLORS.secondary,
              background: mode === item ? "#FFFFFF" : "transparent",
              boxShadow: mode === item ? "0 1px 3px rgba(17,21,27,0.10)" : "none",
            }}
          >
            {item === "ask" ? "提问" : "＋ 新增研究角度"}
          </button>
        ))}
        </div>
      </div>

      <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ overscrollBehavior: "contain" }}>
        {mode === "ask" ? (
          <>
            {turns.length === 0 && (
              <div data-sidekick-empty className="rounded-2xl border bg-white p-4" style={{ borderColor: COLORS.hair }}>
                <div className="font-mono text-[9.5px] tracking-[0.2em]" style={{ color: COLORS.secondary }}>
                  START WITH CONTEXT
                </div>
                <p className="mt-2 max-w-[34ch] text-[16px] font-medium leading-[1.45]">
                  选中画布内容，问题会自动带上它的证据。
                </p>
                <div className="mt-4 space-y-1">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => onSuggestion(suggestion)}
                      className="group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[11.5px] leading-relaxed hover:bg-black/[0.025]"
                      style={{ color: COLORS.secondary }}
                    >
                      <span>{suggestion}</span><span className="opacity-35 transition group-hover:opacity-80">→</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-6">
              {turns.map((turn) => {
                const evidenceIds = [...new Set(turn.evidenceIds)].slice(0, 5)
                const sourceGroups = groupSourceLinks(evidenceIds, payload)
                const sections = [
                  { key: "confirmed", label: "可以确认", items: turn.confirmed ?? [], color: COLORS.blue },
                  { key: "inferred", label: "证据推断", items: turn.inferred ?? [], color: COLORS.secondary },
                  { key: "unknown", label: "仍不能确认", items: turn.unknowns ?? [], color: COLORS.amber },
                ].filter((section) => section.items.length > 0)
                return (
                  <article key={turn.id} data-sidekick-turn={turn.id}>
                    <div className="ml-10 rounded-[14px_14px_4px_14px] px-3.5 py-2.5 text-[12px] leading-relaxed" style={{ background: "#EDEFF3" }}>
                      {turn.question}
                    </div>
                    <div className="mt-2.5 rounded-2xl border bg-white p-4" style={{ borderColor: COLORS.hair }}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[8.5px] tracking-[0.18em]" style={{ color: COLORS.blue }}>
                          RESEARCH BRIEF · {turn.scopeLabel}
                        </span>
                        {turn.status === "completed" && (
                          <button type="button" onClick={() => onSaveTurn(turn)} className="rounded-full border px-2 py-1 font-mono text-[8.5px] hover:bg-black/[0.025]" style={{ borderColor: COLORS.hair, color: COLORS.secondary }}>
                            ＋ 便签
                          </button>
                        )}
                      </div>
                      {turn.status === "running" && (
                        <div className="mt-4 flex items-center gap-2 text-[11.5px]" style={{ color: COLORS.secondary }}>
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: COLORS.blue }} />
                          正在核对 {evidenceIds.length} 条证据并组织回答…
                        </div>
                      )}
                      {turn.status === "failed" && <p className="mt-4 text-[11.5px]" style={{ color: COLORS.coral }}>回答暂时失败，画布和证据没有受到影响。</p>}
                      {turn.status === "stopped" && <p className="mt-4 text-[11.5px]" style={{ color: COLORS.coral }}>已停止本次等待。</p>}
                      {turn.status === "completed" && (
                        <div className="mt-3.5 space-y-3.5 text-[12px] leading-[1.6]">
                          {turn.summary && <p className="text-[13.5px] font-medium leading-[1.65] tracking-[-0.005em]">{turn.summary}</p>}

                          {sections.length > 0 && (
                            <div className="grid grid-cols-3 gap-1.5 border-y py-3" style={{ borderColor: COLORS.hair }}>
                              {sections.map((section) => (
                                <div key={section.key} className="rounded-lg px-2 py-2" style={{ background: section.key === "unknown" ? "rgba(166,111,24,0.06)" : "#F7F8FA" }}>
                                  <div className="font-mono text-[8px] tracking-[0.08em]" style={{ color: section.color }}>{section.label}</div>
                                  <div className="mt-1 font-mono text-[15px]" style={{ color: COLORS.ink }}>{section.items.length}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {sections.map((section, sectionIndex) => (
                            <details key={section.key} open={sectionIndex === 0} className="group border-b pb-2" style={{ borderColor: COLORS.hair }}>
                              <summary className="flex cursor-pointer list-none items-center justify-between py-1 font-mono text-[9px] tracking-[0.14em]" style={{ color: section.color }}>
                                <span>{section.label}</span><span className="transition group-open:rotate-45">＋</span>
                              </summary>
                              <ul className="mt-1.5 space-y-1.5" style={{ color: section.key === "unknown" ? COLORS.secondary : COLORS.ink }}>
                                {section.items.slice(0, 4).map((item, index) => <li key={`${item}-${index}`} className="pl-3 before:-ml-3 before:mr-2 before:content-['·']">{item}</li>)}
                              </ul>
                            </details>
                          ))}

                          {evidenceIds.length > 0 && (
                            <section>
                              <div className="flex items-center justify-between font-mono text-[8.5px] tracking-[0.14em]" style={{ color: COLORS.secondary }}>
                                <span>SOURCES</span><span>{evidenceIds.length} VERIFIED LINKS</span>
                              </div>
                              <div className="mt-2 overflow-hidden rounded-xl border" style={{ borderColor: COLORS.hair }}>
                                {sourceGroups.map((group, index) => {
                                  if (group.items.length === 1 && group.items[0].variant === null) {
                                    const item = group.items[0]
                                    return (
                                      <button
                                        key={group.key}
                                        type="button"
                                        data-sidekick-evidence={item.evidenceId}
                                        onClick={() => onEvidence(item.evidenceId)}
                                        className="flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-[rgba(47,102,255,0.05)]"
                                        style={{ borderColor: COLORS.hair }}
                                      >
                                        <span className="font-mono text-[9px]" style={{ color: COLORS.blue }}>{String(index + 1).padStart(2, "0")}</span>
                                        <span className="min-w-0 flex-1 truncate text-[11px]">{group.title}</span>
                                        <span className="shrink-0 font-mono text-[8px]" style={{ color: COLORS.secondary }}>{item.period ?? ""} ↗</span>
                                      </button>
                                    )
                                  }
                                  return (
                                    <div key={group.key} className="flex w-full items-center gap-2 border-b px-3 py-2 last:border-b-0" style={{ borderColor: COLORS.hair }}>
                                      <span className="font-mono text-[9px]" style={{ color: COLORS.blue }}>{String(index + 1).padStart(2, "0")}</span>
                                      <span className="min-w-0 flex-1 truncate text-[11px]">{group.title}</span>
                                      {group.items.map((item) => {
                                        const chipLabel = item.variant ?? (group.sharedPeriod ? "证据" : item.period ?? "证据")
                                        return (
                                          <button
                                            key={item.evidenceId}
                                            type="button"
                                            data-sidekick-evidence={item.evidenceId}
                                            onClick={() => onEvidence(item.evidenceId)}
                                            className="shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[8px] hover:bg-[rgba(47,102,255,0.08)]"
                                            style={{ borderColor: COLORS.hair, color: COLORS.blue }}
                                          >
                                            {chipLabel}{item.variant && !group.sharedPeriod && item.period ? ` · ${item.period}` : ""} ↗
                                          </button>
                                        )
                                      })}
                                      {group.sharedPeriod && (
                                        <span className="shrink-0 font-mono text-[8px]" style={{ color: COLORS.secondary }}>{group.sharedPeriod} ↗</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </section>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        ) : (
          <div data-sidekick-angle>
            {!draft ? (
              <>
                <div className="font-mono text-[9.5px] tracking-[0.2em]" style={{ color: COLORS.secondary }}>CREATE WITH AI</div>
                <h3 className="mt-3 text-[21px] font-semibold leading-tight">先形成研究计划，再写入画布</h3>
                <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: COLORS.secondary }}>
                  描述你想理解的问题。StockLens 会把模糊意图整理成可验证的研究角度，确认前不会改变画布。
                </p>
                <div className="mt-6 grid gap-2">
                  {(payload.suggestions ?? []).slice(0, 3).map((suggestion) => (
                    <button key={suggestion.label} type="button" onClick={() => onSuggestion(suggestion.researchQuestion || suggestion.label)} className="rounded-lg border px-3 py-3 text-left hover:bg-black/[0.025]" style={{ borderColor: COLORS.hair }}>
                      <span className="block text-[12.5px] font-medium">{suggestion.label}</span>
                      <span className="mt-1 block text-[11px] leading-relaxed" style={{ color: COLORS.secondary }}>{suggestion.rationale}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div data-sidekick-draft className="rounded-xl border p-4" style={{ borderColor: "rgba(47,102,255,0.34)", background: "rgba(47,102,255,0.035)" }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[9px] tracking-[0.2em]" style={{ color: COLORS.blue }}>研究计划草稿</span>
                  <span className="font-mono text-[9px]" style={{ color: COLORS.secondary }}>尚未写入画布</span>
                </div>
                <h3 className="mt-4 text-[21px] font-semibold">{draft.title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: COLORS.secondary }}>{draft.researchQuestion}</p>
                <p className="mt-4 border-l-2 pl-3 text-[11.5px] leading-relaxed" style={{ borderColor: COLORS.blue, color: COLORS.secondary }}>{draft.rationale}</p>
                <div className="mt-5 font-mono text-[9px] tracking-[0.18em]" style={{ color: COLORS.secondary }}>计划验证</div>
                <ul className="mt-2 space-y-2 text-[12px]">{draft.checks.map((item) => <li key={item} className="flex gap-2"><span style={{ color: COLORS.blue }}>○</span><span>{item}</span></li>)}</ul>
                <div className="mt-5 flex items-center justify-between border-t pt-3 font-mono text-[9.5px]" style={{ borderColor: COLORS.hair, color: COLORS.secondary }}>
                  <span>预计匹配约 {draft.evidenceCount} 条现有证据</span>
                  <span>提交后真实取证</span>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                  <button type="button" data-sidekick-apply onClick={onConfirmDraft} className="rounded-lg px-3 py-2.5 text-[12px] font-medium text-white" style={{ background: COLORS.blue }}>加入研究空间</button>
                  <button type="button" data-sidekick-discard onClick={onDiscardDraft} className="rounded-lg border px-3 py-2.5 text-[12px]" style={{ borderColor: COLORS.hair, color: COLORS.secondary }}>放弃</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {notice && <div data-sidekick-notice className="mx-5 mb-2 rounded-lg px-3 py-2 text-[11.5px]" style={{ background: COLORS.blueSoft, color: COLORS.blue }}>{notice}</div>}

      <footer className="border-t p-3.5" style={{ borderColor: COLORS.hair, background: COLORS.surfaceRaised }}>
        <div className="rounded-xl border bg-white p-2 shadow-sm" style={{ borderColor: status === "loading" ? "rgba(47,102,255,0.45)" : COLORS.hair }}>
          <textarea
            data-sidekick-input
            rows={2}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                onSubmit()
              }
            }}
            placeholder={mode === "ask" ? "沿当前研究上下文继续问…" : "例如：海外收入增长是否带来利润贡献？"}
            className="w-full resize-none bg-transparent px-2 py-1 text-[12.5px] leading-relaxed outline-none"
          />
          <div className="mt-1 flex items-center justify-between gap-3 px-1">
            <span className="font-mono text-[9px]" style={{ color: COLORS.secondary }}>Enter 发送 · Shift+Enter 换行</span>
            <button
              type="button"
              data-sidekick-send
              onClick={status === "loading" ? onStop : onSubmit}
              disabled={status !== "loading" && input.trim().length === 0}
              className="grid h-8 min-w-8 place-items-center rounded-full px-2 text-[12px] text-white disabled:opacity-35"
              style={{ background: status === "loading" ? COLORS.coral : COLORS.blue }}
            >
              {status === "loading" ? "■" : "↑"}
            </button>
          </div>
        </div>
      </footer>
    </aside>
  )
}
