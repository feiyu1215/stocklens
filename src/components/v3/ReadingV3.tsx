"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { Evidence } from "@/lib/evidence/types"
import type { MetricResult } from "@/lib/metrics/types"
import { formatMetricValue } from "@/lib/presentation/formatters"
import type { ResearchClaim } from "@/lib/research/claims"
import type { ResearchDimension } from "@/lib/research/dimension-schema"
import { V3_PALETTE } from "@/lib/v3/media"

// Reading（Task 15.2 UI RESET §49–§56）：冷白 Reading Canvas。
// Claim Spine（大字正文 + 证据锚点）与 Evidence Rail（editorial column + 竖 rule，非 card panel）
// 保留既有信息设计，视觉全部重做；锚点 hover → 预览、click → 钉住（thin line 连接，无新 Card）。

interface SpaceLike {
  company: { stockCode: string; stockName: string; industryName?: string }
  dimensions: ResearchDimension[]
  claims: ResearchClaim[]
  evidence: Evidence[]
  metrics: MetricResult[]
}

interface ThreadState {
  claimId: string
  question: string
  status: "idle" | "loading" | "done" | "failed"
  summary?: string
  confirmed?: string[]
  unknowns?: string[]
  message?: string
}

function anchorGlyph(n: number): string {
  return ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"][n - 1] ?? `(${n})`
}

