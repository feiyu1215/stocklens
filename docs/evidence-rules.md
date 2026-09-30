# Evidence Rules（evidence_rules_v1）

> Evidence Engine 的规则登记簿。所有规则为**确定性纯函数**，无 LLM / 无网络 / 无 DB。
> 规则版本号随 Bundle 输出（`rulesVersion`），用于追溯任一次诊断使用的规则版本。

## Evidence Type

| Type | 含义 | confidence | verifyStatus | 约束 |
|---|---|---|---|---|
| `fact` | 真实金融数据直接支持（来自 MetricResult） | high | verified | metricIds ≥ 1；basedOn 恒为空 |
| `inference` | 确定性规则组合多个 FACT 得出的关系 | medium（关系成立，业务含义待解释） | verified | basedOn ≥ 2 且全部引用必须可解析；必须携带 ruleId |
| `unknown` | 数据能力目前不存在 / 无法验证（正式研究结果，非异常） | low | unverified | 必须有 unavailableReason 或明确 statement |

## Evidence Signal（证据自身方向，≠ 股票评级）

`positive` / `negative` / `conflict` / `neutral` / `unknown`。

例：20 日收益率 −8.45% → `negative` 仅表示"20 日价格变化为负"，不表示股票好坏。
绝对水平类指标（毛利率、ROE、PE/PB、波动率、最大回撤）无 benchmark → 一律 `neutral`。

## FACT 目录

一个 available Metric 对应一个 FACT（`EV_FACT_<metricId>`），statement 由代码模板生成、
数字只来自 `MetricResult.value`。口径显式：累计同比 / 单季同比 / 百分点 / 倍数。
unavailable 指标不生成 FACT（进 UNKNOWN 聚合）。

Signal 映射：增长类（收入/归母净利润/经营现金流 YoY，YTD 与单季）与盈利能力变化类
按方向（>0 positive / <0 negative / =0 neutral）；CFO 倍数、当期毛利率/净利率/ROE、
PE/PB、波动率、最大回撤恒为 neutral。

## INFERENCE Rule Catalog

| Rule ID | 输入 Metric | 触发条件 | Type / Signal | 业务含义与限制 |
|---|---|---|---|---|
| `RULE_FIN_PROFIT_CASHFLOW_DIVERGENCE` | FIN_NET_PROFIT_YOY_YTD, FIN_OCF_YOY_YTD | NP_YoY_YTD > 0 **AND** OCF_YoY_YTD < 0（两个条件必须同时成立） | inference / conflict | 利润增长与经营现金流走势背离。**注意**：OCF 同比为正（哪怕 +0.73%）时绝不触发；=0 也不触发。防止"利润增、现金流没跟上"被误报 |
| `RULE_FIN_REVENUE_PROFIT_DIVERGENCE` | FIN_REVENUE_YOY_YTD, FIN_NET_PROFIT_YOY_YTD | REV_YoY_YTD > 0 AND NP_YoY_YTD < 0 | inference / conflict | 收入增长但利润下降 |
| `RULE_FIN_GROWTH_MARGIN_DIVERGENCE` | FIN_REVENUE_YOY_YTD, FIN_GROSS_MARGIN_CHANGE_YOY | REV_YoY_YTD > 0 AND GM_Change < 0 | inference / conflict | 收入增长但毛利率下降（以量换价类矛盾的确定性信号） |
| `RULE_FIN_PROFIT_GROWTH_LAGS_REVENUE` | FIN_REVENUE_YOY_YTD, FIN_NET_PROFIT_YOY_YTD | REV > 0 AND NP > 0 AND (REV − NP) ≥ **1.0 pct** | inference / **neutral** | 利润增速低于收入增速——描述性关系，不是风险结论。阈值 `PROFIT_REVENUE_GROWTH_GAP_PCT = 1.0` 集中配置于 `EVIDENCE_THRESHOLDS`，用于避免极小数值差异触发无意义 Evidence |
| `RULE_MKT_HORIZON_DIVERGENCE` | MKT_RETURN_20D, MKT_RETURN_120D | (20D < 0 AND 120D > 0) OR (20D > 0 AND 120D < 0) | inference / conflict | 不同时间尺度的行情方向背离 |
| `RULE_FIN_QUARTER_YTD_GROWTH_DIVERGENCE` | FIN_REVENUE_YOY_YTD, FIN_REVENUE_YOY_QUARTER | 两者符号相反（一方为 0 不触发；同号数值不同不触发） | inference / conflict | 单季收入增长方向与累计表现不同 |
| `RULE_FIN_QUARTER_YTD_PROFIT_DIVERGENCE` | FIN_NET_PROFIT_YOY_YTD, FIN_NET_PROFIT_YOY_QUARTER | 同上（利润） | inference / conflict | 单季利润增长方向与累计表现不同 |
| `RULE_TREND_REVENUE_QUARTER_DIRECTION_RUN` | 单季收入同比序列（近 3 个可比期） | 3 个可比单季同比全部 >0 或全部 <0 | inference / **neutral** | 单季收入同比连续同向（描述性，非预测）；basedOn 锚定季度同比 + 累计同比 FACT |
| `RULE_TREND_REVENUE_QUARTER_REVERSAL` | 单季收入同比序列（近 2 个可比期） | 上期与本期符号相反 | inference / conflict | 最新单季收入同比方向反转（由正转负 / 由负转正） |

