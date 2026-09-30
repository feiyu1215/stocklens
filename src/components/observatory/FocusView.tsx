"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import type { Evidence } from "@/lib/evidence/types"
import type { MetricResult } from "@/lib/metrics/types"
import type { ResearchClaim } from "@/lib/research/claims"
import type { ResearchDimension } from "@/lib/research/dimension-schema"
import { formatMetricValue } from "@/lib/presentation/formatters"
import {
  OBSERVATORY_COLORS,
  STATUS_LABEL,
  anchorGlyph,
  claimAnchorIndex,
  claimTypeLabel,
  evidenceColor,
  type ResearchSpacePayload,
} from "./theme"

// Scene D｜Dimension Focus（Visual Spec §27–§53）：
// 深色空间里展开成 warm ivory Research Surface：
// 左 Context Strip / 中 Claim Spine（编号论点 + 证据锚点）/ 右常驻 Evidence Rail（hover preview、click pin）。
// 另含 Inline Research Thread（复用 /api/followup）与确定性 Challenge（SUPPORT / COUNTER-SIGNALS / UNKNOWN）。

interface InlineThreadState {
  claimId: string
  question: string
  status: "idle" | "loading" | "success" | "failed" | "redirect"
  answer?: {
    summary: { text: string; evidenceIds: string[] }
    confirmedFacts: { text: string; evidenceIds: string[] }[]
    analysisInferences: { text: string; evidenceIds: string[] }[]
    unknowns: { text: string; evidenceIds: string[] }[]
  }
  message?: string
}

