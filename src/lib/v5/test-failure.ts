// Task 16.2A B4：失败态注入（仅测试环境）。
// 生产构建里 `process.env.NODE_ENV === "production"` 在编译期即为常量，
// 整段分支会被折叠掉——线上带 ?testFailure= 不会有任何效果。

export type TestFailureKind = "research-init" | "dimension" | "followup"

let installed = false

const ENDPOINT: Record<TestFailureKind, string> = {
  "research-init": "/api/research/init",
  dimension: "/api/research/dimension",
  followup: "/api/followup",
}

function requestedKind(): TestFailureKind | null {
  if (typeof window === "undefined") return null
  const raw = new URLSearchParams(window.location.search).get("testFailure")
  if (raw === "research-init" || raw === "dimension" || raw === "followup") return raw
  return null
}

/** 只让第一次匹配的请求失败：Retry 走真实网络，因此验证的是"恢复"而不是"再失败一次"。 */
export function installTestFailureInterceptor(): TestFailureKind | null {
  if (process.env.NODE_ENV === "production") return null
  if (typeof window === "undefined") return null
  const kind = requestedKind()
  if (!kind) return null
  if (installed) return kind
  installed = true
  const target = ENDPOINT[kind]
  const original = window.fetch.bind(window)
  let injected = false
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (!injected && url.indexOf(target) >= 0) {
      injected = true
      window.fetch = original
      return Promise.resolve(
        new Response(JSON.stringify({ error: "test-injected failure", kind }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      )
    }
    return original(input, init)
  }) as typeof window.fetch
  return kind
}
