import { Suspense } from "react"

import { ObservatoryApp } from "@/components/observatory/ObservatoryApp"

// /observatory（Task 12 §97–§98）：V2 独立入口，默认不替换 /（Root Cutover 等待决定）。
// ?stockCode=000333.SZ 可直接进入；?fixture=<name> 使用 canonical fixture（前端开发/截图确定性）。

export const metadata = {
  title: "StockLens Observatory",
  description: "An explorable evidence space for understanding a company.",
}

export default async function ObservatoryPage({
  searchParams,
}: {
  searchParams: Promise<{ stockCode?: string; fixture?: string }>
}) {
  const params = await searchParams
  const initialStockCode = params.fixture ? undefined : params.stockCode?.toUpperCase()
  return (
    <Suspense fallback={null}>
      <ObservatoryApp initialStockCode={initialStockCode} fixture={params.fixture} />
    </Suspense>
  )
}
