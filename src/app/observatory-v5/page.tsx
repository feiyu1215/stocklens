import type { Metadata } from "next"

import ResearchCanvas from "@/components/v5/ResearchCanvas"

// Task 15.3：Research Canvas（按规格实现，无设计决策）。
// 参考与角色由产品设计者固定（§2）；本 Gate 仅实现 §34 列表。生产 /observatory 不变。

export const metadata: Metadata = {
  title: "StockLens · Research Canvas (v5)",
  description: "Specified implementation — first gate.",
}

export default function ObservatoryV5Page() {
  return <ResearchCanvas />
}
