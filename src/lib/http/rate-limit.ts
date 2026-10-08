import "server-only"

import { NextResponse } from "next/server"

interface WindowEntry {
  count: number
  resetAt: number
}

const windows = new Map<string, WindowEntry>()
let callsSinceCleanup = 0

export interface RateLimitPolicy {
  scope: string
  limit: number
  windowMs?: number
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown"
}

function cleanupExpired(now: number): void {
  callsSinceCleanup += 1
  if (callsSinceCleanup < 100) return
  callsSinceCleanup = 0
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key)
  }
}

/**
 * 单实例固定窗口限流。它用于拦截突发滥用和意外重复请求；多实例部署仍应在平台网关增加全局限流。
 */
export function rateLimitResponse(request: Request, policy: RateLimitPolicy): NextResponse | null {
  const now = Date.now()
  const windowMs = policy.windowMs ?? 60_000
  cleanupExpired(now)

  const key = `${policy.scope}:${clientKey(request)}`
  const current = windows.get(key)
  const entry = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + windowMs }
    : { count: current.count + 1, resetAt: current.resetAt }
  windows.set(key, entry)

  if (entry.count <= policy.limit) return null

  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1_000))
  return NextResponse.json(
    { error: "请求过于频繁，请稍后重试", retryAfterSeconds },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  )
}

export function productionDebugRouteResponse(): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null
  return NextResponse.json({ error: "Not found" }, { status: 404 })
}

/** 仅供测试隔离固定窗口状态。 */
export function resetRateLimitsForTests(): void {
  windows.clear()
  callsSinceCleanup = 0
}
