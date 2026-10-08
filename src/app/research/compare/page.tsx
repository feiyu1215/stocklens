import type { Metadata } from "next"

import ResearchCompare from "@/components/v5/ResearchCompare"

export const metadata: Metadata = {
  title: "StockLens · 双公司对比",
  description: "在研究库中选择两家公司，基于本机存量的结构化指标与证据做同口径并排对比。",
}

export default function ResearchComparePage() {
  return <ResearchCompare />
}
