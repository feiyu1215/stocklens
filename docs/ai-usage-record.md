# AI 使用与验证记录

> 记录本项目使用了哪些 AI 工具、AI 参与哪些环节、候选人修正了哪些错误或不合理结果。
> 关键数字均可通过 `scripts/production-smoke-results.json`、`docs/` 各登记簿与 git 历史追溯。

## 1. 使用的 AI 工具

| 工具 | 用途 |
|---|---|
| **ZCode（GLM）** | 全程结对开发代理：按 Spec-driven 流程执行 Task 00–07（代码实现、测试、调试、部署脚本） |
| **DeepSeek（deepseek-chat）** | 产品运行期 AI：Planner（维度规划）、Diagnosis Synthesizer（证据综合）、Followup（沿证据追问）。temperature 0 / 0.2 / 0.2，timeout 20s |
| **外部 Spec AI** | 生成 PRD v1.0 与各 Task 的 Spec/Acceptance Criteria，并 Review 每轮 Completion Report（含对本项目实现的两处关键纠正，见 §3） |

## 2. AI 参与的环节与防幻觉机制

| 环节 | AI 做什么 | AI 不做什么 | 防幻觉机制 |
|---|---|---|---|
| 维度规划（planner_v1） | 从问题推断研究维度 | 看不到任何数据；reason 禁数字与评价 | Schema 校验（枚举/去重/≤4/reason 无数字） |
| 证据综合（diagnosis_synthesis_v1） | 组织、解释已选证据；提出后续问题 | 不产生事实、不算数字、不评级、不建议买卖 | Evidence Binding（伪造 ID 整体拒绝）+ 分区类型校验 + 合规扫描 + repair 一次 |
| 沿证据追问（followup_v1） | 针对选中证据回答继续研究问题 | 同上 | 同上；焦点 ID 先对证据集过滤 |
| **不使用 AI 的部分** | 指标计算、证据规则、信号判定、排序、格式化 | — | 全部为确定性代码（Truth Layer 原则） |

数字与类型的权威永远在 Truth Layer：Metric Engine 输出 MetricResult（含 sourceFields/
calculationMethod），Evidence Engine 模板化生成 statement（数字只取 MetricResult.value），
AI 只做组织与解释，UI 只做格式化与钻取。

## 3. 候选人（借助 Review/验证）修正的 AI 错误与不合理结果

1. **「利润与现金流背离」预设结论错误（被 Spec Review 纠正）**：
   Task 02 报告曾以"净利润增长 vs 现金流下降"作为演示建议，但真实数据 OCF 同比为
   **+0.73%（正数）**，规则条件不成立。修正：RULE_FIN_PROFIT_CASHFLOW_DIVERGENCE
   严格要求 OCF < 0 才触发，并增加"OCF 为正不触发"防回归测试（tests/evidence/rules.test.ts）。
   Demo 主线改为真实触发的「收入增长但毛利率下降」（Task 04 §0 同步修正 PRD 示例）。
2. **LLM 伪造 Evidence ID（生产实测拦截）**：
   Task 05 Live Q3 首跑，DeepSeek 在 unknowns 分区编造 `EV_UNKNOWN_INDUSTRY_DIMENSION`、
   `EV_UNKNOWN_RISK_DIMENSION` 两个不存在的 ID 并混入 fact——Diagnosis Validator
   按设计整体拒绝，UI 正确降级（证据保留）。修正：Synthesizer Prompt 增加
   "绝不发明 evidenceId、无 unknown 证据时返回空数组"禁令，重跑成功。
   完整记录见 `scripts/live-smoke-results.json`。
3. **Featured Evidence 排序缺陷（UI 实测发现）**：
   首版实现按"synthesis 引用顺序"排首屏，导致 6 张事实卡把矛盾推断挤出首屏，
   与 PRD §22 预期（矛盾/待验证应易见）不符。修正为"重要性层级优先、同层级内
   被引用者优先"（tests/presentation/featured-evidence.test.ts 固化）。
