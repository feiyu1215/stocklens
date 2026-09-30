// Verified Industry Mapping（Task 08 §6–7）
//
// 来源与验证过程（开发期一次性完成，非运行期猜测）：
//   1. GET /api/a-share-index/catalog/ths-index-list?tag=industry  → 320 个同花顺行业指数
//   2. 并发扫描全部 90 个一级（881xxx）指数的成分股接口
//      /api/a-share-index/constituents/ths-stock-list?thscode=<code>
//      → 90/90 成功、0 错误，唯一命中：000333.SZ ∈ 881131.TI（白色家电，44 只成分股）
//   3. 因此允许持久化此映射；禁止按常识补写任何未经验证的股票。
//
// 运行期不扫描行业列表（§6 原则）：P0 固定研究对象为 000333.SZ。

export interface VerifiedIndustryMapping {
  stockCode: string
  industryIndexCode: string
  industryName: string
  source: "fuyao"
  verifiedAt: string
  /** 验证方式说明（可追溯性的一部分） */
  verificationMethod: string
}

export const VERIFIED_INDUSTRY_MAPPINGS: VerifiedIndustryMapping[] = [
  {
    stockCode: "000333.SZ",
    industryIndexCode: "881131.TI",
    industryName: "白色家电",
    source: "fuyao",
    verifiedAt: "2026-09-30",
    verificationMethod:
      "ths-index-list(tag=industry) 90 个一级指数成分股全扫描，000333.SZ 唯一命中 881131.TI（44 只成分股）",
  },
]

export function getVerifiedIndustry(stockCode: string): VerifiedIndustryMapping | null {
  return (
    VERIFIED_INDUSTRY_MAPPINGS.find((m) => m.stockCode === stockCode.toUpperCase()) ?? null
  )
}
