// 阶段 1（P1-1）：持久化后端的行为契约。
//
// 这里测的不是"IndexedDB 好不好用"（vitest 是 node 环境，没有 indexedDB），
// 而是升级要解决的三条真问题：无存储环境不崩、写入失败必须上报、失败不再静默。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearStorageEviction,
  clearStorageFailure,
  currentBackend,
  getLastStorageEviction,
  getLastStorageFailure,
  onStorageFailure,
  readKV,
  setStorageEvictionHook,
  writeKV,
} from "@/lib/v5/idb"

function installMemoryStorage() {
  const store = new Map<string, string>()
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
  vi.stubGlobal("localStorage", mock)
  vi.stubGlobal("sessionStorage", mock)
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// 模块级状态会跨用例残留（lastFailure / lastEviction / hook），每个用例前必须归零
beforeEach(() => {
  clearStorageFailure()
  clearStorageEviction()
  setStorageEvictionHook(null)
})

describe("持久化后端（P1-1）", () => {
  it("无 window 时 currentBackend 报 none，读写都不抛错", async () => {
    // node 环境：既没有 indexedDB 也没有 localStorage
    expect(currentBackend()).toBe("none")
    await expect(readKV("whatever")).resolves.toBeUndefined()
    await expect(writeKV("whatever", { a: 1 })).resolves.toBe(false)
  })

  it("写入后能读回来（localStorage 兜底路径）", async () => {
    installMemoryStorage()
    await writeKV("stocklens.test.roundtrip", { hello: "world" })
    await expect(readKV<{ hello: string }>("stocklens.test.roundtrip")).resolves.toEqual({ hello: "world" })
  })

  it("读不存在的 key 返回 undefined，不是 undefined 之外的东西", async () => {
    installMemoryStorage()
    await expect(readKV("stocklens.test.missing")).resolves.toBeUndefined()
  })

  it("localStorage 抛配额错误时：不崩，且失败被上报（不再静默吞掉）", async () => {
    installMemoryStorage()
    const quotaError = Object.assign(new Error("exceeded the quota"), { name: "QuotaExceededError" })
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw quotaError
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    })

    const seen: ReturnType<typeof getLastStorageFailure>[] = []
    const off = onStorageFailure((f) => seen.push(f))

    await expect(writeKV("stocklens.test.quota", { a: 1 })).resolves.toBe(false)

    off()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]?.reason).toBe("quota")
    expect(getLastStorageFailure()?.reason).toBe("quota")
  })

  it("写入失败不会丢掉后续订阅者：listener 可以在失败发生前注册", async () => {
    installMemoryStorage()
    const seen: number[] = []
    const off = onStorageFailure(() => seen.push(1))
    await writeKV("stocklens.test.ok", { v: 1 })
    off()
    // 成功写入不应产生失败上报
    expect(seen).toHaveLength(0)
  })

  it("写满时先自动淘汰再重试：写入成功，且如实记录清理了什么", async () => {
    const store = installMemoryStorage()
    let full = true
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full) throw Object.assign(new Error("exceeded the quota"), { name: "QuotaExceededError" })
        store.set(k, v)
      },
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    })

    const protectedKeys: string[] = []
    setStorageEvictionHook(async (protectKey) => {
      protectedKeys.push(protectKey)
      // 淘汰动作本身"腾出了空间"
      full = false
      store.delete("stocklens.research.OLD")
      return ["stocklens.research.OLD"]
    })

    await expect(writeKV("stocklens.research.000333.SZ", { ok: true })).resolves.toBe(true)
    expect(protectedKeys).toContain("stocklens.research.000333.SZ")
    expect(getLastStorageEviction()?.keys).toContain("stocklens.research.OLD")
    expect(getLastStorageFailure()).toBeNull()
  })

  it("存储正常时不会调用淘汰策略（只在写失败时才动用户的缓存）", async () => {
    installMemoryStorage()
    let calls = 0
    setStorageEvictionHook(async () => {
      calls += 1
      return []
    })
    await writeKV("stocklens.test.normal", { v: 1 })
    expect(calls).toBe(0)
  })

  it("淘汰策略收到的是正在写的 key，不得删掉它自己", async () => {
    installMemoryStorage()
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw Object.assign(new Error("exceeded the quota"), { name: "QuotaExceededError" })
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    })
    let receivedProtectKey: string | null = null
    // 故意写一个错误的策略（返回受保护 key 本身），验证调用方传入的 protectKey 是对的
    setStorageEvictionHook(async (protectKey) => {
      receivedProtectKey = protectKey
      return [protectKey]
    })
    await expect(writeKV("stocklens.research.ME", { v: 1 })).resolves.toBe(false)
    expect(receivedProtectKey).toBe("stocklens.research.ME")
  })

  it("淘汰也救不了时才报失败，且仍然不抛错", async () => {
    installMemoryStorage()
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw Object.assign(new Error("exceeded the quota"), { name: "QuotaExceededError" })
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    })
    setStorageEvictionHook(async () => []) // 腾不出空间

    const seen: ReturnType<typeof getLastStorageFailure>[] = []
    const off = onStorageFailure((f) => seen.push(f))
    await expect(writeKV("stocklens.test.hopeless", { a: 1 })).resolves.toBe(false)
    off()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]?.reason).toBe("quota")
  })
})
