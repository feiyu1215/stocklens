# StockLens 指标目录（Metric Catalog）

> 版本：v1（Task 02）。指标目录是 Truth Layer 的口径登记簿：每个指标的公式、单位、
> 数据来源、报告期语义与边界规则。`src/lib/data/normalize.ts` 的 `FIELD_CATALOG`
> 登记「内部字段 ← 扶摇原始字段」映射；本文档登记「MetricResult ← 内部字段」的
> 计算口径。两份合起来构成关键数字的完整追溯链。

## 全局口径规则

1. **累计 vs 单季严格分离**：扶摇 quarterly 报表为年初至今累计值（Q2 = 上半年累计）。
   累计口径指标使用 `_YTD` 后缀，单季口径使用 `_QUARTER` 后缀，禁止混用。
2. **单季值定义**：`standalone(Q1) = cum(Q1)`；`standalone(Qn) = cum(Qn) − cum(Qn−1)`。
   任一必需累计值缺失 → 该单季值 unavailable，不假设。
3. **单位规范**：`CNY`（金额）、`%`（百分比）、`pct`（百分点变化）、`x`（倍数/比率）。
   计算层保留原始浮点，不做舍入；展示层负责格式化。
4. **缺失语义**：`available` = 真实计算结果（含真实的 0 与负数）；`unavailable` = 因数据
   缺失/口径无意义而无法计算，必须带 `unavailableReason`。禁止 0 兜底、禁止 Infinity/NaN。
5. **无语义判断**：指标层不输出 positive/negative/score/rating——那属于 Evidence Engine。

## 财务指标（13 个，dimension: growth / cashflow / profitability）

数据来源：利润表 `operating_income` / `parent_holder_net_profit`（归母）、现金流量表
`act_cash_flow_net`（均为 CNY，累计口径）；官方指标接口 `sale_gross_margin` /
`sale_net_interest_ratio` / `index_weighted_avg_roe`（%，按报告期查询）。

| metricId | 公式 | 单位 | 说明 |
|---|---|---|---|
| `FIN_REVENUE_YOY_YTD` | (cum(t) / cum(t−1y) − 1) × 100 | % | 累计同比；上年同期累计缺失或为 0 → unavailable |
| `FIN_NET_PROFIT_YOY_YTD` | 同上（归母净利润） | % | 同上 |
| `FIN_OCF_YOY_YTD` | 同上（经营现金流净额） | % | 同上 |
| `FIN_REVENUE_YOY_QUARTER` | (standalone(t) / standalone(t−1y) − 1) × 100 | % | 单季同比；需两年各自的本期+上季累计 |
| `FIN_NET_PROFIT_YOY_QUARTER` | 同上 | % | 同上 |
| `FIN_OCF_YOY_QUARTER` | 同上 | % | 同上 |
| `FIN_CFO_TO_NET_PROFIT_YTD` | cum(OCF)(t) / cum(归母净利润)(t) | x | 同一累计期；**净利润 ≤ 0 时 unavailable**（明确规则：比值失去解释价值，有测试固定） |
| `FIN_GROSS_MARGIN` | 官方指标 sale_gross_margin | % | 事实指标，原样取用 |
| `FIN_NET_MARGIN` | 官方指标 sale_net_interest_ratio | % | 同上 |
| `FIN_ROE` | 官方指标 index_weighted_avg_roe | % | 加权平均 ROE |
| `FIN_GROSS_MARGIN_CHANGE_YOY` | margin(t) − margin(t−1y) | **pct** | 百分点差，不是百分比增速；任一期指标缺失 → unavailable |
| `FIN_NET_MARGIN_CHANGE_YOY` | 同上 | pct | 同上 |
| `FIN_ROE_CHANGE_YOY` | 同上 | pct | 同上 |

数据层注：官方指标按报告期查询，当前仅拉取**最新期 + 上年同期**两套（Task 02 §14 的
最小补充）；其余期次的 margins/roe 字段缺省（JSON 中不出现）。

## 估值指标（2 个，dimension: valuation）

数据来源：`valuations/snapshot`（`pe_ttm`、`pb_mrq`，单位 x）。事实指标，原样取用；
可为负（亏损公司），缺失 → unavailable。

| metricId | 原始字段 | 单位 | 说明 |
|---|---|---|---|
| `VAL_PE_TTM` | pe_ttm | x | TTM 市盈率 |
| `VAL_PB_MRQ` | pb_mrq | x | MRQ 市净率 |

**明确不做**：历史 PE 分位——当前无历史估值时间序列；禁止用价格历史代替 PE 历史、
用当前 PE 推算历史 PE 或 Mock 历史估值。响应 `warnings` 中永久注明此限制。

## 行情指标（6 个，dimension: market）

数据来源：Task 01 已取得的日线收盘价（前复权，date ASC）。**不重新请求接口**。

| metricId | 公式 | 单位 | 数据要求 |
|---|---|---|---|
| `MKT_RETURN_20D` | (latest close / close[20 个交易日前] − 1) × 100 | % | ≥ 21 个收盘价 |
| `MKT_RETURN_60D` | 同上 | % | ≥ 61 个 |
| `MKT_RETURN_120D` | 同上 | % | ≥ 121 个 |
| `MKT_VOLATILITY_20D` | std(ln(P_t/P_{t−1})) 最近 20 个收益 × sqrt(252) × 100 | % | ≥ 21 个收盘价 |
| `MKT_VOLATILITY_60D` | 同上（60 个收益） | % | ≥ 61 个 |
| `MKT_MAX_DRAWDOWN_120D` | min(price / running_peak − 1) × 100（最近 120 个交易日） | %（负数） | ≥ 120 个收盘价 |

**口径决定**：
- 波动率标准差约定为 **sample std（分母 n−1）**，全代码库唯一；已写入
  `calculationMethod` 并有确定数值测试（对称对数收益 → 22.4499%）。
- 收益率窗口严格 N+1 个收盘价；不足 → unavailable。禁止"有多少天算多少天"（口径漂移）。
- 最大回撤输出保持负百分数约定（单调上涨窗口输出 0，即真实零回撤）。

## 明确不做（Task 02 边界）

- 行业类指标（行业 PE / ROE / 排名 / 同行对比）：industry = null，留待 P1；
- 历史 PE/PB 分位（见上）；
- 任何语义标签（改善/承压/矛盾）、评分、评级。

## Debug API

`GET /api/debug/metrics?stockCode=000333.SZ` →
`{ stock, latestFinancialPeriod, latestPriceDate, metrics: MetricResult[21], summary, warnings }`。
错误语义与 `/api/debug/stock-data` 一致：400 非法代码格式；503 缺 API Key；
个股不存在等业务失败 → 200 + 全部指标 unavailable + 原因。
