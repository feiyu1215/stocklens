import { NextResponse } from "next/server"

import { initResearchSpace } from "@/lib/research/init-space"
import { rateLimitResponse } from "@/lib/http/rate-limit"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const STOCK_CODE_PATTERN = /^\d{6}\.(SZ|SH|BJ)$/

// P2-3：init 改为 NDJSON 分块流式返回——进度帧由服务端在真实阶段边界发出，
// 客户端按行读取驱动 InitialResearchLoading，取代旧的按秒表假进度。
// 帧协议（每行一个 JSON）：
//   {"type":"phase","step":0|1|2,"state":"active"|"complete"}
//   {"type":"result","payload":<ResearchSpaceResponse>}
//   {"type":"error","status":503|500,"message":"..."}
// 原 Server-Timing 调试头与流式响应冲突（计划 §4 风险项），已移除；
// 总耗时在开发环境打印到服务端日志（framer/composer 延迟本就在 payload.ai 里）。
export async function POST(request: Request) {
  const startedAt = Date.now()
  const limited = rateLimitResponse(request, { scope: "research-init", limit: 10 })
  if (limited) return limited
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "请求体必须是合法 JSON" }, { status: 400 })
  }
  const { stockCode, question } = (body ?? {}) as Record<string, unknown>

  if (typeof stockCode !== "string" || !STOCK_CODE_PATTERN.test(stockCode.trim().toUpperCase())) {
    return NextResponse.json({ error: "无效的 stockCode（期望格式如 000333.SZ）" }, { status: 400 })
  }
  if (question !== undefined && (typeof question !== "string" || question.trim().length > 500)) {
    return NextResponse.json({ error: "question 限 1–500 字符" }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`))
      }
      try {
        const resp = await initResearchSpace({
          stockCode: stockCode.trim().toUpperCase(),
          question: typeof question === "string" && question.trim().length > 0 ? question.trim() : undefined,
          onPhase: (event) => send({ type: "phase", ...event }),
        })
        // 原 503 语义（Fuyao 缺 Key 且无任何证据 = 服务端配置错误）：流式响应头此时已发出，
        // 改用 error 帧诚实表达，客户端按失败态处理（不会伪装成半成品结果）。
        if (resp.evidence.length === 0 && resp.company.availableCapabilities.length === 0) {
          send({ type: "error", status: 503, message: "数据源未配置（缺少 Fuyao API Key），无法生成研究证据" })
        } else {
          send({ type: "result", payload: resp })
        }
        if (process.env.NODE_ENV !== "production") {
          console.log(`[research/init] total=${Date.now() - startedAt}ms framer=${resp.ai.framer?.latencyMs ?? 0}ms composer=${resp.ai.composer?.latencyMs ?? 0}ms`)
        }
      } catch (err) {
        // 阶段失败不修饰：明确 error 帧，绝不发"看起来还在进行"的帧
        send({ type: "error", status: 500, message: err instanceof Error ? err.message : "init failed" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // no-transform：禁止中间层压缩/改写导致的缓冲；X-Accel-Buffering 提示 nginx 类代理不缓冲
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
