"use client"

// 双公司对比 P0（docs/plans/2026-10-08-双公司对比-P0-PRD.md）。
// 数据全部来自本机 IndexedDB 存量 payload（loadResearch），零网络、零模型调用。
// 纪律：缺失数据不伪造零值；可比性三级判定来自确定性规则（lib/v5/compare）；
// 差值是中性事实，不做"谁更好"的着色；示例/真实数据必须明确区分。

import { useEffect, useMemo, useState } from "react"

import AssistantPanel from "@/components/v5/AssistantPanel"
import { PALETTE } from "@/components/v5/palette"
import { useRouteWipe } from "@/components/v5/RouteWipe"
import type { PlannedAction } from "@/lib/v5/assistant/capabilities"
import type { ResearchSpacePayload } from "@/components/observatory/theme"
import {
  COMPARE_CATALOG,
  COMPARE_GROUP_ORDER,
  buildCompareRows,
  classifyResearchLoad,
  describeSampleMix,
  formatMetricDiff,
  formatMetricValue,
  type ClassifiedLoad,
  type CompareGroup,
} from "@/lib/v5/compare"
import { ensureShelfMigrated, loadResearch } from "@/lib/v5/shelf"

const C = PALETTE

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

const GROUP_LABELS: Record<CompareGroup, string> = {
  growth: "成长",
  profitability: "盈利",
  cashflow: "现金流",
  valuation: "估值",
}

function parseStocksQuery(query: string): string[] {
  const codes = query
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => STOCK_CODE_PATTERN.test(code))
  return [...new Set(codes)].slice(0, 2)
}

/** 与 ResearchHome.workspaceHref 同一目的地约定：录制示例不带 live=1；有存量数据带 resume=1 */
function workspaceHref(stockCode: string, recordedSample: boolean): string {
  const params = new URLSearchParams({ stockCode })
  if (!recordedSample) params.set("live", "1")
  params.set("resume", "1")
  return `/lab/ai-workspace-v1?${params.toString()}`
}

function aiStatusLabel(status: ResearchSpacePayload["ai"]["status"]): { label: string; color: string } {
  if (status === "success") return { label: "证据就绪", color: C.blue }
  if (status === "partial_failure") return { label: "部分完成", color: C.amber }
  return { label: "待重试", color: C.coral }
}

function sourceSummary(fields: { source: string; domain: string; field: string; period?: string; date?: string }[]): string {
  if (fields.length === 0) return "来源未记录"
  return fields
    .map((f) => `${f.source}·${f.domain}·${f.field}${f.period ? `·${f.period}` : f.date ? `·${f.date}` : ""}`)
    .join("；")
}

