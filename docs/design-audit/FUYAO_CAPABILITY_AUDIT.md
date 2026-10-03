# 扶摇能力全景审计（2026-10-03，用户要求"扶摇能提供的我们都提供"）

> 方法：官方文档 https://fuyao.aicubes.cn/docs/ + `llms-full.txt` 全量目录，逐个端点用生产 key 实测（curl，直连）。
> 结论先行：在用 11 个端点之外，**4 个高价值端点实测可调通未接入**；3 个端点实测确认外部不可调（同花顺 AI 客户端专用，code 2004）；历史估值序列、港股/美股为数据源硬边界。

## 一、已接入（11 个，产品在用）

| 端点 | 用途 |
|---|---|
| `/api/meta/tickers/search` | 标的检索（仅保留 asset_type=a-share） |
| `/api/a-share/financials/indicators` | 官方财务指标 |
| `/api/a-share/financials/income-statements` | 利润表 |
| `/api/a-share/financials/cash-flow-statements` | 现金流量表 |
| `/api/a-share/valuations/snapshot` | 估值快照（参数名为复数 `thscode**s**`） |
| `/api/a-share/prices/historical` | 个股历史 K 线 |
| `/api/a-share/corporate-actions/adjustment-factors` | 复权因子 |
| `/api/a-share/special-data/anomaly-analysis-stock` | 个股异动原因 |
| `/api/a-share/special-data/hot-stock-rank-trend` | 热榜趋势（参数 `start_date` 必填） |
| `/api/a-share-index/prices/historical` | 行业指数行情 |
| `/api/a-share-index/constituents/ths-stock-list` | 行业成分股 |

## 二、实测可调通、未接入（接入候选，按价值排序）

| 优先级 | 端点 | 实测证据 | 产品价值 |
|---|---|---|---|
| **P1** | `GET /api/a-share/financials/balance-sheets`（`thscode`/`period`/`limit`≤20） | ✅ 000333.SZ quarterly 返回真实数据 | **补全三大报表最后一块**：assets_total / cash / accounts_receivable / total_debt / holder_equity_total → 支撑偿债能力、资产质量、应收占比等新维度证据 |
| **P2** | `GET /api/a-share/calendar/trading-days`（无参数，近一年） | ✅ 返回 20251009 起的交易日序列 | freshness 锚定用真实交易日而非推算；龙虎榜等日期参数的合法值来源 |
| **P3** | `GET /api/a-share/special-data/limit-up-pool` / `limit-down-pool` / `limit-break-pool` / `limit-up-ladder`（近 30 交易日） | ✅ 可调（10-03 假日 total=0 属正常） | 涨停/跌停/炸板/连板梯队 → 市场情绪与资金关注度类证据 |
| **P3** | `GET /api/a-share/special-data/dragon-tiger-list`（`board_type`=all/org/hot_money，`date` 必须为交易日） | ✅ 2026-09-30：79 榜 / 66 股，含机构与游资买卖明细、limit_reason | 龙虎榜是"资金关注度"问题的硬证据；日期参数依赖 P2 |

## 三、实测确认外部不可调（同花顺 AI 客户端专用，code 2004）

- `/api/a-share/capital-flow/snapshot`、`/historical`（主力资金）
- `/api/news/events/search`（资讯）→ **README/需求矩阵中"新闻未接入"的边界由"文档说"升级为"实测确认"**
- `/api/a-share/high-frequency/*`（高频动向）

## 四、数据源硬边界（实测确认不存在）

- **历史估值序列**：llms-full.txt 无此端点，只有 snapshot → followup 中"缺少历史估值序列，无法判断历史高低位"的 UNKNOWN 是数据源级诚实边界，无法通过接入消除
- **港股/美股**：裸调检索 `00700`/`AAPL` 直接空；"小米/腾讯/苹果"仅以**概念指数**（885785.TI 小米概念等）与**期货**（AP00.CZC 苹果期货）形式存在——"什么股票都能查"需接第二数据源，属产品二期（见 DOMESTIC_DEPLOY_PLAN 同级讨论）
- 融资融券：文档未提及；stock-basics：标注"敬请期待"
- market-dumps（Parquet 全市场导出）/ funds / 期货 / 期权：超出个股诊断产品范围

## 五、对"诊断答案做精细"的影响路径

证据丰富度决定答案天花板：P1 补齐资产负债表后，规划器可出现偿债/资产质量维度（应收占比、现金覆盖、杠杆水平都是模型可引用的硬证据）；P3 补上龙虎榜/涨停池后，"资金关注度/市场情绪"类追问从 UNKNOWN 变为有据可答。展示层打磨（分层回答的呈现精细化）在数据层落地后进行，避免在贫瘠证据上打磨包装。
