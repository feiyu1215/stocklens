// Client session Research 缓存（Task 14 §66–§68）：
// 只有用户显式 Enter research 才调用 /api/research/init；
// 同一 session 内已构建过的 Company World 允许复用（避免重复 LLM 调用）。
// 横滑穿行绝不触发任何研究 API（No AI prefetch）。

import type { ResearchSpacePayload } from "@/components/observatory/theme"

const cache = new Map<string, ResearchSpacePayload>()

export function getCachedSpace(stockCode: string): ResearchSpacePayload | null {
  return cache.get(stockCode.toUpperCase()) ?? null
}

export function setCachedSpace(stockCode: string, space: ResearchSpacePayload): void {
  cache.set(stockCode.toUpperCase(), space)
}

export function hasCachedSpace(stockCode: string): boolean {
  return cache.has(stockCode.toUpperCase())
}

export function clearSpaceCache(): void {
  cache.clear()
}

/** 会话缓存大小（供调试/测试断言） */
export function spaceCacheSize(): number {
  return cache.size
}
