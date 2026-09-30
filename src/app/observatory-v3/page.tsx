import type { Metadata } from "next"

import ObservatoryV3 from "@/components/v3/ObservatoryV3"

// Task 15.2 UI RESET：Editorial Research Canvas（独立 route，生产 /observatory 不动）。
// 照搬参考：docs/design-audit/ui-reset/REFERENCE_AUDIT.md

export const metadata: Metadata = {
  title: "StockLens · Editorial Research Canvas (v3 prototype)",
  description: "UI Reset prototype — not yet the production route.",
}

export default function ObservatoryV3Page() {
  return <ObservatoryV3 />
}
