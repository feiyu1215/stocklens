// P2-3：/api/research/init 的 NDJSON 流式客户端。
// 帧协议见 src/app/api/research/init/route.ts 头注释：
//   {"type":"phase","step":0|1|2,"state":"active"|"complete"}
//   {"type":"result","payload":<ResearchSpaceResponse>}
//   {"type":"error","status":...,"message":"..."}
import type { ResearchSpacePayload } from "@/components/observatory/theme"

export interface InitPhaseFrame {
  step: 0 | 1 | 2
  state: "active" | "complete"
}

export async function streamInitResearchSpace(options: {
  body: { stockCode: string; question?: string }
  signal: AbortSignal
  onPhase?: (frame: InitPhaseFrame) => void
}): Promise<ResearchSpacePayload> {
  const res = await fetch("/api/research/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: options.signal,
    body: JSON.stringify(options.body),
  })
  // 非 OK（限流 429 / 参数 400 仍是普通 JSON 错误响应）→ 与旧行为一致：抛错进失败态
  if (!res.ok) throw new Error(`init ${res.status}`)
  if (!res.body) throw new Error("init: 无响应体")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let result: ResearchSpacePayload | null = null
  let streamError: { status: number; message: string } | null = null

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let frame: unknown
    try {
      frame = JSON.parse(trimmed)
    } catch {
      return // 容忍脏行，不中断整个流
    }
    const f = frame as {
      type?: string
      step?: number
      state?: string
      payload?: ResearchSpacePayload
      status?: number
      message?: string
    }
    if (f.type === "phase" && (f.step === 0 || f.step === 1 || f.step === 2) && (f.state === "active" || f.state === "complete")) {
      options.onPhase?.({ step: f.step, state: f.state })
    } else if (f.type === "result" && f.payload) {
      result = f.payload
    } else if (f.type === "error") {
      streamError = { status: f.status ?? 500, message: f.message ?? "init failed" }
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx = buffer.indexOf("\n")
    while (idx >= 0) {
      handleLine(buffer.slice(0, idx))
      buffer = buffer.slice(idx + 1)
      idx = buffer.indexOf("\n")
    }
  }
  const tail = decoder.decode()
  if (tail.trim()) handleLine(tail)

  // 诚实呈现：error 帧（如服务端配置缺失，原 503 语义）→ 明确失败，不包装成结果。
  // 注：streamError 在 handleLine 闭包内赋值，TS 控制流分析推断不到，此处显式断言。
  const failure = streamError as { status: number; message: string } | null
  if (failure) throw new Error(`init ${failure.status}: ${failure.message}`)
  if (!result) throw new Error("init: 流结束但没有收到结果帧")
  return result
}
