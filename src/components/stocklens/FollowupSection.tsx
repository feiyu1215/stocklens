"use client"

import { useState } from "react"

import type { DiagnosisResponse } from "@/lib/diagnosis/types"
import type { Evidence } from "@/lib/evidence/types"

// 继续研究（Task 06）：在 Drawer 内针对当前证据追问，
// POST /api/followup → 分层展示（可以确认 / 基于证据可以推断 / 还不能确认 / 继续研究），
// 每条 statement 绑定证据锚点，点击即在 Drawer 内下钻。

type FollowupStatus = "idle" | "loading" | "success" | "failed" | "redirect"

interface FollowupState {
  status: FollowupStatus
  data?: DiagnosisResponse & { mode: "followup" | "compliance_redirect"; followupId: string | null }
  errorMessage?: string
}

function AnchorChips({
  ids,
  evidence,
  onOpenEvidence,
}: {
  ids: string[]
  evidence: Evidence[]
  onOpenEvidence: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {ids.map((id, i) => {
        const target = evidence.find((e) => e.evidenceId === id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => onOpenEvidence(id)}
            aria-label={`查看依据证据 ${i + 1}`}
            title={target?.title ?? id}
            className="rounded border border-indigo-200 bg-indigo-50/70 px-1.5 py-0.5 font-mono text-[11px] text-indigo-600 transition hover:bg-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            证据 {i + 1}
          </button>
        )
      })}
    </div>
  )
}

export function FollowupSection({
  stockCode,
  focusEvidence,
  focusEvidenceIds,
  onOpenEvidence,
}: {
  stockCode: string
  focusEvidence: Evidence
  focusEvidenceIds: string[]
  onOpenEvidence: (id: string) => void
}) {
  const [question, setQuestion] = useState("")
  const [state, setState] = useState<FollowupState>({ status: "idle" })

  const run = async () => {
    const q = question.trim()
    if (!q) return
    setState({ status: "loading" })
    try {
      const res = await fetch("/api/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode,
          question: q,
          evidenceIds: [focusEvidence.evidenceId, ...focusEvidenceIds.filter((id) => id !== focusEvidence.evidenceId)],
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setState({ status: "failed", errorMessage: body?.error ?? `服务返回 ${res.status}` })
        return
      }
      if (body.mode === "compliance_redirect") {
        setState({ status: "redirect", data: body })
        return
      }
      if (body.synthesis) {
        setState({ status: "success", data: body })
      } else {
        setState({ status: "failed", errorMessage: "追问生成失败，已验证证据仍可查看。" })
      }
    } catch {
      setState({ status: "failed", errorMessage: "无法连接追问服务，请稍后重试。" })
    }
  }

  const s = state.data?.synthesis

  return (
    <section className="border-t border-zinc-100 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">继续研究</h3>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={`针对「${focusEvidence.title}」继续追问…`}
          maxLength={500}
          aria-label="继续研究问题"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        />
        <button
          type="submit"
          disabled={!question.trim() || state.status === "loading"}
          className="shrink-0 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state.status === "loading" ? "生成中…" : "追问"}
        </button>
      </form>
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
        追问基于当前已验证证据生成，不提供买卖建议或涨跌预测。
      </p>

      {state.status === "loading" && (
        <p className="mt-3 text-sm text-zinc-500" role="status">
          正在基于证据生成回答…
        </p>
      )}

      {state.status === "failed" && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-800">
          {state.errorMessage ?? "追问生成失败，已验证证据仍可查看。"}
          <button
            type="button"
            onClick={() => void run()}
            className="ml-2 font-medium text-indigo-600 hover:text-indigo-700"
          >
            重试
          </button>
        </div>
      )}

      {state.status === "redirect" && state.data?.compliance && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
          {state.data.compliance.message}
        </div>
      )}

      {state.status === "success" && s && (
        <div className="mt-3 space-y-4">
          <div>
            <div className="text-xs font-semibold text-zinc-500">直接回答</div>
            <p className="mt-1 text-sm leading-relaxed text-zinc-800">{s.summary.text}</p>
            <div className="mt-1">
              <AnchorChips ids={s.summary.evidenceIds} evidence={state.data?.evidence ?? []} onOpenEvidence={onOpenEvidence} />
            </div>
          </div>
          {s.confirmedFacts.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-500">当前可以确认</div>
              <div className="mt-1 space-y-2">
                {s.confirmedFacts.map((st, i) => (
                  <div key={i}>
                    <p className="text-sm leading-relaxed text-zinc-700">{st.text}</p>
                    <AnchorChips ids={st.evidenceIds} evidence={state.data?.evidence ?? []} onOpenEvidence={onOpenEvidence} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {s.analysisInferences.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-500">基于证据可以推断</div>
              <div className="mt-1 space-y-2">
                {s.analysisInferences.map((st, i) => (
                  <div key={i}>
                    <p className="text-sm leading-relaxed text-zinc-700">{st.text}</p>
                    <AnchorChips ids={st.evidenceIds} evidence={state.data?.evidence ?? []} onOpenEvidence={onOpenEvidence} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {s.unknowns.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-500">当前还不能确认</div>
              <div className="mt-1 space-y-2">
                {s.unknowns.map((st, i) => (
                  <div key={i}>
                    <p className="text-sm leading-relaxed text-zinc-700">{st.text}</p>
                    <AnchorChips ids={st.evidenceIds} evidence={state.data?.evidence ?? []} onOpenEvidence={onOpenEvidence} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {s.nextQuestions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-zinc-500">可以继续研究</div>
              <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-zinc-600">
                {s.nextQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
