import type { Metadata } from "next"

import EditorialWorld from "@/components/lab/editorial/EditorialWorld"

// Task 15.2 editorial Visual Prototype（§36/§46）：
// /observatory/lab/editorial-v1 —— 固定 Midea fixture，不接真实 AI（§37），不动生产 Observatory。

export const metadata: Metadata = {
  title: "StockLens Lab · Editorial Research World",
  description: "Art-direction prototype — not integrated into the product.",
}

export default function EditorialLabPage() {
  return <EditorialWorld />
}
