import { describe, expect, it, vi } from "vitest"

import { streamInitResearchSpace, type InitPhaseFrame } from "@/lib/v5/init-stream"

const SAMPLE_PAYLOAD = {
  spaceId: "s-1",
  company: { stockCode: "000333.SZ", stockName: "美的集团", availableCapabilities: ["financial_growth"] },
  dimensions: [],
}

function ndjsonResponse(frames: unknown[], ok = true, status = 200) {
  const body = frames.map((f) => JSON.stringify(f)).join("\n") + "\n"
  return new Response(body, { status: ok ? 200 : status })
}

describe("streamInitResearchSpace（P2-3 NDJSON 流式 init）", () => {
  it("phase 帧按序回调，result 帧作为返回值", async () => {
    const phases: InitPhaseFrame[] = []
    const fetchMock = vi.fn(async () =>
      ndjsonResponse([
        { type: "phase", step: 0, state: "active" },
        { type: "phase", step: 0, state: "complete" },
        { type: "phase", step: 1, state: "active" },
        { type: "phase", step: 1, state: "complete" },
        { type: "phase", step: 2, state: "active" },
        { type: "result", payload: SAMPLE_PAYLOAD },
      ]),
    )
    vi.stubGlobal("fetch", fetchMock)

    const payload = await streamInitResearchSpace({
      body: { stockCode: "000333.SZ" },
      signal: new AbortController().signal,
      onPhase: (f) => phases.push(f),
    })
    expect(payload).toEqual(SAMPLE_PAYLOAD)
    expect(phases.map((p) => [p.step, p.state])).toEqual([
      [0, "active"],
      [0, "complete"],
      [1, "active"],
      [1, "complete"],
      [2, "active"],
    ])
  })

  it("error 帧抛错且带服务端信息（原 503 配置缺失语义）", async () => {
    const fetchMock = vi.fn(async () =>
      ndjsonResponse([
        { type: "phase", step: 0, state: "active" },
        { type: "error", status: 503, message: "数据源未配置" },
      ]),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      streamInitResearchSpace({ body: { stockCode: "000333.SZ" }, signal: new AbortController().signal }),
    ).rejects.toThrow("init 503: 数据源未配置")
  })

  it("非 OK 响应直接抛错（限流/参数错误仍是普通 JSON）", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "无效的 stockCode" }), { status: 400 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(
      streamInitResearchSpace({ body: { stockCode: "BAD" }, signal: new AbortController().signal }),
    ).rejects.toThrow("init 400")
  })

  it("容忍脏行；跨 chunk 截断的行能正确拼接；流结束无 result 帧则抛错", async () => {
    const fetchMock = vi.fn(async () => {
      const enc = new TextEncoder()
      const chunks = [
        enc.encode("{\"type\":\"phase\",\"step\":0,\"state\":\"acti"),
        enc.encode("ve\"}\nnot a json line\n{\"type\":\"result\",\"payl"),
        enc.encode("oad\":" + JSON.stringify(JSON.stringify(SAMPLE_PAYLOAD)).slice(0, 0) + JSON.stringify(SAMPLE_PAYLOAD) + "}\n"),
      ]
      let i = 0
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (i < chunks.length) controller.enqueue(chunks[i++])
            else controller.close()
          },
        }),
      )
    })
    vi.stubGlobal("fetch", fetchMock)

    const phases: InitPhaseFrame[] = []
    const payload = await streamInitResearchSpace({
      body: { stockCode: "000333.SZ" },
      signal: new AbortController().signal,
      onPhase: (f) => phases.push(f),
    })
    expect(payload).toEqual(SAMPLE_PAYLOAD)
    expect(phases).toEqual([{ step: 0, state: "active" }])

    // 流结束但没有任何帧 → 明确抛错，不停在半完成状态
    const emptyFetch = vi.fn(async () => new Response("\n\n"))
    vi.stubGlobal("fetch", emptyFetch)
    await expect(
      streamInitResearchSpace({ body: { stockCode: "000333.SZ" }, signal: new AbortController().signal }),
    ).rejects.toThrow("没有收到结果帧")
  })
})
