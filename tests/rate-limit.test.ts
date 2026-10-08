import { afterEach, describe, expect, it } from "vitest"

import {
  productionDebugRouteResponse,
  rateLimitResponse,
  resetRateLimitsForTests,
} from "@/lib/http/rate-limit"

const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  resetRateLimitsForTests()
  Object.defineProperty(process.env, "NODE_ENV", {
    value: originalNodeEnv,
    configurable: true,
    enumerable: true,
    writable: true,
  })
})

describe("API 访问保护", () => {
  it("同一来源超过窗口额度后返回 429 和 Retry-After", async () => {
    const request = new Request("http://localhost/api/followup", {
      headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
    })
    expect(rateLimitResponse(request, { scope: "test", limit: 2 })).toBeNull()
    expect(rateLimitResponse(request, { scope: "test", limit: 2 })).toBeNull()
    const limited = rateLimitResponse(request, { scope: "test", limit: 2 })
    expect(limited?.status).toBe(429)
    expect(limited?.headers.get("Retry-After")).toBeTruthy()
    await expect(limited?.json()).resolves.toMatchObject({ error: "请求过于频繁，请稍后重试" })
  })

  it("不同来源独立计数", () => {
    const first = new Request("http://localhost", { headers: { "x-real-ip": "203.0.113.1" } })
    const second = new Request("http://localhost", { headers: { "x-real-ip": "203.0.113.2" } })
    expect(rateLimitResponse(first, { scope: "test", limit: 1 })).toBeNull()
    expect(rateLimitResponse(second, { scope: "test", limit: 1 })).toBeNull()
  })

  it("生产环境隐藏 debug 路由", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      enumerable: true,
      writable: true,
    })
    expect(productionDebugRouteResponse()?.status).toBe(404)
  })
})
