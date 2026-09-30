import "server-only"

import { fetchTickerSearch } from "./fuyao"

// Company Search（Task 12 §4–6）：任意 A 股入口。
// 使用真实扶摇标的检索；只返回 A 股，top 8。默认演示标的（美的）保留。

export interface StockSearchItem {
  stockCode: string
  stockName: string
  market?: string
}

export const DEFAULT_DEMO_STOCK = { stockCode: "000333.SZ", stockName: "美的集团" }

const MARKET_BY_SUFFIX: Record<string, string> = {
  ".SZ": "深交所",
  ".SH": "上交所",
  ".BJ": "北交所",
}

export async function searchStocks(query: string, limit = 8): Promise<StockSearchItem[]> {
  const q = query.trim()
  if (q.length === 0) return []
  const data = await fetchTickerSearch(q)
  const items = (data.item ?? [])
    .filter((it) => it.asset_type === "a-share")
    .slice(0, limit)
    .map((it): StockSearchItem => {
      const suffix = it.thscode.slice(-3).toUpperCase()
      return {
        stockCode: it.thscode.toUpperCase(),
        stockName: it.name,
        ...(MARKET_BY_SUFFIX[suffix] ? { market: MARKET_BY_SUFFIX[suffix] } : {}),
      }
    })
  return items
}
