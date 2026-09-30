import "server-only"

import type { AIInvocationTrace, LLMTask } from "./types"

// LLM Model Adapter —— 唯一允许直接调用大模型 API 的模块。
// 只做：鉴权、请求、超时、网络重试；JSON 解析与业务校验在 planner/synthesizer 完成。

const DEFAULT_BASE_URL = "https://api.deepseek.com"
const DEFAULT_MODEL = "deepseek-chat"
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_NETWORK_RETRIES = 1

export class LLMConfigError extends Error {
  readonly code = "LLM_CONFIG_MISSING"
  constructor(message: string) {
    super(message)
    this.name = "LLMConfigError"
  }
}

export class LLMRequestError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = "LLMRequestError"
  }
}

export interface RunLLMOptions {
  task: LLMTask
  promptVersion: string
  systemPrompt: string
  userPrompt: string
  temperature: number
  model?: string
  timeoutMs?: number
  networkRetries?: number
  maxTokens?: number
}

export interface RunLLMResult {
  output: string
  trace: AIInvocationTrace
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[]
}

async function callChatCompletion(
  body: Record<string, unknown>,
  apiKey: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new LLMRequestError(`LLM 请求失败：${reason}`, true)
  }
  if (!res.ok) {
    // 4xx 属确定性失败（配置/权限问题），重试无意义；由调用方决定
    const retryable = res.status >= 500
    throw new LLMRequestError(`LLM 接口返回 HTTP ${res.status}`, retryable)
  }
  const data = (await res.json().catch(() => null)) as ChatCompletionResponse | null
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== "string" || content.length === 0) {
    throw new LLMRequestError("LLM 返回内容为空")
  }
  return content
}

export async function runLLM(opts: RunLLMOptions): Promise<RunLLMResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new LLMConfigError("DEEPSEEK_API_KEY 未配置：AI 解释不可用，但不影响已验证证据的生成")
  }
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "")
  const model = opts.model || process.env.DEEPSEEK_MODEL || DEFAULT_MODEL
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxAttempts = (opts.networkRetries ?? DEFAULT_NETWORK_RETRIES) + 1

  const startedAt = Date.now()
  let lastError: Error | null = null
  let attempts = 0

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts += 1
    try {
      const output = await callChatCompletion(
        {
          model,
          messages: [
            { role: "system", content: opts.systemPrompt },
            { role: "user", content: opts.userPrompt },
          ],
          temperature: opts.temperature,
          max_tokens: opts.maxTokens,
          response_format: { type: "json_object" },
        },
        apiKey,
        baseUrl,
        timeoutMs,
      )
      return {
        output,
        trace: {
          task: opts.task,
          model,
          promptVersion: opts.promptVersion,
          status: "success",
          latencyMs: Date.now() - startedAt,
          retries: attempts - 1,
        },
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (!(err instanceof LLMRequestError) || !err.retryable) break
      // 可重试错误（网络失败 / 5xx）：继续下一次尝试；4xx 与解析错误立即失败
    }
  }

  return {
    output: "",
    trace: {
      task: opts.task,
      model,
      promptVersion: opts.promptVersion,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      retries: attempts - 1,
      validationIssues: [lastError?.message ?? "unknown error"],
    },
  }
}

/** 解析 LLM 输出中的 JSON（容忍 ```json 围栏与前后杂文字） */
export function parseLLMJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const candidate = (fenced ? fenced[1] : text).trim()
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new LLMRequestError("LLM 输出中未找到 JSON 对象")
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    throw new LLMRequestError("LLM 输出不是合法 JSON")
  }
}
