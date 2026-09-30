import type { Metadata } from "next"

import CompanyWorldV2 from "@/components/v4/CompanyWorldV2"

// Task 15.2R：Company World V2（reference reproduction gate）。
// 参考与角色由产品设计者指定（Unseen World 为唯一主参考）；本页不做自由设计。
// 阶段范围：Company World + Pan + Dimension hover（§44）。

export const metadata: Metadata = {
  title: "StockLens · Company World V2 (reference reproduction)",
  description: "Reference reproduction prototype — not the production route.",
}

export default function ObservatoryV4Page() {
  return <CompanyWorldV2 />
}