Task 08 新增 FACT（一句话模板，数字只来自 MetricResult.value）：沪深300 区间收益 3 条、
相对沪深300 3 条（"较沪深300高/低 X 个百分点"）、行业指数收益 3 条、相对行业 3 条、
PE/PB 相对行业中位数 2 条（"较所属行业中位数高/低 X 倍"，neutral）。
行业 UNKNOWN 拆分：行业未知 → `EV_UNKNOWN_INDUSTRY_COMPARISON`；
行业已知但行情缺失 → `EV_UNKNOWN_INDUSTRY_PRICES`；
恒定 → `EV_UNKNOWN_INDUSTRY_PEER_FINANCIALS`；行业估值缺失 → `EV_UNKNOWN_INDUSTRY_VALUATION`。

### 明确不做的 Market 规则

不定义"波动率 > X% → 高风险"、"回撤 > Y% → 危险"之类规则：当前没有同行基准、
股票自身历史分布、用户风险偏好，这些规则没有可靠基线。

## UNKNOWN 目录

| Evidence ID | 生成条件 | 说明 |
|---|---|---|
| `EV_UNKNOWN_VAL_HISTORICAL_PERCENTILE` | 恒定生成 | 只有估值快照、无历史估值序列 → 不能判断估值历史位置。证明系统不会因为当前 PE 就说"便宜" |
| `EV_UNKNOWN_INDUSTRY_COMPARISON` | industry = null 或未接入行业数据 | 不能判断公司在行业中的位置 |
| `EV_UNKNOWN_FIN_STATEMENTS` | 财务组 7 指标任一 unavailable | 财务报表数据不足（聚合） |
| `EV_UNKNOWN_FIN_MARGIN_CURRENT` | 当期盈利 3 指标任一 unavailable | 当期盈利能力指标信息不足（聚合） |
| `EV_UNKNOWN_FIN_MARGIN_HISTORY` | 变化类 3 指标任一 unavailable | 历史盈利能力对比信息不足（聚合） |
| `EV_UNKNOWN_VAL_SNAPSHOT` | 估值 2 指标任一 unavailable | 估值快照信息不足（聚合） |
| `EV_UNKNOWN_MARKET_PRICE_HISTORY` | 行情 6 指标任一 unavailable | 行情历史数据不足（聚合） |

UNKNOWN 与 ERROR 的区分：UNKNOWN = 数据能力不存在（正常研究结果）；
ERROR = 本应取得但本次调用失败（由 API 层 `errors[]` 透传，不混入 UNKNOWN）。

## Validator

输出前强制校验：类型约束（见上表）、evidenceId 唯一、INFERENCE 引用完整性
（broken reference → 校验失败并抛错，绝不悄悄删除引用）。

---

## Task 10 新增：解释护栏与事件证据

**同比解释护栏**（`src/lib/metrics/interpretation.ts`，阈值集中配置）：
`low_base`（上年同期绝对值 < 自身历史单季绝对值中位数 × 10%，样本 ≥4 才判定）、
`sign_flip_base`（正负切换）、`extreme_change`（|YoY| ≥ 500%）。
护栏只产出 flags + 模板化 note，**绝不修改 Metric.value**；Evidence 原样传播
（`interpretationFlags` / `interpretationNote`），AI 必须保留该限制。
signal 不因极端百分比自动变强（仍只有 positive/negative/conflict/neutral/unknown）。

**事件证据**（dimension = `risk`，全部 signal = neutral）：

| evidenceId 模式 | 来源 | 说明 |
|---|---|---|
| `EV_FACT_RISK_EVT_ANOMALY_*` | anomaly-analysis-stock | 异动记录：忠实转述接口 tag 与解读文本，不添加因果 |
| `EV_FACT_RISK_EVT_ATTENTION_*` | hot-stock-rank-trend | 热榜排名变化（rank 越小越靠前；上升 ≠ 利好） |
| `EV_FACT_RISK_EVT_CORP_ACTION_*` | corporate-actions/adjustment-factors | 分红/送股（不因分红标 positive） |
| `EV_UNKNOWN_RISK_ANOMALY_COVERAGE` | anomaly 接口成功但无记录 | 明确"不能据此确认不存在其他事件" |
| `EV_UNKNOWN_RISK_ANOMALY_UNAVAILABLE` | anomaly 接口失败 | 与"无记录"区分 |
| `EV_UNKNOWN_RISK_ATTENTION_COVERAGE` | 热榜窗口内无点位 | 不解释为"完全无人关注" |
| `EV_UNKNOWN_RISK_NEWS_DISCLOSURE` | 恒定 | 公告/新闻文本未接入——事件覆盖不是全量 |
