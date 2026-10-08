"use client"

// 研究笔记导出（打印版）—— 覆盖层组件（阶段 3 / P2-2）
//
// - 数据全部来自 buildNotesDocument(payload)（src/lib/v5/notes-export.ts），不复用画布 DOM。
// - 屏显是可滚动的纸张预览；「打印 / 另存为 PDF」调 window.print()，由浏览器对话框产出 PDF。
// - 打印时通过 body.print-notes-open + 全局 CSS 隐藏页面其余部分，只留本文档（见 globals.css）。

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import {
  buildNotesDocument,
  type NotesClaimLine,
  type NotesDocument,
  type NotesEvidenceLine,
} from "@/lib/v5/notes-export"
import type { ResearchSpacePayload } from "@/components/observatory/theme"

const TYPE_LABEL: Record<NotesEvidenceLine["type"], string> = {
  fact: "事实",
  inference: "推断",
  unknown: "未知",
}

const SIGNAL_LABEL: Record<string, string> = {
  positive: "正面",
  negative: "负面",
  conflict: "冲突",
  neutral: "中性",
  unknown: "未知",
}

function signalColor(signal: string): string {
  if (signal === "positive") return "#1B7A3D"
  if (signal === "negative") return "#B3402E"
  if (signal === "conflict") return "#B3402E"
  return "#5A5F6B"
}

function freshnessLine(e: NotesEvidenceLine): string {
  const parts: string[] = []
  parts.push(`数据截至 ${e.freshnessDataAsOf ?? "未知"}`)
  if (e.freshnessStatus) parts.push(e.freshnessStatus.toUpperCase())
  if (e.freshnessReason) parts.push(e.freshnessReason)
  return parts.join(" · ")
}

function EvidenceRow({ e, index }: { e: NotesEvidenceLine; index: number }) {
  return (
    <div data-notes-evidence className="notes-evidence-row" style={{ padding: "10px 0", borderTop: "1px solid #E2E0DA" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#8A8F99" }}>
          [{String(index).padStart(2, "0")} · {e.evidenceId}]
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#14161B" }}>{e.title}</span>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#5A5F6B" }}>
          {TYPE_LABEL[e.type] ?? e.type}
          {e.signal ? ` · ${SIGNAL_LABEL[e.signal] ?? e.signal}` : ""}
          {e.verifyStatus === "unverified" ? " · 未验证" : ""}
        </span>
      </div>
      <p style={{ margin: "6px 0 4px", fontSize: 13.5, lineHeight: 1.7, color: "#14161B" }}>{e.statement}</p>
      {e.freshnessStatus && (
        <p style={{ margin: 0, fontSize: 11.5, color: e.freshnessStatus === "stale" ? "#B3402E" : "#5A5F6B" }}>
          {freshnessLine(e)}
        </p>
      )}
      {e.unavailableReason && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#B3402E" }}>无法核实的原因：{e.unavailableReason}</p>
      )}
      {e.metrics.map((m) => (
        <p key={m.metricId} style={{ margin: "3px 0 0", fontSize: 11.5, color: "#5A5F6B" }}>
          <span style={{ color: "#14161B" }}>{m.name} = {m.valueLabel}</span>
          {m.period ? `（${m.period}）` : ""}
          {` · 计算方式：${m.calculationMethod}`}
          {m.unavailableReason ? ` · 不可用原因：${m.unavailableReason}` : ""}
          {m.sourceFields.length > 0 ? ` · 来源：${m.sourceFields.join("、")}` : ""}
        </p>
      ))}
    </div>
  )
}

function ClaimRow({ c }: { c: NotesClaimLine }) {
  return (
    <div data-notes-claim className="notes-claim-row" style={{ padding: "7px 0", borderBottom: "1px dashed #E8E6E0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span
          style={{
            flexShrink: 0,
            fontFamily: "monospace",
            fontSize: 10,
            color: signalColor(c.signal),
            border: `1px solid ${signalColor(c.signal)}`,
            padding: "0 5px",
          }}
        >
          {SIGNAL_LABEL[c.signal] ?? c.signal}
        </span>
        <span style={{ fontSize: 13.5, lineHeight: 1.65, color: "#14161B" }}>{c.text}</span>
      </div>
      {c.evidenceIds.length > 0 && (
        <p style={{ margin: "3px 0 0 0", fontFamily: "monospace", fontSize: 10.5, color: "#8A8F99" }}>
          依据：{c.evidenceIds.join("、")}
        </p>
      )}
    </div>
  )
}

function Document({ doc }: { doc: NotesDocument }) {
  const { meta } = doc
  return (
    <div data-notes-document style={{ color: "#14161B" }}>
      <header style={{ borderBottom: "2px solid #14161B", paddingBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "0.02em" }}>
          {meta.companyName} 研究笔记
          <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 400, color: "#5A5F6B", marginLeft: 10 }}>
            {meta.stockCode}
            {meta.industryName ? ` · ${meta.industryName}` : ""}
          </span>
        </h1>
        {meta.entryQuestion && (
          <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "#5A5F6B" }}>研究问题：{meta.entryQuestion}</p>
        )}
      </header>

      {/* 必带元素 ④：spaceId 与导出时间；必带元素 ①：retrievedAt 与 dataAsOf */}
      <section data-notes-meta style={{ padding: "10px 0", borderBottom: "1px solid #E2E0DA", fontSize: 11.5, color: "#5A5F6B", lineHeight: 1.8 }}>
        <div>spaceId：{meta.spaceId}</div>
        <div>导出时间：{meta.exportedAt}</div>
        <div>数据取回时间：{meta.retrievedAt ?? "未记录"}</div>
        <div>行情数据截至：{meta.marketDataAsOf ?? "未记录"}</div>
        {meta.aiStatus !== "success" && (
          <div data-notes-ai-warning style={{ color: "#B3402E" }}>
            注意：AI 组织状态为 {meta.aiStatus}
            {meta.aiIssues.length > 0 ? `（${meta.aiIssues.join("；")}）` : ""}——本笔记可能不完整。
          </div>
        )}
        {meta.errors.map((err) => (
          <div key={err.domain} style={{ color: "#B3402E" }}>
            数据错误（{err.domain}）：{err.message}
          </div>
        ))}
      </section>

      {doc.sections.map((section) => (
        <section key={section.dimensionId} data-notes-section style={{ marginTop: 18 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, breakAfter: "avoid" }}>{section.label}</h2>
          <p style={{ margin: "4px 0 8px", fontSize: 12, color: "#5A5F6B" }}>研究问题：{section.researchQuestion}</p>
          {section.missingInformation.length > 0 && (
            <div style={{ margin: "0 0 8px", padding: "6px 10px", background: "#F5F3EE", fontSize: 12, color: "#5A5F6B" }}>
              缺失信息：{section.missingInformation.join("；")}
            </div>
          )}
          <div style={{ marginBottom: 10 }}>
            {section.claims.map((c) => (
              <ClaimRow key={c.claimId} c={c} />
            ))}
            {section.claims.length === 0 && <p style={{ margin: 0, fontSize: 12, color: "#8A8F99" }}>本维度没有结论记录。</p>}
          </div>
          <div>
            {section.evidence.map((e, i) => (
              <EvidenceRow key={e.evidenceId} e={e} index={i + 1} />
            ))}
            {section.evidence.length === 0 && (
              <p style={{ margin: 0, fontSize: 12, color: "#8A8F99" }}>本维度没有证据记录。</p>
            )}
          </div>
        </section>
      ))}

      {/* 必带元素 ③：UNKNOWN 分区恒导出 */}
      <section data-notes-unknowns style={{ marginTop: 22 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, borderBottom: "2px solid #14161B", paddingBottom: 6, breakAfter: "avoid" }}>
          UNKNOWN · 未能核实的信息
        </h2>
        {doc.unknowns.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#5A5F6B" }}>本次研究没有 UNKNOWN 证据记录。</p>
        ) : (
          doc.unknowns.map((e, i) => <EvidenceRow key={e.evidenceId} e={e} index={i + 1} />)
        )}
      </section>

      {doc.unassigned && doc.unassigned.length > 0 && (
        <section data-notes-unassigned style={{ marginTop: 22 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, breakAfter: "avoid" }}>未被维度引用的证据（兜底）</h2>
          {doc.unassigned.map((e, i) => (
            <EvidenceRow key={e.evidenceId} e={e} index={i + 1} />
          ))}
        </section>
      )}

      {/* 必带元素 ⑤：免责声明 */}
      <footer data-notes-disclaimer style={{ marginTop: 26, paddingTop: 10, borderTop: "2px solid #14161B", fontSize: 12, color: "#5A5F6B" }}>
        {doc.disclaimer}
      </footer>
    </div>
  )
}

