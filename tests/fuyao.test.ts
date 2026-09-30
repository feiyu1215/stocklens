import { afterEach, describe, expect, it, vi } from "vitest"

import {
  FuyaoApiError,
  FuyaoConfigError,
  FuyaoRequestError,
  fetchTickerSearch,
} from "@/lib/data/fuyao"

const ORIGINAL_KEY = process.env.FUYAO_API_KEY

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL_KEY === undefined) delete process.env.FUYAO_API_KEY
  else process.env.FUYAO_API_KEY = ORIGINAL_KEY
})

describe("fuyaoFetch 错误行为", () => {
  it("Case C：缺失 FUYAO_API_KEY 时抛 FuyaoConfigError，且不发起任何网络请求", async () => {
    delete process.env.FUYAO_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchTickerSearch("000333")).rejects.toBeInstanceOf(FuyaoConfigError)
    await expect(fetchTickerSearch("000333")).rejects.toMatchObject({
      code: "FUYAO_CONFIG_MISSING",
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("信封 code !== 0（业务错误，如未知代码）抛 FuyaoApiError 并携带原始 code", async () => {
    process.env.FUYAO_API_KEY = "test-key"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 1002, message: "Unknown A-share thscode: 999999.SZ", data: null }), {
          status: 200,
        }),
      ),
    )

    await expect(fetchTickerSearch("999999")).rejects.toBeInstanceOf(FuyaoApiError)
    await expect(fetchTickerSearch("999999")).rejects.toMatchObject({ code: "1002" })
  })

  it("HTTP 5xx 抛 FuyaoRequestError", async () => {
    process.env.FUYAO_API_KEY = "test-key"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    )

    await expect(fetchTickerSearch("000333")).rejects.toBeInstanceOf(FuyaoRequestError)
  })

  it("网络层失败（如超时）抛 FuyaoRequestError，而不是被吞掉", async () => {
    process.env.FUYAO_API_KEY = "test-key"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("The operation was aborted due to timeout")
      }),
    )

    await expect(fetchTickerSearch("000333")).rejects.toThrow(/aborted/)
  })
})
