"use client"

import type { DiagnosisResponse } from "@/lib/diagnosis/types"
import { INTERPRETATION_FLAG_LABELS } from "@/lib/metrics/interpretation"

// 近期事件与关注（Task 10 §38–42）：Lite 版事件区。
// 只陈述接口记录与覆盖边界；关注度上升 ≠ 利好；分红 ≠ 正面；不预测影响。

const TYPE_LABEL: Record<string, string> = {
  market_anomaly: "个股异动",
  attention: "市场关注",
  corporate_action: "公司行为",
}

const COVERAGE_NOTE: Record<string, string> = {
  records: "有记录",
  no_records: "接口未返回记录",
  failed: "本次调用失败",
  unavailable: "未接入",
}

export function EventPanel({ data }: { data: DiagnosisResponse }) {
  const events = data.events
  if (!events) return null

  const shown = events.items.slice(0, 5)

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">近期事件与关注</h2>
        <span className="text-xs text-zinc-400">来源：Fuyao 特色数据（Event Lite）</span>
      </div>

      {shown.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {shown.map((e) => (
            <li key={e.eventId} className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-medium text-zinc-600">
                  {TYPE_LABEL[e.type] ?? e.type}
                </span>
                <span className="text-sm font-medium text-zinc-800">{e.title}</span>
                {e.eventDate && <span className="font-mono text-xs text-zinc-400">{e.eventDate}</span>}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">{e.statement}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-400">
          当前数据源未返回可展示的事件记录。
        </p>
      )}

      <div className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-400">
        <div className="font-medium text-zinc-500">覆盖边界</div>
        <ul className="mt-1 space-y-0.5">
          <li>个股异动：{COVERAGE_NOTE[events.coverage.anomaly] ?? events.coverage.anomaly}</li>
          <li>热榜关注度：{COVERAGE_NOTE[events.coverage.attention] ?? events.coverage.attention}</li>
          <li>公司行为（分红/送股）：{COVERAGE_NOTE[events.coverage.corporateAction] ?? events.coverage.corporateAction}</li>
          <li>公告与新闻文本：未接入——事件覆盖不是全量，无法确认不存在其他公司层面事件</li>
        </ul>
        <p className="mt-1.5">
          关注度变化与公司行为均为客观记录，不代表市场方向或投资价值。
        </p>
      </div>
    </section>
  )
}

/** Drawer 用：解释护栏提示块（Task 10 §44） */
export function InterpretationCaution({
  flags,
  note,
  previousAbsolute,
}: {
  flags?: string[]
  note?: string
  previousAbsolute?: number
}) {
  if (!flags || flags.length === 0) return null
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
        <span aria-hidden>⚠</span>
        解释护栏
        {flags.map((f) => (
          <span key={f} className="rounded border border-amber-300 bg-white px-1.5 py-0.5 font-normal">
            {INTERPRETATION_FLAG_LABELS[f as keyof typeof INTERPRETATION_FLAG_LABELS] ?? f}
          </span>
        ))}
      </div>
      {note && <p className="mt-1.5 text-xs leading-relaxed text-amber-800">{note}</p>}
      {typeof previousAbsolute === "number" && (
        <p className="mt-1 font-mono text-xs text-amber-700">
          上年同期绝对金额：{previousAbsolute.toLocaleString("zh-CN")}
        </p>
      )}
    </section>
  )
}
