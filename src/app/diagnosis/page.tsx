"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"

import type { DiagnosisResponse } from "@/lib/diagnosis/types"
import { buildResearchView } from "@/lib/presentation/research-view"
import { EvidenceCard } from "@/components/stocklens/EvidenceCard"
import { EvidenceDrawer } from "@/components/stocklens/EvidenceDrawer"
import { DiagnosisSummary } from "@/components/stocklens/DiagnosisSummary"
import { TrendPanel } from "@/components/stocklens/TrendPanel"
import { MarketContextTable } from "@/components/stocklens/MarketContextTable"
import { EventPanel } from "@/components/stocklens/EventPanel"
import {
  ComplianceRedirect,
  DiagnosisError,
  DiagnosisHeader,
  DiagnosisLoading,
  EmptyDimensionLine,
  EvidenceStats,
  PartialAiFailureNotice,
} from "@/components/stocklens/blocks"

// 诊断工作台（Task 11：Question-first 信息层级）：
//   A. 当前回答（问题 + 基于当前证据）→ B. 值得关注（≤4）→ C. 尚待验证（≤3）
//   → 进一步查看（趋势 + 维度视图，仅 primary 维度默认展开）
// URL 为状态源：刷新后重新执行 POST /api/diagnosis。

type PageStatus = "idle" | "loading" | "success" | "compliance_redirect" | "error"

interface RunResult {
  key: string
  data?: DiagnosisResponse
  error?: string
}

function DiagnosisWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const stockCode = (searchParams.get("stockCode") ?? "000333.SZ").toUpperCase()
  const question = searchParams.get("q") ?? ""

  const [runSeq, setRunSeq] = useState(0)
  const requestKey = `${stockCode}|${question}|${runSeq}`
  const [result, setResult] = useState<RunResult>({ key: "" })
  const [drawer, setDrawer] = useState<{ key: string; id: string; seed?: string } | null>(null)

  useEffect(() => {
    if (!question) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/diagnosis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stockCode, question }),
        })
        if (cancelled) return
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          setResult({ key: requestKey, error: body?.error ?? `服务返回 ${res.status}` })
          return
        }
        const resp = (await res.json()) as DiagnosisResponse
        setResult({ key: requestKey, data: resp })
      } catch {
        if (!cancelled) setResult({ key: requestKey, error: "无法连接诊断服务，请稍后重试。" })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [requestKey, stockCode, question])

  const rerun = useCallback(() => setRunSeq((n) => n + 1), [])

  const status: PageStatus = !question
    ? "idle"
    : result.key !== requestKey
      ? "loading"
      : result.error
        ? "error"
        : result.data?.mode === "compliance_redirect"
          ? "compliance_redirect"
          : "success"

  const data = result.key === requestKey ? result.data : undefined
  const evidence = useMemo(() => data?.evidence ?? [], [data])
  const view = useMemo(
    () =>
      buildResearchView({
        planner: data?.planner ?? null,
        synthesis: data?.synthesis ?? null,
        fullEvidence: evidence,
      }),
    [data, evidence],
  )
  const drawerEvidenceId = drawer?.key === requestKey ? drawer.id : null
  const openEvidence = useCallback(
    (id: string) => setDrawer({ key: requestKey, id }),
    [requestKey],
  )
  const openFollowup = useCallback(
    (seed: string) => {
      const focusId =
        view.attentionEvidence[0]?.evidenceId ??
        view.answerEvidence[0]?.evidenceId ??
        evidence[0]?.evidenceId
      if (focusId) setDrawer({ key: requestKey, id: focusId, seed })
    },
    [requestKey, view, evidence],
  )

  if (status === "idle") {
    return (
      <main className="mx-auto max-w-5xl px-5 py-16">
        <DiagnosisError error="缺少研究问题。请从首页输入问题开始诊断。" onRetry={() => router.push("/")} />
      </main>
    )
  }

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-5xl px-5 py-20">
        <DiagnosisLoading />
      </main>
    )
  }

  if (status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-5 py-20">
        <DiagnosisError error={result.error ?? "未知错误"} onRetry={rerun} />
      </main>
    )
  }

  if (status === "compliance_redirect" && data) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-16">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">S</span>
          <div>
            <div className="text-sm font-semibold text-zinc-900">StockLens</div>
            <div className="text-xs text-zinc-400">个股证据诊断</div>
          </div>
        </div>
        <ComplianceRedirect
          message={data.compliance?.message ?? ""}
          suggestedQuestions={data.compliance?.suggestedQuestions ?? []}
          onAsk={(q) => router.push(`/diagnosis?stockCode=${stockCode}&q=${encodeURIComponent(q)}`)}
        />
      </main>
    )
  }

  if (!data) return null
  const aiUnavailable = data.ai.status === "failed" || data.ai.status === "partial_failure"

  return (
    <main className="mx-auto max-w-5xl px-5 pb-24">
      <DiagnosisHeader data={data} question={question} onRerun={rerun} />

      {aiUnavailable && (
        <div className="mt-4">
          <PartialAiFailureNotice />
        </div>
      )}

      {/* ---------- A. 当前回答 ---------- */}
      <div className="mt-6 space-y-6">
        {data.synthesis && (
          <DiagnosisSummary synthesis={data.synthesis} onOpenEvidence={openEvidence} />
        )}

        {/* ---------- B. 值得关注 ---------- */}
        {view.attentionEvidence.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-zinc-900">值得关注</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              按确定性规则从本次诊断的 {data.stats.totalEvidence} 条证据中选出（矛盾优先）。
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {view.attentionEvidence.map((e) => (
                <EvidenceCard key={e.evidenceId} evidence={e} onOpen={openEvidence} />
              ))}
            </div>
          </section>
        )}

        {/* ---------- C. 尚待验证 ---------- */}
        {view.unknownEvidence.length > 0 && (
          <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-zinc-900">尚待验证</h2>
              <span className="text-xs text-zinc-400">
                当前研究边界——不是负面证据，也不是系统错误
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {view.unknownEvidence.map((e) => (
                <li key={e.evidenceId}>
                  <button
                    type="button"
                    onClick={() => openEvidence(e.evidenceId)}
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <div className="text-sm font-medium text-zinc-700">{e.title}</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{e.statement}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <EvidenceStats stats={data.stats} />

        {/* ---------- 进一步查看（二级区） ---------- */}
        <section className="space-y-3 pt-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-900">进一步查看</h2>
            <span className="text-xs text-zinc-400">完整指标与证据（按维度组织，可继续下钻）</span>
          </div>

          {view.showTrend && data.trend && data.trend.length > 0 && <TrendPanel trend={data.trend} />}

          <MarketContextTable metrics={data.metrics} industryLabel={data.industry?.name ?? null} />

          {view.primaryDimensions.map((d) => (
            <DimensionSection key={d.dimension} view={d} onOpenEvidence={openEvidence} open />
          ))}
          {view.secondaryDimensions.map((d) => (
            <DimensionSection key={d.dimension} view={d} onOpenEvidence={openEvidence} open={false} />
          ))}
          {view.primaryDimensions.length === 0 && view.secondaryDimensions.length === 0 && (
            <EmptyDimensionLine label="证据" />
          )}
        </section>

        <EventPanel data={data} />

        {/* ---------- 继续研究 ---------- */}
        {view.nextQuestions.length > 0 && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h2 className="text-base font-semibold text-zinc-900">继续研究</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              点击问题将带入证据面板的追问框（不会重新执行整轮诊断）。
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {view.nextQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => openFollowup(q)}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-left text-sm text-zinc-700 transition hover:border-indigo-300 hover:bg-indigo-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {q}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <EvidenceDrawer
        evidenceId={drawerEvidenceId}
        allEvidence={evidence}
        metrics={data.metrics}
        stockCode={stockCode}
        seedQuestion={drawer?.key === requestKey ? drawer.seed : undefined}
        onClose={() => setDrawer(null)}
      />
    </main>
  )
}

function DimensionSection({
  view,
  onOpenEvidence,
  open,
}: {
  view: ReturnType<typeof buildResearchView>["primaryDimensions"][number]
  onOpenEvidence: (id: string) => void
  open: boolean
}) {
  return (
    <details className="group rounded-2xl border border-zinc-200 bg-white" open={open}>
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2 p-4 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
        {view.label}
        <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-normal text-zinc-500">
          {view.counts.total} 条
        </span>
        {view.counts.positive > 0 && (
          <span className="text-xs font-normal text-emerald-600">{view.counts.positive} 积极</span>
        )}
        {view.counts.negative > 0 && (
          <span className="text-xs font-normal text-amber-600">{view.counts.negative} 承压</span>
        )}
        {view.counts.conflict > 0 && (
          <span className="text-xs font-normal text-rose-600">{view.counts.conflict} 矛盾</span>
        )}
        {view.counts.unknown > 0 && (
          <span className="text-xs font-normal text-zinc-400">{view.counts.unknown} 待验证</span>
        )}
        <span className="ml-auto text-xs font-normal text-zinc-400 group-open:hidden">展开</span>
        <span className="ml-auto hidden text-xs font-normal text-zinc-400 group-open:inline">收起</span>
      </summary>
      <div className="grid gap-3 border-t border-zinc-100 p-4 sm:grid-cols-2">
        {view.evidence.map((e) => (
          <EvidenceCard key={e.evidenceId} evidence={e} onOpen={onOpenEvidence} />
        ))}
      </div>
    </details>
  )
}

export default function DiagnosisPage() {
  return (
    <Suspense fallback={<DiagnosisLoading />}>
      <DiagnosisWorkspace />
    </Suspense>
  )
}