export default function ResearchNotesExport({
  payload,
  open,
  onClose,
}: {
  payload: ResearchSpacePayload
  open: boolean
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // rAF 延迟一帧：规避 react-hooks/set-state-in-effect（同 ResearchCanvas 侧板补开模式）
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (!open) return
    document.body.classList.add("print-notes-open")
    return () => document.body.classList.remove("print-notes-open")
  }, [open])

  if (!open || !mounted) return null

  const doc = buildNotesDocument(payload)

  return createPortal(
    <div
      id="research-notes-print-root"
      data-notes-overlay
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(20, 22, 27, 0.55)",
        overflow: "auto",
        padding: "32px 16px",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="研究笔记打印预览"
    >
      <div
        className="notes-print-sheet"
        style={{
          maxWidth: 820,
          margin: "0 auto",
          background: "#FFFFFF",
          padding: "36px 44px 44px",
        }}
      >
        <div className="notes-toolbar" data-notes-toolbar style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 12, color: "#5A5F6B", flex: 1 }}>
            打印预览 · 在打印对话框中选择「另存为 PDF」即可导出文件
          </span>
          <button
            type="button"
            data-notes-print
            onClick={() => window.print()}
            style={{
              border: "1px solid #14161B",
              background: "#14161B",
              color: "#FFFFFF",
              padding: "7px 16px",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            打印 / 另存为 PDF
          </button>
          <button
            type="button"
            data-notes-close
            onClick={onClose}
            style={{
              border: "1px solid #C9C7C1",
              background: "#FFFFFF",
              color: "#14161B",
              padding: "7px 16px",
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            关闭
          </button>
        </div>
        <Document doc={doc} />
      </div>
    </div>,
    document.body,
  )
}
