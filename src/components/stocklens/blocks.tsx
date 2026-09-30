"use client"

import type { DiagnosisResponse } from "@/lib/diagnosis/types"
import { EvidenceCard } from "./EvidenceCard"

// 结构化区块：Header / Stats / Featured / Dimension / Redirect / Loading / Error。
// 只做呈现与组织；数字来自 DiagnosisResponse.stats 与 MetricResult，前端不重算。

export function DiagnosisHeader({
  data,
  question,
  onRerun,
}: {
  data: DiagnosisResponse
  question: string
  onRerun: () => void
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-zinc-200 bg-white/80 pb-5 backdrop-blur sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{data.stock?.stockName}</h1>
          <span className="font-mono text-sm text-zinc-400">{data.stock?.stockCode}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500">
          <span>最新财务期：{data.context?.latestFinancialPeriod ?? "—"}</span>
          <span>最新行情日期：{data.context?.latestTradeDate ?? "—"}</span>
          {data.industry && (
            <span title={`${data.industry.verificationMethod}（验证于 ${data.industry.verifiedAt}）`}>
              所属行业：{data.industry.name}
              <span className="ml-1 text-zinc-400">
                （{data.industry.indexCode} · 官方成分股验证）
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="text-left sm:text-right">
        <div className="text-xs uppercase tracking-wide text-zinc-400">本次研究问题</div>
        <p className="mt-0.5 text-sm font-medium text-zinc-800">{question}</p>
        <button
          type="button"
          onClick={onRerun}
          className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          重新诊断 ↻
        </button>
      </div>
    </header>
  )
}

export function EvidenceStats({ stats }: { stats: DiagnosisResponse["stats"] }) {
  const items = [
    { label: "已验证事实", value: stats.fact },
    { label: "分析推断", value: stats.inference },
    { label: "待验证", value: stats.unknown },
    { label: "矛盾证据", value: stats.conflict },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-2xl font-semibold text-zinc-900">{it.value}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{it.label}</div>
        </div>
      ))}
    </div>
  )
}

export function PartialAiFailureNotice() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
      AI 解释暂不可用，以下已验证数据与证据仍然有效。
    </div>
  )
}

export function ComplianceRedirect({
  message,
  suggestedQuestions,
  onAsk,
}: {
  message: string
  suggestedQuestions: string[]
  onAsk: (q: string) => void
}) {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-400">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6.5v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="10" cy="13.6" r="0.9" fill="currentColor" />
        </svg>
      </div>
      <h2 className="mt-3 text-base font-semibold text-zinc-900">这是一次正常的边界响应</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{message}</p>
      <div className="mt-5 flex flex-col gap-2">
        {suggestedQuestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onAsk(q)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-indigo-300 hover:bg-indigo-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {q}
          </button>
        ))}
      </div>
    </section>
  )
}

export function DiagnosisLoading() {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 text-center">
      <div
        aria-hidden
        className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-500"
      />
      <h2 className="mt-4 text-base font-semibold text-zinc-900">正在构建本次证据诊断</h2>
      <p className="mt-3 text-sm leading-relaxed text-zinc-500">
        系统正在完成：理解研究问题 → 获取并校验金融数据 → 计算确定性指标 →
        构建证据链 → 生成基于证据的解释。
      </p>
      <p className="mt-3 text-xs text-zinc-400">结果生成前不会展示未经验证的中间结论。</p>
      <span className="sr-only" role="status">加载中</span>
    </section>
  )
}

export function DiagnosisError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 text-center">
      <h2 className="text-base font-semibold text-zinc-900">本次诊断未完成</h2>
      <p className="mt-2 text-sm text-zinc-500">{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        重新诊断
      </button>
    </section>
  )
}

export function EmptyDimensionLine({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-3 text-sm text-zinc-400">
      {label}：当前缺少可验证证据
    </div>
  )
}

export { EvidenceCard }
