"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"

import type { DiagnosisResponse } from "@/lib/diagnosis/types"
import { selectFeaturedEvidence } from "@/lib/presentation/featured-evidence"
import { buildDimensionViews } from "@/lib/presentation/dimension-view"
import { EvidenceCard } from "@/components/stocklens/EvidenceCard"
import { EvidenceDrawer } from "@/components/stocklens/EvidenceDrawer"
import { DiagnosisSummary } from "@/components/stocklens/DiagnosisSummary"
import {
  ComplianceRedirect,
  DiagnosisError,
  DiagnosisHeader,
  DiagnosisLoading,
  EmptyDimensionLine,
  EvidenceStats,
  PartialAiFailureNotice,
} from "@/components/stocklens/blocks"

// 诊断工作台（Task 05）：路由 /diagnosis?stockCode=...&q=...
// URL 为状态源：刷新后重新执行 POST /api/diagnosis（无数据库，不引入 uuid 持久化）。
// 状态派生自「请求键」：result.key 与当前键一致才有结果，否则处于 loading——
// 所有 setState 都发生在异步边界之后，避免 effect 内同步 setState。

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
  const [drawer, setDrawer] = useState<{ key: string; id: string } | null>(null)

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
  const featured = useMemo(
    () => (data ? selectFeaturedEvidence(evidence, data.synthesis ?? null) : []),
    [data, evidence],
  )
  const dimensionViews = useMemo(() => buildDimensionViews(evidence), [evidence])
  const drawerEvidenceId = drawer?.key === requestKey ? drawer.id : null
  const openEvidence = useCallback(
    (id: string) => setDrawer({ key: requestKey, id }),
    [requestKey],
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

      <div className="mt-6 space-y-6">
        {aiUnavailable && <PartialAiFailureNotice />}

        {data.synthesis && (
          <DiagnosisSummary synthesis={data.synthesis} onOpenEvidence={openEvidence} />
        )}

        <EvidenceStats stats={data.stats} />

        <section>
          <h2 className="text-base font-semibold text-zinc-900">值得关注的证据</h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            由确定性规则从本次诊断的 {data.stats.totalEvidence} 条证据中选出，全部证据见下方分组视图。
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((e) => (
              <EvidenceCard key={e.evidenceId} evidence={e} onOpen={openEvidence} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-zinc-900">全部证据</h2>
          {dimensionViews.map((view) =>
            view.hasEvidence ? (
              <details key={view.dimension} className="group rounded-2xl border border-zinc-200 bg-white" open>
                <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2 p-4 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
                  {view.label}
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-normal text-zinc-500">
                    {view.counts.total} 条
                  </span>
                  {view.counts.positive > 0 && <span className="text-xs font-normal text-emerald-600">{view.counts.positive} 积极</span>}
                  {view.counts.negative > 0 && <span className="text-xs font-normal text-amber-600">{view.counts.negative} 承压</span>}
                  {view.counts.conflict > 0 && <span className="text-xs font-normal text-rose-600">{view.counts.conflict} 矛盾</span>}
                  {view.counts.unknown > 0 && <span className="text-xs font-normal text-zinc-400">{view.counts.unknown} 待验证</span>}
                  <span className="ml-auto text-xs font-normal text-zinc-400 group-open:hidden">展开</span>
                  <span className="ml-auto hidden text-xs font-normal text-zinc-400 group-open:inline">收起</span>
                </summary>
                <div className="grid gap-3 border-t border-zinc-100 p-4 sm:grid-cols-2">
                  {view.evidence.map((e) => (
                    <EvidenceCard key={e.evidenceId} evidence={e} onOpen={openEvidence} />
                  ))}
                </div>
              </details>
            ) : (
              <EmptyDimensionLine key={view.dimension} label={view.label} />
            ),
          )}
        </section>
      </div>

      <EvidenceDrawer
        evidenceId={drawerEvidenceId}
        allEvidence={evidence}
        metrics={data.metrics}
        onClose={() => setDrawer(null)}
      />
    </main>
  )
}

export default function DiagnosisPage() {
  return (
    <Suspense fallback={<DiagnosisLoading />}>
      <DiagnosisWorkspace />
    </Suspense>
  )
}