export default function ReadingV3({
  space,
  dimension,
  flipTitleFrom,
  initialClaimId,
  initialEvidenceId,
  onEvidenceFocus,
  onAsk,
  onBack,
  escOwnedByParent,
}: {
  space: SpaceLike
  dimension: ResearchDimension
  flipTitleFrom: { x: number; y: number; width: number; height: number } | null
  initialClaimId?: string | null
  initialEvidenceId?: string | null
  /** Reading 内点击证据锚点 → 通知 Canvas 高亮同一证据（§24） */
  onEvidenceFocus?: (evidenceId: string | null) => void
  /** §24/§26：ASK 统一聚焦全局 AI Lens（单 composer），不再内联第二套输入框 */
  onAsk?: (claimId: string) => void
  /** §A2：上层已持有单一 Esc 优先级链时置 true——本组件只处理自己的局部状态，退出 Reading 交给上层 */
  escOwnedByParent?: boolean
  onBack: () => void
}) {
  const claims = useMemo(
    () => space.claims.filter((c) => c.dimensionId === dimension.dimensionId),
    [space.claims, dimension.dimensionId],
  )
  const spine = claims.filter((c) => c.type !== "unknown")
  const unknownClaims = claims.filter((c) => c.type === "unknown")
  const dimEvidence = useMemo(
    () => dimension.evidenceIds.map((id) => space.evidence.find((e) => e.evidenceId === id)).filter((e): e is Evidence => Boolean(e)),
    [dimension.evidenceIds, space.evidence],
  )
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(initialEvidenceId ?? null)
  const [activeClaimId, setActiveClaimId] = useState<string | null>(initialClaimId ?? null)
  const [thread, setThread] = useState<ThreadState | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [formulaOpen, setFormulaOpen] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Shared element：Dimension title 从 world annotation FLIP 到 reading header（§50）
  useEffect(() => {
    const el = titleRef.current
    if (!el || !flipTitleFrom) return
    const to = el.getBoundingClientRect()
    el.style.transformOrigin = "top left"
    el.style.transform = `translate(${flipTitleFrom.x - to.x}px, ${flipTitleFrom.y - to.y}px) scale(${Math.max(flipTitleFrom.width / Math.max(to.width, 1), 0.25)})`
    el.style.opacity = "0.85"
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "transform 620ms cubic-bezier(0.22,1,0.36,1), opacity 420ms ease-out"
        el.style.transform = "translate(0,0) scale(1)"
        el.style.opacity = "1"
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [flipTitleFrom])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (thread) setThread(null)
        else if (challengeId) setChallengeId(null)
        else if (!escOwnedByParent) onBack()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [thread, challengeId, onBack, escOwnedByParent])

  const runThread = useCallback(
    async (claim: ResearchClaim) => {
      const q = thread?.claimId === claim.claimId ? thread.question : ""
      if (!q.trim()) return
      setThread({ claimId: claim.claimId, question: q, status: "loading" })
      try {
        const res = await fetch("/api/followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stockCode: space.company.stockCode,
            question: q.trim(),
            evidenceIds: claim.evidenceIds.length ? claim.evidenceIds : dimension.evidenceIds.slice(0, 4),
          }),
        })
        const body = await res.json()
        if (!res.ok) {
          setThread({ claimId: claim.claimId, question: q, status: "failed", message: body?.error ?? `服务返回 ${res.status}` })
          return
        }
        if (body.mode === "compliance_redirect") {
          setThread({ claimId: claim.claimId, question: q, status: "done", summary: body.compliance?.message })
          return
        }
        const s = body.synthesis
        setThread({
          claimId: claim.claimId,
          question: q,
          status: "done",
          summary: s?.summary?.text,
          confirmed: (s?.confirmedFacts ?? []).map((x: { text: string }) => x.text),
          unknowns: (s?.unknowns ?? []).map((x: { text: string }) => x.text),
        })
      } catch {
        setThread({ claimId: claim.claimId, question: q, status: "failed", message: "追问服务暂时未响应，已验证证据仍可查看。" })
      }
    },
    [thread, space.company.stockCode, dimension.evidenceIds],
  )

  const railEvidence = dimEvidence.find((e) => e.evidenceId === (previewId ?? pinnedId)) ?? dimEvidence[0] ?? null
  const railMetrics = (railEvidence?.metricIds ?? []).map((m) => space.metrics.find((x) => x.metricId === m)).filter((m): m is MetricResult => Boolean(m))

  return (
    <div
      className="absolute inset-0 z-50 grid"
      style={{
        background: V3_PALETTE.bg,
        color: V3_PALETTE.ink,
        gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 22vw)",
        overflowX: "hidden",
      }}
    >
      {/* 中：Claim Spine */}
      <div className="relative min-w-0 overflow-y-auto overflow-x-hidden px-12 pb-36 pt-10">
        <div className="font-mono text-[10px] tracking-[0.28em]" style={{ color: V3_PALETTE.secondary }}>
          {space.company.stockCode} · RESEARCH READING
        </div>
        <div className="mt-2 flex items-end justify-between">
          <h1
            ref={titleRef}
            className="font-medium leading-[1.06] tracking-[-0.01em]"
            style={{
              fontSize: "clamp(38px, 3.4vw, 52px)",
              whiteSpace: "normal",
              overflow: "visible",
              wordBreak: "keep-all",
              maxWidth: "100%",
            }}
          >
            {dimension.label}
          </h1>
          <button
            type="button"
            onClick={onBack}
            className="mb-2 font-mono text-[11px] tracking-[0.18em] transition hover:opacity-70"
            style={{ color: V3_PALETTE.secondary }}
          >
            ← BACK TO WORLD
          </button>
        </div>
        <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed" style={{ color: V3_PALETTE.secondary }}>
          {dimension.researchQuestion}
        </p>
        <div className="mt-3 flex items-center gap-4 font-mono text-[10.5px] tracking-[0.16em]" style={{ color: V3_PALETTE.secondary }}>
          <span>{dimEvidence.filter((e) => e.type === "fact").length} VERIFIED</span>
          {claims.some((c) => c.signal === "conflict") && (
            <span style={{ color: V3_PALETTE.coral }}>{claims.filter((c) => c.signal === "conflict").length} CONFLICT</span>
          )}
          {unknownClaims.length > 0 && <span style={{ color: V3_PALETTE.amber }}>{unknownClaims.length} UNKNOWN</span>}
          <span>{dimension.status.toUpperCase()}</span>
        </div>

        <ol className="mt-12 space-y-12" style={{ maxWidth: 720 }}>
          {spine.map((claim, index) => {
            const isActive = activeClaimId === claim.claimId
            const isChallenge = challengeId === claim.claimId
            const isThread = thread?.claimId === claim.claimId
            return (
              <li key={claim.claimId} data-claim-id={claim.claimId}>
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-[11px]" style={{ color: V3_PALETTE.secondary }}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1">
                    <div className="font-mono text-[9.5px] tracking-[0.22em]" style={{ color: V3_PALETTE.secondary }}>
                      {claim.type.toUpperCase()}
                      {claim.signal !== "neutral" && claim.signal !== "unknown" && (
                        <span className="ml-2" style={{ color: claim.signal === "conflict" ? V3_PALETTE.coral : V3_PALETTE.blue }}>
                          {claim.signal.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p
                      className="mt-2 cursor-text text-[22px] leading-[1.45] tracking-[-0.005em]"
                      style={{ opacity: activeClaimId && !isActive ? 0.42 : 1, transition: "opacity 280ms ease-out" }}
                      onClick={() => {
                        setActiveClaimId(claim.claimId)
                        setPinnedId(null)
                      }}
                    >
                      {claim.text}
                    </p>
                    {/* 证据锚点（§56：thin line 连接，无 Card） */}
                    <div className="mt-3 flex items-center gap-3">
                      {claim.evidenceIds.map((id, i) => (
                        <button
                          key={id}
                          type="button"
                          onMouseEnter={() => setPreviewId(id)}
                          onMouseLeave={() => setPreviewId(null)}
                          onClick={() => {
                            setActiveClaimId(claim.claimId)
                            const next = pinnedId === id ? null : id
                            setPinnedId(next)
                            onEvidenceFocus?.(next)
                          }}
                          aria-label={`证据 ${i + 1}`}
                          className="font-mono text-[15px] transition"
                          style={{ color: pinnedId === id ? V3_PALETTE.blue : V3_PALETTE.secondary }}
                        >
                          {anchorGlyph(i + 1)}
                        </button>
                      ))}
                      <span className="mx-2 h-px flex-1" style={{ background: "rgba(16,19,24,0.12)" }} />
                      <button
                        type="button"
                        onClick={() => {
                          setActiveClaimId(claim.claimId)
                          if (onAsk) {
                            onAsk(claim.claimId)
                            return
                          }
                          setThread({ claimId: claim.claimId, question: "", status: "idle" })
                        }}
                        className="font-mono text-[10.5px] tracking-[0.18em] transition hover:opacity-70"
                        style={{ color: V3_PALETTE.secondary }}
                      >
                        ASK
                      </button>
                      <button
                        type="button"
                        onClick={() => setChallengeId(isChallenge ? null : claim.claimId)}
                        className="font-mono text-[10.5px] tracking-[0.18em] transition hover:opacity-70"
                        style={{ color: isChallenge ? V3_PALETTE.blue : V3_PALETTE.secondary }}
                      >
                        CHALLENGE
                      </button>
                    </div>

                    {/* Inline follow-up（§2 checklist） */}
                    {isThread && (
                      <div className="mt-5 border-l pl-5" style={{ borderColor: "rgba(16,19,24,0.14)" }}>
                        {thread.status === "idle" || thread.status === "loading" ? (
                          <div className="flex items-center gap-3">
                            <input
                              autoFocus
                              value={thread.question}
                              onChange={(e) => setThread({ ...thread, question: e.target.value })}
                              onKeyDown={(e) => e.key === "Enter" && void runThread(claim)}
                              placeholder="沿这条结论继续问…"
                              className="w-full max-w-[420px] bg-transparent pb-1 text-[15px] outline-none"
                              style={{ borderBottom: "1px solid rgba(16,19,24,0.2)" }}
                            />
                            <button
                              type="button"
                              onClick={() => void runThread(claim)}
                              className="font-mono text-[10.5px] tracking-[0.2em]"
                              style={{ color: V3_PALETTE.blue }}
                            >
                              {thread.status === "loading" ? "…" : "ASK →"}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2 text-[14px] leading-relaxed" style={{ color: V3_PALETTE.secondary }}>
                            {thread.summary && <p style={{ color: V3_PALETTE.ink }}>{thread.summary}</p>}
                            {thread.confirmed?.length ? <p>当前证据可以确认：{thread.confirmed.join("；")}</p> : null}
                            {thread.unknowns?.length ? <p>当前证据不能确认：{thread.unknowns.join("；")}</p> : null}
                            {thread.message && <p>{thread.message}</p>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Challenge 三层（§2 checklist：SUPPORT / COUNTER / UNKNOWN） */}
                    {isChallenge && (
                      <div className="mt-5 space-y-4 border-l pl-5" style={{ borderColor: "rgba(16,19,24,0.14)" }}>
                        <div>
                          <div className="font-mono text-[9.5px] tracking-[0.22em]" style={{ color: V3_PALETTE.secondary }}>
                            SUPPORT
                          </div>
                          <ul className="mt-1.5 space-y-1 text-[13.5px]">
                            {claim.evidenceIds.slice(0, 3).map((id, i) => {
                              const ev = dimEvidence.find((e) => e.evidenceId === id)
                              return (
                                <li key={id}>
                                  <span className="mr-2 font-mono text-[10.5px]" style={{ color: V3_PALETTE.secondary }}>
                                    {anchorGlyph(i + 1)}
                                  </span>
                                  {ev?.statement ?? id}
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                        <div>
                          <div className="font-mono text-[9.5px] tracking-[0.22em]" style={{ color: V3_PALETTE.coral }}>
                            COUNTER-SIGNALS
                          </div>
                          <ul className="mt-1.5 space-y-1 text-[13.5px]">
                            {dimEvidence
                              .filter((e) => e.signal === "conflict" || e.signal === "negative")
                              .slice(0, 3)
                              .map((e) => (
                                <li key={e.evidenceId}>
                                  <span className="mr-2 font-mono text-[10.5px]" style={{ color: V3_PALETTE.secondary }}>
                                    ·
                                  </span>
                                  {e.statement}
                                </li>
                              ))}
                            {dimEvidence.filter((e) => e.signal === "conflict" || e.signal === "negative").length === 0 && (
                              <li style={{ color: V3_PALETTE.secondary }}>当前维度内未见方向相反的已验证证据。</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <div className="font-mono text-[9.5px] tracking-[0.22em]" style={{ color: V3_PALETTE.amber }}>
                            UNKNOWN
                          </div>
                          <ul className="mt-1.5 space-y-1 text-[13.5px]" style={{ color: V3_PALETTE.secondary }}>
                            {unknownClaims.slice(0, 2).map((c) => (
                              <li key={c.claimId}>{c.text}</li>
                            ))}
                            {unknownClaims.length === 0 && <li>该维度暂无标注为未知的结论。</li>}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        {unknownClaims.length > 0 && (
          <div className="mt-12 max-w-[640px] border-t pt-5" style={{ borderColor: "rgba(16,19,24,0.12)" }}>
            <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: V3_PALETTE.amber }}>
              EVIDENCE INCOMPLETE
            </div>
            <ul className="mt-2 space-y-1.5 text-[14.5px] leading-relaxed" style={{ color: V3_PALETTE.secondary }}>
              {unknownClaims.map((c) => (
                <li key={c.claimId}>{c.text}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 右：Evidence Rail（editorial column + 竖 rule，§55） */}
      <aside
        className="relative min-w-0 overflow-y-auto border-l pl-6 pr-6 pt-10"
        style={{ borderColor: "rgba(16,19,24,0.1)", width: 316 }}
      >
        {railEvidence ? (
          <>
            <div className="flex items-center justify-between font-mono text-[9.5px] tracking-[0.24em]" style={{ color: V3_PALETTE.secondary }}>
              <span>{previewId && previewId !== pinnedId ? "PREVIEWING" : pinnedId ? "PINNED" : "EVIDENCE"}</span>
              <span style={{ color: V3_PALETTE.secondary }}>
                {railEvidence.verifyStatus === "verified" ? "VERIFIED" : "UNVERIFIED"}
              </span>
            </div>
            <h3 className="mt-4 text-[19px] font-medium leading-snug">{railEvidence.title}</h3>
            <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: V3_PALETTE.secondary }}>
              {railEvidence.statement}
            </p>
            {railEvidence.interpretationNote && (
              <div className="mt-4 border-l pl-4 text-[12px] leading-relaxed" style={{ borderColor: V3_PALETTE.amber, color: V3_PALETTE.amber }}>
                {railEvidence.interpretationNote}
              </div>
            )}
            <div className="mt-6 space-y-4">
              {railMetrics.map((m) => (
                <div key={m.metricId} className="border-t pt-2.5" style={{ borderColor: "rgba(16,19,24,0.1)" }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px]" style={{ color: V3_PALETTE.secondary }}>
                      {m.name}
                    </span>
                    <span className="font-mono text-[17px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatMetricValue(m)}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-3 font-mono text-[10px]" style={{ color: V3_PALETTE.secondary }}>
                    {m.period && <span>{m.period}</span>}
                    {m.comparisonPeriod && <span>vs {m.comparisonPeriod}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 space-y-1 border-t pt-3 font-mono text-[10px] leading-relaxed" style={{ borderColor: "rgba(16,19,24,0.1)", color: V3_PALETTE.secondary }}>
              <div>FUYAO{railEvidence.sourceFields?.[0]?.field ? ` · ${railEvidence.sourceFields[0].field}` : ""}</div>
              <div>{railEvidence.period ?? ""}</div>
              <div>{railEvidence.verifyStatus === "verified" ? "VERIFIED" : "UNVERIFIED"}</div>
            </div>
            {railMetrics.some((m) => m.calculationMethod && m.calculationMethod !== "-") && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setFormulaOpen((v) => !v)}
                  className="font-mono text-[10.5px] tracking-[0.16em]"
                  style={{ color: V3_PALETTE.blue }}
                >
                  CALCULATION {formulaOpen ? "▾" : "→"}
                </button>
                {formulaOpen && (
                  <pre className="mt-2 whitespace-pre-wrap rounded-sm px-3 py-2 font-mono text-[10.5px] leading-relaxed" style={{ background: V3_PALETTE.bgDeep, color: V3_PALETTE.secondary }}>
                    {railMetrics[0].calculationMethod}
                  </pre>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                const next = pinnedId === railEvidence.evidenceId ? null : railEvidence.evidenceId
                setPinnedId(next)
                onEvidenceFocus?.(next)
              }}
              className="mt-6 font-mono text-[10.5px] tracking-[0.16em] transition hover:opacity-70"
              style={{ color: V3_PALETTE.secondary }}
            >
              {pinnedId === railEvidence.evidenceId ? "UNPIN" : "PIN EVIDENCE"}
            </button>
          </>
        ) : (
          <div className="font-mono text-[11px]" style={{ color: V3_PALETTE.secondary }}>
            EVIDENCE — 悬停结论旁的锚点查看证据
          </div>
        )}
      </aside>
    </div>
  )
}

/** 左侧 media strip：小幅静态 cool media（§53 continuity；零逐帧成本） */
