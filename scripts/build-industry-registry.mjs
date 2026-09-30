// Industry Registry Generator（Task 12 §8–§10）
//
// 流程：THS 一级行业目录 → 各行业成分股 → stock → primary industry
// 输出：src/lib/data/industry-registry.json（运行期 O(1) 查表）
// 完整性：重复主行业映射 / 非法行业代码 / 成分股代码异常 显式记录，不 silent overwrite。
//
// 用法：node scripts/build-industry-registry.mjs   （需要 FUYAO_API_KEY 环境变量或 .env.local）

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

const BASE = "https://fuyao.aicubes.cn"
const CONCURRENCY = 4

function readApiKey() {
  if (process.env.FUYAO_API_KEY) return process.env.FUYAO_API_KEY
  const envPath = resolve(ROOT, ".env.local")
  const raw = readFileSync(envPath, "utf-8")
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("FUYAO_API_KEY="))
  if (!line) throw new Error("FUYAO_API_KEY missing in .env.local")
  return line.slice("FUYAO_API_KEY=".length).trim()
}

const API_KEY = readApiKey()

async function get(path, params) {
  const url = new URL(path, BASE)
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { "X-api-key": API_KEY } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`)
  const body = await res.json()
  if (body.code !== 0) throw new Error(`code=${body.code} ${body.message} (${path})`)
  return body.data
}

async function mapWithConcurrency(items, limit, fn) {
  const results = []
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function main() {
  console.log("1/3 fetching THS level-1 industry catalog …")
  const catalog = await get("/api/a-share-index/catalog/ths-index-list", { tag: "industry", limit: "200" })
  const level1 = catalog.item.filter((i) => i.thscode.startsWith("881"))
  console.log(`    level-1 industries: ${level1.length}`)

  console.log("2/3 fetching constituents …")
  const perIndustry = await mapWithConcurrency(level1, CONCURRENCY, async (industry) => {
    const data = await get("/api/a-share-index/constituents/ths-stock-list", {
      thscode: industry.thscode,
      limit: "500",
    })
    const items = data.item ?? []
    if (items.length >= 500) {
      console.warn(`    WARN: ${industry.thscode} ${industry.name} hit the 500-row cap; results may be truncated`)
    }
    return { industry, items }
  })

  console.log("3/3 building registry with integrity checks …")
  const verifiedAt = new Date().toISOString().slice(0, 10)
  const byStock = new Map()
  const conflicts = []
  const invalidCodes = []
  const industries = []

  for (const { industry, items } of perIndustry) {
    if (!/^881\d{3}\.TI$/.test(industry.thscode)) {
      invalidCodes.push({ industryIndexCode: industry.thscode, name: industry.name, reason: "not a level-1 code" })
      continue
    }
    industries.push({ industryIndexCode: industry.thscode, industryName: industry.name, memberCount: items.length })
    for (const item of items) {
      const stockCode = String(item.thscode ?? "").toUpperCase()
      if (!/^\d{6}\.(SZ|SH|BJ)$/.test(stockCode)) {
        invalidCodes.push({ stockCode, industryIndexCode: industry.thscode, reason: "invalid stock code" })
        continue
      }
      const existing = byStock.get(stockCode)
      if (existing && existing.industryIndexCode !== industry.thscode) {
        // 显式记录冲突（不静默覆盖）：保留首个映射，冲突进入冲突清单供人工复核
        conflicts.push({
          stockCode,
          kept: existing.industryIndexCode,
          alsoListedIn: industry.thscode,
          alsoListedInName: industry.name,
        })
        continue
      }
      if (!existing) {
        byStock.set(stockCode, {
          stockCode,
          industryIndexCode: industry.thscode,
          industryName: industry.name,
          source: "fuyao",
          verifiedAt,
        })
      }
    }
  }

  const entries = [...byStock.values()].sort((a, b) => a.stockCode.localeCompare(b.stockCode))
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "fuyao",
    method:
      "ths-index-list(tag=industry) level-1 (881xxx) constituents scan; first-seen mapping wins; conflicts recorded",
    stats: {
      industries: industries.length,
      stocks: entries.length,
      conflicts: conflicts.length,
      invalidCodes: invalidCodes.length,
    },
    industries,
    conflicts,
    invalidCodes,
    entries,
  }

  mkdirSync(resolve(ROOT, "src/lib/data"), { recursive: true })
  const outPath = resolve(ROOT, "src/lib/data/industry-registry.json")
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf-8")
  console.log(`    wrote ${outPath}`)
  console.log(
    `    industries=${payload.stats.industries} stocks=${payload.stats.stocks} conflicts=${payload.stats.conflicts} invalid=${payload.stats.invalidCodes}`,
  )
  if (conflicts.length > 0) {
    console.log("    sample conflicts:", JSON.stringify(conflicts.slice(0, 5)))
  }
}

main().catch((err) => {
  console.error("registry build failed:", err)
  process.exit(1)
})