function CompanyCard(props: {
  load: ClassifiedLoad
  recordedSample: boolean
  align: "left" | "right"
}) {
  const { load, recordedSample, align } = props
  const payload = load.payload
  const ai = payload ? aiStatusLabel(payload.ai.status) : null
  const alignCls = align === "right" ? "items-end text-right" : "items-start text-left"
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1.5 ${alignCls}`}>
      {payload ? (
        <>
          <div className="flex flex-wrap items-center gap-2" style={{ flexDirection: align === "right" ? "row-reverse" : "row" }}>
            <span className="text-[15px] font-semibold">{payload.company.stockName}</span>
            <span className="font-mono text-[9.5px] text-[#6D7480]">{payload.company.stockCode}</span>
            {recordedSample && (
              <span className="rounded-full border px-2 py-px font-mono text-[8.5px]" style={{ borderColor: "rgba(182,128,42,0.45)", color: C.amber }}>
                示例数据
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2" style={{ flexDirection: align === "right" ? "row-reverse" : "row" }}>
            <span className="flex items-center gap-1.5 text-[10.5px] text-[#6D7480]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ai?.color }} />
              {ai?.label}
            </span>
            <span className="font-mono text-[9px] text-[#9AA0AA]">{payload.spaceId}</span>
          </div>
        </>
      ) : (
        <span className="text-[13px] text-[#6D7480]">该公司研究数据不在本机</span>
      )}
    </div>
  )
}

function researchHref(stockCode: string): string {
  const params = new URLSearchParams({ stockCode, live: "1", resume: "1" })
  return `/lab/ai-workspace-v1?${params.toString()}`
}

export default function ResearchCompare() {
  const wipeTo = useRouteWipe()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loads, setLoads] = useState<{ left: ClassifiedLoad; right: ClassifiedLoad; leftRecorded: boolean; rightRecorded: boolean } | null>(null)

  // 客户端解析 ?stocks=A,B（与画布读 window.location.search 的既有惯例一致）。
  // rAF 延迟一帧：规避 react-hooks/set-state-in-effect（与画布侧板补开同款处理）。
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search)
      setCodes(parseStocksQuery(params.get("stocks") ?? ""))
    })
    return () => window.cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (!codes || codes.length !== 2) return
    let cancelled = false
    ;(async () => {
      try {
        await ensureShelfMigrated()
        const [left, right] = await Promise.all([loadResearch(codes[0]), loadResearch(codes[1])])
        if (cancelled) return
        setLoads({
          left: classifyResearchLoad(left),
          right: classifyResearchLoad(right),
          leftRecorded: left?.recordedSample ?? false,
          rightRecorded: right?.recordedSample ?? false,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [codes])

  const rows = useMemo(() => {
    if (!loads || !codes) return []
    // 两侧数据都彻底不在本机：无可验证部分，不渲染全"—"表格
    if (!loads.left.payload && !loads.right.payload) return []
    // 缺失/不完整一侧用空壳 payload 驱动：目录指标全部 missing → 单元格显示"—"，
    // 可用一侧照常展示（评审验收：只展示可验证部分，缺失不伪造零值）
    const stubFor = (code: string): ResearchSpacePayload => ({
      spaceId: `SP_LOCAL_MISSING_${code}`,
      company: {
        stockCode: code,
        stockName: code,
        capabilities: [],
        availableCapabilities: [],
        partialCapabilities: [],
        unavailableCapabilities: [],
      },
      frame: { intent: "missing", framingReason: "missing" },
      dimensions: [],
      claims: [],
      evidence: [],
      suggestions: [],
      trend: [],
      metrics: [],
      ai: { status: "failed" },
      errors: [],
    })
    return buildCompareRows(
      loads.left.payload ?? stubFor(codes[0]),
      loads.right.payload ?? stubFor(codes[1]),
    )
  }, [loads, codes])

  const sampleMix = loads ? describeSampleMix(loads.leftRecorded, loads.rightRecorded) : null

  // ActionExecutor（对比页侧）：只执行能力白名单内的动作，参数在此最终校验
  const executeAssistantAction = (action: PlannedAction) => {
    setAssistantOpen(false)
    switch (action.action) {
      case "navigate.home":
        wipeTo("/")
        break
      case "navigate.library":
        wipeTo("/research")
        break
      case "navigate.compare":
        if (action.stockCodes?.length === 2) {
          wipeTo(`/research/compare?stocks=${action.stockCodes.map((c) => c.stockCode).join(",")}`)
        }
        break
      case "company.open":
        if (action.stockCode) wipeTo(researchHref(action.stockCode))
        break
      case "search.focus":
        // 对比页没有公司搜索框：回首页由搜索框承接
        wipeTo("/")
        break
      default:
        break
    }
  }

  return (
    <main
      data-research-compare
      className="min-h-screen overflow-x-hidden bg-[#F5F7FA] text-[#11151B]"
    >
      <header className="sticky top-0 z-30 flex h-[64px] items-center justify-between border-b border-black/10 bg-[#F5F7FA]/95 px-5 backdrop-blur-md sm:px-9">
        <div className="flex items-center gap-4">
          <a
            href="/research"
            data-compare-back
            className="font-mono text-[9.5px] tracking-[0.1em] text-[#6D7480] transition hover:text-[#11151B]"
          >
            ← 研究库
          </a>
          <span aria-hidden className="h-4 w-px bg-black/10" />
          <div className="font-mono text-[9px] tracking-[0.24em] text-[#6D7480]">COMPARE · 双公司对比</div>
        </div>
        <div className="hidden items-center gap-3 font-mono text-[8.5px] tracking-[0.1em] text-[#9AA0AA] sm:flex">
          <span>数据来自本机 · 不发起网络请求</span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1080px] px-5 pb-20 pt-8 sm:px-9">
        {!codes && <p className="text-[12px] text-[#6D7480]">读取链接…</p>}

        {codes && codes.length !== 2 && (
          <div data-compare-invalid className="rounded-[14px] border border-black/10 bg-white/90 p-6">
            <p className="text-[14px] font-medium">链接无效：需要恰好两家公司的代码</p>
            <p className="mt-2 text-[11.5px] text-[#6D7480]">
              正确格式如 /research/compare?stocks=000333.SZ,000651.SZ。请回到研究库用「对比」模式发起。
            </p>
          </div>
        )}

        {codes && codes.length === 2 && loading && (
          <p data-compare-loading className="text-[12px] text-[#6D7480]">读取本机研究数据…</p>
        )}

        {codes && codes.length === 2 && loads && (
          <>
            {/* 数据可用性提示：缺失不伪造零值 */}
            {(loads.left.state !== "ok" || loads.right.state !== "ok") && (
              <div
                data-compare-data-notice
                className="flex flex-wrap items-start gap-3 rounded-[14px] border px-4 py-3"
                style={{ borderColor: "rgba(182,128,42,0.4)", background: "rgba(182,128,42,0.06)" }}
              >
                <span aria-hidden className="mt-px shrink-0 text-[13px]" style={{ color: C.amber }}>!</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium" style={{ color: "#854F0B" }}>
                    {[
                      loads.left.state !== "ok"
                        ? `${loads.left.payload?.company.stockName ?? codes[0]}：${loads.left.state === "missing" ? "研究数据不在本机（可能已被清理）" : `数据不完整（${loads.left.issue}）`}`
                        : null,
                      loads.right.state !== "ok"
                        ? `${loads.right.payload?.company.stockName ?? codes[1]}：${loads.right.state === "missing" ? "研究数据不在本机（可能已被清理）" : `数据不完整（${loads.right.issue}）`}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("；")}
                  </p>
                  <p className="mt-1 text-[11.5px]" style={{ color: "#854F0B" }}>
                    缺失部分将以「—」展示，不会当作 0 参与任何比较。可重新生成研究后回来对比。
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {loads.left.state === "missing" && (
                    <a href={workspaceHref(codes[0], loads.leftRecorded)} className="rounded-full border px-3 py-1.5 text-[11px]" style={{ borderColor: "rgba(182,128,42,0.45)", color: "#854F0B" }}>
                      重新研究 {loads.left.payload?.company.stockName ?? codes[0]}
                    </a>
                  )}
                  {loads.right.state === "missing" && (
                    <a href={workspaceHref(codes[1], loads.rightRecorded)} className="rounded-full border px-3 py-1.5 text-[11px]" style={{ borderColor: "rgba(182,128,42,0.45)", color: "#854F0B" }}>
                      重新研究 {loads.right.payload?.company.stockName ?? codes[1]}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* 示例数据纪律：录制示例绝不能伪装成真实比较 */}
            {sampleMix && sampleMix !== "both_real" && (
              <p data-compare-sample-note className="mt-3 text-[11px]" style={{ color: C.amber }}>
                {sampleMix === "mixed"
                  ? "注意：本页一侧为录制示例、一侧为真实数据，混合对比仅供产品演示，不代表真实市场结论。"
                  : "本页两侧均为录制示例数据，仅供产品演示。"}
              </p>
            )}

            {/* 双公司头部卡 */}
            <div data-compare-companies className="mt-6 flex items-start justify-between gap-6 rounded-[14px] border border-black/10 bg-white/90 px-5 py-4 shadow-[0_12px_35px_rgba(17,21,27,0.045)]">
              <CompanyCard load={loads.left} recordedSample={loads.leftRecorded} align="left" />
              <span className="mt-1 shrink-0 font-mono text-[9px] tracking-[0.2em] text-[#9AA0AA]">VS</span>
              <CompanyCard load={loads.right} recordedSample={loads.rightRecorded} align="right" />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 font-mono text-[8.5px] tracking-[0.08em] text-[#6D7480]">
                <span className="rounded-full border border-black/10 bg-white px-2 py-0.5">可比较 · 同报告期，差值=左−右</span>
                <span className="rounded-full border border-black/10 bg-white px-2 py-0.5">并列参考 · 报告期不同，不算差值</span>
                <span className="rounded-full border border-black/10 bg-white px-2 py-0.5">不可比 · 数据缺失或不可用</span>
              </div>
              <div className="flex gap-2">
                {loads.left.payload && (
                  <a
                    data-compare-open-left
                    href={workspaceHref(loads.left.payload.company.stockCode, loads.leftRecorded)}
                    className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10.5px] text-[#6D7480] transition hover:border-[#2F66FF]/40 hover:text-[#2F66FF]"
                  >
                    打开{loads.left.payload.company.stockName}的研究空间 →
                  </a>
                )}
                {loads.right.payload && (
                  <a
                    data-compare-open-right
                    href={workspaceHref(loads.right.payload.company.stockCode, loads.rightRecorded)}
                    className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10.5px] text-[#6D7480] transition hover:border-[#2F66FF]/40 hover:text-[#2F66FF]"
                  >
                    打开{loads.right.payload.company.stockName}的研究空间 →
                  </a>
                )}
              </div>
            </div>

            {/* 指标分组并排 */}
            {rows.length > 0 && (
              <div data-compare-rows className="mt-6 space-y-8">
                {COMPARE_GROUP_ORDER.map((group) => {
                  const groupRows = rows.filter((r) => r.def.group === group)
                  if (groupRows.length === 0) return null
                  return (
                    <section key={group}>
                      <div className="mb-2 flex items-center gap-3">
                        <span className="font-mono text-[9px] tracking-[0.24em] text-[#6D7480]">{GROUP_LABELS[group]}</span>
                        <span aria-hidden className="h-px flex-1 bg-black/10" />
                      </div>
                      <div className="overflow-hidden rounded-[14px] border border-black/10 bg-white/90 shadow-[0_12px_35px_rgba(17,21,27,0.045)]">
                        {groupRows.map((row) => (
                          <div key={row.def.metricId} data-compare-row={row.def.metricId} className="border-b border-black/10 last:border-b-0">
                            <div className="grid grid-cols-[1.3fr_1fr_88px_1fr] items-center gap-3 px-4 py-3 sm:grid-cols-[1.5fr_1fr_110px_1fr]">
                              <div className="min-w-0">
                                <p className="truncate text-[12.5px] font-medium">{row.def.name}</p>
                                <p className="mt-0.5 font-mono text-[8.5px] text-[#9AA0AA]">{row.def.note}</p>
                              </div>
                              <div>
                                <p className="font-mono text-[14px]" data-compare-value-left>
                                  {row.left.status === "available" && row.left.value !== null ? formatMetricValue(row.left.value, row.left.unit) : "—"}
                                </p>
                                <p className="mt-0.5 font-mono text-[8.5px] text-[#9AA0AA]">{row.left.period ?? (row.left.status === "unavailable" ? "不可用" : "无数据")}</p>
                              </div>
                              <div className="text-center">
                                {row.status === "comparable" && row.diff && (
                                  <span
                                    data-compare-diff
                                    className="inline-block rounded-full border border-black/10 bg-[#F5F7FA] px-2 py-0.5 font-mono text-[9.5px]"
                                  >
                                    {formatMetricDiff(row.diff.value, row.diff.unit)}
                                  </span>
                                )}
                                {row.status === "side_by_side" && (
                                  <span data-compare-side-by-side className="inline-block rounded-full border px-2 py-0.5 text-[8.5px]" style={{ borderColor: "rgba(182,128,42,0.4)", color: C.amber }}>
                                    并列参考
                                  </span>
                                )}
                                {row.status === "not_comparable" && (
                                  <span data-compare-not-comparable className="inline-block rounded-full border border-black/10 bg-[#F5F7FA] px-2 py-0.5 text-[8.5px] text-[#9AA0AA]">
                                    不可比
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="font-mono text-[14px]" data-compare-value-right>
                                  {row.right.status === "available" && row.right.value !== null ? formatMetricValue(row.right.value, row.right.unit) : "—"}
                                </p>
                                <p className="mt-0.5 font-mono text-[8.5px] text-[#9AA0AA]">{row.right.period ?? (row.right.status === "unavailable" ? "不可用" : "无数据")}</p>
                              </div>
                            </div>
                            {(row.left.statement || row.right.statement || row.left.calculationMethod) && (
                              <details className="border-t border-black/5 px-4 py-2" data-compare-trace={row.def.metricId}>
                                <summary className="cursor-pointer font-mono text-[8.5px] tracking-[0.1em] text-[#6D7480] transition hover:text-[#11151B]">
                                  证据与口径
                                </summary>
                                <div className="mt-2 space-y-2 pb-1">
                                  {(
                                    [
                                      { side: row.left, name: row.left.stockName },
                                      { side: row.right, name: row.right.stockName },
                                    ] as const
                                  ).map(({ side, name }) => (
                                    <div key={side.stockCode} className="rounded-[10px] bg-[#F5F7FA] px-3 py-2">
                                      <p className="font-mono text-[8.5px] text-[#9AA0AA]">
                                        {name} · {side.evidenceId}
                                      </p>
                                      <p className="mt-1 text-[11.5px] leading-5">
                                        {side.statement ?? (side.status === "available" ? "证据未随缓存保留" : side.unavailableReason ?? "数据缺失，无法提供证据")}
                                      </p>
                                      {side.calculationMethod && (
                                        <p className="mt-1 font-mono text-[8.5px] text-[#9AA0AA]">口径：{side.calculationMethod}</p>
                                      )}
                                      {side.sourceFields.length > 0 && (
                                        <p className="mt-0.5 font-mono text-[8.5px] text-[#9AA0AA]">来源：{sourceSummary(side.sourceFields)}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )
                })}
              </div>
            )}

            {/* 两侧都不可用时给目录全貌，避免空白页 */}
            {rows.length === 0 && (
              <div className="mt-8 rounded-[14px] border border-black/10 bg-white/90 p-6">
                <p className="text-[13px] font-medium">当前没有可对比的数据</p>
                <p className="mt-2 text-[11.5px] text-[#6D7480]">
                  固定指标目录共 {COMPARE_CATALOG.length} 项（成长 / 盈利 / 现金流 / 估值）。重新生成任一侧研究后即可对比。
                </p>
              </div>
            )}

            <p className="mt-6 text-[10.5px] leading-5 text-[#9AA0AA]">
              本页为确定性数据并排与差值计算，不包含任何 AI 判断；「不可比」与「并列参考」的数据不会被强行推导。
              对比基于各侧研究生成时的缓存数据，报告期以每项标注为准。
            </p>
          </>
        )}
      </div>

      {/* 底部中央常驻对话输入条（与首页/研究库一致）+ 向上弹出的对话面板 */}
      <AssistantPanel
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onOpen={() => setAssistantOpen(true)}
        pageContext="compare"
        onExecute={executeAssistantAction}
      />
    </main>
  )
}