function EvidenceRail({
  evidence,
  metrics,
  pinnedId,
  previewId,
  onPin,
}: {
  evidence: Evidence[]
  metrics: MetricResult[]
  pinnedId: string | null
  previewId: string | null
  onPin: (id: string | null) => void
}) {
  const id = previewId ?? pinnedId ?? evidence[0]?.evidenceId ?? null
  const current = evidence.find((e) => e.evidenceId === id) ?? null
  const [formulaOpen, setFormulaOpen] = useState(false)
  const isPreviewing = previewId !== null && previewId !== pinnedId

  if (!current) {
    return (
      <aside className="w-[340px] shrink-0 border-l border-black/10 p-5 text-[12px] text-[#676A70]">
        EVIDENCE — 悬停论点旁的锚点查看证据
      </aside>
    )
  }

  const linkedMetrics = current.metricIds
    .map((mid) => metrics.find((mm) => mm.metricId === mid))
    .filter((mm): mm is MetricResult => Boolean(mm))
  const color = evidenceColor(current)

  return (
    <aside
      className="flex w-[340px] shrink-0 flex-col border-l border-black/10"
      aria-label="Evidence Rail"
      style={{ transition: "opacity 120ms ease-out" }}
    >
      <div className="flex items-center justify-between border-b border-black/10 px-5 py-3">
        <span className="font-mono text-[10px] tracking-wider text-[#676A70]">
          {isPreviewing ? `PREVIEWING ${anchorGlyph(evidence.indexOf(current) + 1)}` : pinnedId === id ? "PINNED" : "EVIDENCE"}
        </span>
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
          style={{ background: `${color}18`, color, border: `1px solid ${color}55` }}
        >
          {claimTypeLabel(current.type).replace("INFERENCE", "INFERENCE")}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="text-[14px] font-medium text-[#14161B]">{current.title}</div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#3A3D45]">{current.statement}</p>

        {current.interpretationNote && (
          <div
            className="mt-3 rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
            style={{ borderColor: "rgba(234,185,95,0.5)", background: "rgba(234,185,95,0.10)", color: "#7A5A16" }}
          >
            <div className="font-mono text-[10px] tracking-wider">INTERPRETATION CAUTION</div>
            <div className="mt-1">{current.interpretationNote}</div>
          </div>
        )}

        {/* 关联指标（真实数值与口径） */}
        {linkedMetrics.length > 0 && (
          <div className="mt-4 space-y-2">
            {linkedMetrics.map((metric) => (
              <div key={metric.metricId} className="rounded-lg border border-black/10 bg-white/60 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11.5px] text-[#3A3D45]">{metric.name}</span>
                  <span className="font-mono text-[14px] text-[#14161B]">{formatMetricValue(metric)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[10px] text-[#676A70]">
                  {metric.period && <span>{metric.period}</span>}
                  {metric.comparisonPeriod && <span>vs {metric.comparisonPeriod}</span>}
                  {typeof metric.sampleSize === "number" && <span>n={metric.sampleSize}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 技术元数据（FUYAO / 字段 / 验证） */}
        <div className="mt-4 space-y-1 border-t border-black/10 pt-3 font-mono text-[10px] leading-relaxed text-[#676A70]">
          <div>FUYAO{current.sourceFields[0]?.field ? ` · ${current.sourceFields[0].field}` : ""}</div>
          {current.period && <div>{current.period}</div>}
          <div>{current.verifyStatus === "verified" ? "Verified" : "Unverified"}</div>
        </div>

        {linkedMetrics.some((m) => m.calculationMethod && m.calculationMethod !== "-") && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setFormulaOpen((v) => !v)}
              className="font-mono text-[10px] text-[#45B8FF] transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
            >
              Calculation {formulaOpen ? "▾" : "→"}
            </button>
            {formulaOpen && (
              <pre className="mt-1.5 whitespace-pre-wrap break-words rounded bg-black/5 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-[#3A3D45]">
                {linkedMetrics[0].calculationMethod}
              </pre>
            )}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onPin(pinnedId === id ? null : id)}
            className="rounded-md border border-black/15 px-2.5 py-1 text-[11px] text-[#3A3D45] transition hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
          >
            {pinnedId === id ? "Unpin" : "Pin evidence"}
          </button>
        </div>
      </div>
    </aside>
  )
}

/** 确定性 Challenge（§49–§53/§60–§61）：不新增 LLM 调用 */
function ChallengeLayers({
  claim,
  dimensionEvidence,
  onOpenEvidence,
}: {
  claim: ResearchClaim
  dimensionEvidence: Evidence[]
  onOpenEvidence: (id: string) => void
}) {
  const support = claim.evidenceIds
    .map((id) => dimensionEvidence.find((e) => e.evidenceId === id))
    .filter((e): e is Evidence => Boolean(e))
  const claimSignals = new Set(support.map((e) => e.signal))
  const counterSignals = dimensionEvidence.filter((e) => {
    if (claim.evidenceIds.includes(e.evidenceId)) return false
    if (e.signal === "conflict") return true
    // 「方向相反」（counter-signals，不是严格矛盾，§61）
    if (claimSignals.has("positive") && e.signal === "negative") return true
    if (claimSignals.has("negative") && e.signal === "positive") return true
    return false
  })
  const unknowns = dimensionEvidence.filter((e) => e.type === "unknown")

  return (
    <div className="mt-3 space-y-2">
      <div className="rounded-lg border border-black/10 bg-white/70 px-3 py-2">
        <div className="font-mono text-[10px] tracking-wider text-[#676A70]">SUPPORT</div>
        <ul className="mt-1 space-y-1">
          {support.map((e) => (
            <li key={e.evidenceId}>
              <button
                type="button"
                onClick={() => onOpenEvidence(e.evidenceId)}
                className="text-left text-[12px] text-[#3A3D45] underline decoration-dotted underline-offset-2 transition hover:text-[#14161B]"
              >
                {e.title}
              </button>
            </li>
          ))}
          {support.length === 0 && <li className="text-[11px] text-[#676A70]">无直接支持证据</li>}
        </ul>
      </div>
      <div className="rounded-lg border border-black/10 bg-white/70 px-3 py-2">
        <div className="font-mono text-[10px] tracking-wider text-[#676A70]">COUNTER-SIGNALS</div>
        <ul className="mt-1 space-y-1">
          {counterSignals.map((e) => (
            <li key={e.evidenceId}>
              <button
                type="button"
                onClick={() => onOpenEvidence(e.evidenceId)}
                className="text-left text-[12px] text-[#3A3D45] underline decoration-dotted underline-offset-2 transition hover:text-[#14161B]"
              >
                {e.title}
                <span className="ml-1 font-mono text-[10px]" style={{ color: evidenceColor(e) }}>
                  {e.signal}
                </span>
              </button>
            </li>
          ))}
          {counterSignals.length === 0 && <li className="text-[11px] text-[#676A70]">同维度内暂无方向相反的证据</li>}
        </ul>
      </div>
      <div className="rounded-lg border border-black/10 bg-white/70 px-3 py-2">
        <div className="font-mono text-[10px] tracking-wider text-[#676A70]">UNKNOWN</div>
        <ul className="mt-1 space-y-1">
          {unknowns.map((e) => (
            <li key={e.evidenceId} className="text-[12px] text-[#7A5A16]">
              {e.title}
            </li>
          ))}
          {unknowns.length === 0 && <li className="text-[11px] text-[#676A70]">该维度暂无未决信息</li>}
        </ul>
      </div>
    </div>
  )
}

export function FocusView({
  space,
  dimension,
  onBack,
  metrics,
}: {
  space: ResearchSpacePayload
  dimension: ResearchDimension
  onBack: () => void
  metrics: MetricResult[]
}) {
  const dimensionEvidence = useMemo(
    () =>
      dimension.evidenceIds
        .map((id) => space.evidence.find((e) => e.evidenceId === id))
        .filter((e): e is Evidence => Boolean(e)),
    [dimension, space.evidence],
  )
  const claims = useMemo(
    () => space.claims.filter((c) => c.dimensionId === dimension.dimensionId),
    [space.claims, dimension.dimensionId],
  )
  const unknownClaims = claims.filter((c) => c.type === "unknown")
  const spineClaims = claims.filter((c) => c.type !== "unknown")

  const [previewId, setPreviewId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [thread, setThread] = useState<InlineThreadState | null>(null)
  const [challengeClaimId, setChallengeClaimId] = useState<string | null>(null)
  const threadInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (thread) setThread(null)
        else if (challengeClaimId) setChallengeClaimId(null)
        else onBack()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [thread, challengeClaimId, onBack])

  const conflictCount = claims.filter((c) => c.signal === "conflict").length
  const verifiedCount = dimensionEvidence.filter((e) => e.type === "fact").length

  const startThread = (claim: ResearchClaim) => {
    setThread({ claimId: claim.claimId, question: "", status: "idle" })
    setTimeout(() => threadInputRef.current?.focus(), 30)
  }

  const runThread = async () => {
    if (!thread || thread.question.trim().length === 0) return
    const claim = claims.find((c) => c.claimId === thread.claimId)
    const focusIds = claim?.evidenceIds.length ? claim.evidenceIds : dimension.evidenceIds.slice(0, 4)
    setThread({ ...thread, status: "loading" })
    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: space.company.stockCode,
          question: thread.question.trim(),
          evidenceIds: focusIds,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setThread({ ...thread, status: "failed", message: body?.error ?? `服务返回 ${res.status}` })
        return
      }
      if (body.mode === "compliance_redirect") {
        setThread({ ...thread, status: "redirect", message: body.compliance?.message })
        return
      }
      if (body.synthesis) {
        setThread({ ...thread, status: "success", answer: body.synthesis })
      } else {
        setThread({ ...thread, status: "failed", message: "追问生成失败，已验证证据仍可查看。" })
      }
    } catch {
      setThread({ ...thread, status: "failed", message: "无法连接追问服务。" })
    }
  }

  return (
    <div className="flex h-full w-full pt-14" style={{ background: OBSERVATORY_COLORS.readingSheet, color: OBSERVATORY_COLORS.readingInk }}>
      {/* 左 Context Strip */}
      <div className="flex w-[220px] shrink-0 flex-col border-r border-black/10 px-5 py-6">
        <div className="text-[13px] font-medium">{space.company.stockName}</div>
        <div className="mt-0.5 font-mono text-[11px] text-[#676A70]">{space.company.stockCode}</div>
        <div className="mt-3 text-[13px] text-[#3A3D45]">{dimension.label}</div>
        <div className="mt-0.5 text-[11px] text-[#676A70]">{dimension.researchQuestion}</div>

        <button
          type="button"
          onClick={onBack}
          className="mt-5 self-start text-[12px] text-[#45B8FF] transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
        >
          ← Back to space
        </button>

        <div className="mt-6 border-t border-black/10 pt-3">
          <div className="font-mono text-[10px] tracking-wider text-[#676A70]">OTHER DIMENSIONS</div>
          <ul className="mt-2 space-y-1.5">
            {space.dimensions
              .filter((d) => d.dimensionId !== dimension.dimensionId)
              .map((d) => (
                <li key={d.dimensionId} className="text-[11px] text-[#676A70]">
                  {d.label}
                </li>
              ))}
          </ul>
        </div>
      </div>

      {/* 中 Research Surface（Claim Spine） */}
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <header>
          <h2 className="text-[22px] font-medium tracking-tight">{dimension.label}</h2>
          <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-[#3A3D45]">
            {dimension.researchQuestion}
          </p>
          <div className="mt-3 flex items-center gap-3 font-mono text-[10px] text-[#676A70]">
            <span>{verifiedCount} verified evidence</span>
            {conflictCount > 0 && <span style={{ color: OBSERVATORY_COLORS.conflict }}>{conflictCount} conflict</span>}
            {unknownClaims.length > 0 && <span style={{ color: "#9A7B16" }}>{unknownClaims.length} unknown</span>}
            <span>{STATUS_LABEL[dimension.status]}</span>
          </div>
        </header>

        <ol className="mt-8 space-y-7">
          {spineClaims.map((claim, index) => {
            const anchors = claimAnchorIndex(dimensionEvidence, claim)
            const isThreadOpen = thread?.claimId === claim.claimId
            const isChallenging = challengeClaimId === claim.claimId
            return (
              <li key={claim.claimId} className="group">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-[11px] text-[#676A70]">{String(index + 1).padStart(2, "0")}</span>
                  <div className="flex-1">
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#9A9BA0]">
                      {claimTypeLabel(claim.type)}
                      {claim.signal !== "neutral" && claim.signal !== "unknown" && (
                        <span className="ml-2" style={{ color: claim.signal === "conflict" ? OBSERVATORY_COLORS.conflict : claim.signal === "negative" ? "#9A7B16" : "#2C7A5B" }}>
                          {claim.signal}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[#14161B]">{claim.text}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      {anchors.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onMouseEnter={() => setPreviewId(claim.evidenceIds[anchors.indexOf(n)] ?? null)}
                          onMouseLeave={() => setPreviewId(null)}
                          onClick={() => setPinnedId(claim.evidenceIds[anchors.indexOf(n)] ?? null)}
                          aria-label={`查看证据 ${n}`}
                          className="font-mono text-[15px] text-[#2E9BE0] transition hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
                          title="hover 预览 / 点击固定"
                        >
                          {anchorGlyph(n)}
                        </button>
                      ))}
                      <span className="ml-2 hidden gap-3 text-[11px] text-[#676A70] group-hover:flex group-focus-within:flex">
                        <button
                          type="button"
                          onClick={() => startThread(claim)}
                          className="transition hover:text-[#14161B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
                        >
                          Ask
                        </button>
                        <button
                          type="button"
                          onClick={() => setChallengeClaimId(isChallenging ? null : claim.claimId)}
                          className="transition hover:text-[#14161B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#45B8FF]/60"
                        >
                          Challenge
                        </button>
                      </span>
                    </div>

                    {isThreadOpen && thread && (
                      <div className="mt-3 rounded-xl border border-black/10 bg-white/70 px-4 py-3">
                        <div className="font-mono text-[10px] tracking-wider text-[#676A70]">INLINE RESEARCH THREAD</div>
                        <form
                          className="mt-2 flex gap-2"
                          onSubmit={(e) => {
                            e.preventDefault()
                            void runThread()
                          }}
                        >
                          <input
                            ref={threadInputRef}
                            value={thread.question}
                            onChange={(e) => setThread({ ...thread, question: e.target.value })}
                            placeholder="继续追问这条论点…"
                            aria-label="追问这条论点"
                            maxLength={500}
                            className="min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-[12.5px] outline-none focus:border-[#45B8FF]/70 focus:ring-2 focus:ring-[#45B8FF]/20"
                          />
                          <button
                            type="submit"
                            disabled={thread.status === "loading" || thread.question.trim().length === 0}
                            className="rounded-lg bg-[#14161B] px-3 py-1.5 text-[12px] text-white transition hover:opacity-90 disabled:opacity-40"
                          >
                            {thread.status === "loading" ? "研究中…" : "Ask"}
                          </button>
                        </form>
                        {thread.status === "failed" && (
                          <p className="mt-2 text-[12px] text-[#9A7B16]">{thread.message ?? "追问失败"}</p>
                        )}
                        {thread.status === "redirect" && (
                          <p className="mt-2 text-[12px] text-[#676A70]">{thread.message}</p>
                        )}
                        {thread.status === "success" && thread.answer && (
                          <div className="mt-3 space-y-3">
                            <div>
                              <div className="font-mono text-[10px] tracking-wider text-[#676A70]">ANSWER</div>
                              <p className="mt-1 text-[13px] leading-relaxed">{thread.answer.summary.text}</p>
                            </div>
                            {thread.answer.confirmedFacts.length > 0 && (
                              <div>
                                <div className="font-mono text-[10px] tracking-wider text-[#676A70]">当前可以确认</div>
                                <ul className="mt-1 space-y-1">
                                  {thread.answer.confirmedFacts.map((s, i) => (
                                    <li key={i} className="text-[12.5px] text-[#3A3D45]">
                                      {s.text}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {thread.answer.unknowns.length > 0 && (
                              <div>
                                <div className="font-mono text-[10px] tracking-wider text-[#676A70]">当前不能确认</div>
                                <ul className="mt-1 space-y-1">
                                  {thread.answer.unknowns.map((s, i) => (
                                    <li key={i} className="text-[12.5px] text-[#7A5A16]">
                                      {s.text}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {[...thread.answer.summary.evidenceIds].map((id) => {
                                const idx = dimensionEvidence.findIndex((e) => e.evidenceId === id)
                                if (idx < 0) return null
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    onMouseEnter={() => setPreviewId(id)}
                                    onMouseLeave={() => setPreviewId(null)}
                                    onClick={() => setPinnedId(id)}
                                    className="font-mono text-[11px] text-[#45B8FF]"
                                  >
                                    {anchorGlyph(idx + 1)}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {isChallenging && (
                      <ChallengeLayers claim={claim} dimensionEvidence={dimensionEvidence} onOpenEvidence={setPinnedId} />
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        {unknownClaims.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-black/10" />
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#676A70]">尚不能确认</span>
              <span className="h-px flex-1 bg-black/10" />
            </div>
            <ul className="mt-4 space-y-2">
              {unknownClaims.map((claim) => (
                <li key={claim.claimId} className="text-[13px] leading-relaxed text-[#7A5A16]">
                  {claim.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {dimension.status === "unknown" && (
          <div className="mt-8 rounded-xl border border-dashed px-4 py-4" style={{ borderColor: "rgba(234,185,95,0.6)", background: "rgba(234,185,95,0.08)" }}>
            <div className="text-[13px] font-medium text-[#7A5A16]">Current evidence is incomplete.</div>
            {dimension.missingInformation && dimension.missingInformation.length > 0 && (
              <>
                <div className="mt-2 font-mono text-[10px] tracking-wider text-[#7A5A16]">Currently missing:</div>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[12px] text-[#7A5A16]">
                  {dimension.missingInformation.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {claims.length === 0 && dimension.status !== "unknown" && (
          <p className="mt-8 text-[12.5px] text-[#676A70]">
            AI claims 暂不可用；以下证据对象仍然可查看（Truth Layer 不受影响）。
          </p>
        )}
      </div>

      {/* 右 Evidence Rail */}
      <EvidenceRail
        evidence={dimensionEvidence}
        metrics={metrics}
        pinnedId={pinnedId}
        previewId={previewId}
        onPin={setPinnedId}
      />
    </div>
  )
}