4. **浮点与断言错误（开发期）**：累计同比 120/100−1 浮点误差、reduce/filter 类型
   收窄、深色模式无背景色等，均在 lint/test/build 与浏览器实测中发现并修正
   （git 历史可追溯）。
5. **自算指标与官方指标交叉验证（双轨制）**：Metric Engine 自算营收累计同比
   3.5516% 与扶摇官方 `calculate_operating_income_yoy_growth_ratio`（3.55154700）、
   净利润同比 1.662%（官方 1.66199800）一致至小数点后四位——双轨验证通过。

## 4. 验证记录摘要

- 198 个自动化测试全过（公式、null 语义、证据规则、AI 校验、合规、部分失败）；
- Live smoke（Task 04）：Q1/Q2/Q3/Q4 真实 DeepSeek 全部符合预期（无虚假现金流冲突、
  无估值评价、无走势预测、合规拦截 3ms 零调用）；
- Production smoke（Task 07，公网隧道）：P0 首页 + P1–P3 诊断 + P4 合规 + P5 追问，
  6/6 PASS（`scripts/production-smoke-results.json`）；
- 每次诊断的 Planner/Synthesizer Trace（promptVersion/model/latency/retries/validationIssues）
  随响应返回，未记录任何密钥。

## 5. Task 08（Deepening）修正记录

1. **输出截断导致 JSON 解析失败**：证据集从 26 条增至 40 条后，Synthesizer 的
   max_tokens=1500 会把 JSON 截断（Q1 live 出现两次 invalid-json → 正确降级 partial_failure）。
   修正：max_tokens 提升至 3000（Followup 1800），未改动 prompt 或契约，重跑 4/4 通过。
2. **测试桩路由过宽**：`prices/historical` 匹配同时命中指数端点，导致 mock 环境中 CSI300 /
   行业指数拿到个股价格序列。修正：指数路由前置判断（`/a-share-index/prices/historical`）。
3. **能力组 UNKNOWN 语义**：指标完全不存在（该能力域本轮未参与）不应报"数据不足"。
   修正：聚合 UNKNOWN 增加「该域指标至少存在一个」守卫。
4. **极端同比的解释风险（Task 10 护栏的来源）**：Task 08 财务趋势真实出现
   2025-Q4 OCF YoY = −1600.72%（数学正确，但上年同期基数极小）。在加入解释护栏前，
   这类数字直接进入 LLM 上下文存在被表述为"现金流极端恶化"的风险。
   修正：新增 scale-aware 解释护栏（低基数/正负切换/极端变化），原始数值保留、
   Evidence 与 AI 输入携带限制说明；Prompt 增加一条约束。真实前后对比见 §5。
5. **低基数护栏真实前后对比（Task 10 §52，真实数据非虚构）**：
   真实数据：2025-Q4 单季 OCF 同比 = −1600.72%（上年同期绝对金额 2.48 亿元，
   远低于该字段历史单季中位数）。**加护栏前**：该极端百分比无任何解释限制，
   直接进入上下文/趋势展示，存在被表述为"现金流极端恶化"的风险。
   **加护栏后**：该点携带 `[sign_flip_base, low_base, extreme_change]` 与模板化说明
   （"上年同期基数相对历史季度较低，百分比变化可能被低基数放大，建议结合绝对金额观察"），
   并附上年同期绝对金额；Synthesizer/Followup Prompt 明令不得仅凭极端同比推断同等幅度经营恶化。
   实测：Q3 经营诊断（ai=success）中模型未对该数字做夸大表述。
6. **无证据归因边界（Task 10 实测）**：线上/本地问「为什么最近跌了？」，AI 回答
   "……公司层面的估值历史位置、异动事件与公告新闻文本覆盖均存在无法验证的边界，
   因此不能完整归因近期下跌"——未出现资金出逃/预期下调等无证据归因。
7. **行业归属不做常识猜测**：通过官方成分股接口扫描 90 个一级行业指数（0 错误、唯一命中）
   后才写入 verified mapping，并保留 source/verifiedAt/verificationMethod 溯源字段。
