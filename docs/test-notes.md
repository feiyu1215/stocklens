# 测试说明（Test Notes）

> 覆盖：主链路、数据/接口异常、合规边界、AI 校验、部署验收。
> 执行方式：`npm run test`（Vitest，198 个，离线 mock，不依赖外网模型）；
> 线上验收：`python scripts/production_smoke.py`（走公网 URL 的 5 条真实路径）。

## 1. 软件测试（Truth Layer）

| 编号 | 场景 | 预期 | 测试位置 |
|---|---|---|---|
| S01 | 正确股票（000333.SZ）四类数据 | 四域 availability 全 true，真实数据 | tests/stock-data.test.ts、tests/ai/orchestrator.test.ts |
| S02 | 不存在代码 999999.SZ | 四域各自上报上游错误（1002/3001/NOT_FOUND），零伪造数据 | tests/fuyao.test.ts、live（Task 01） |
| S03 | 缺失 FUYAO_API_KEY | HTTP 503 + FUYAO_CONFIG_MISSING，无 fallback 假数据 | tests/fuyao.test.ts、live（Task 01 Case C） |
| S04 | 外部接口 HTTP 500 / 网络超时 / 信封 code≠0 | 显式抛错并进入 errors[]，绝不吞掉 | tests/fuyao.test.ts |
| S05 | 部分失败（估值域失败） | 其余三域正常，errors 精确 1 条 | tests/stock-data.test.ts、tests/metrics/engine.test.ts |
| S06 | null 传播 vs 真实 0 | 缺失=null/unavailable；真实 0 原样保留 | tests/metrics/financial.test.ts |
| S07 | YoY 零分母 / 数据不足 | unavailable + 原因（非 Infinity，不降窗口口径） | tests/metrics/*.test.ts |
| S08 | 单季差分（Q2=70、Q4=150、单季 YoY 16.667%） | 公式正确、累计/单季口径分离 | tests/metrics/financial.test.ts |
| S09 | 百分点变化（25→23 = −2 pct） | 单位 pct，不是百分比增速 | tests/metrics/financial.test.ts |
| S10 | 波动率/最大回撤确定序列 | sample std ×√252 = 22.4499%；[100,120,90,110] → −25% | tests/metrics/market.test.ts |

## 2. 证据引擎测试

| 编号 | 场景 | 预期 | 测试位置 |
|---|---|---|---|
| E01 | 证据信号方向（+3 积极 / −3 承压 / PE 中性） | 模板化 statement + 正确 signal | tests/evidence/fact-builder.test.ts |
| E02 | 利润/现金流背离规则 | 仅 NP>0 且 OCF<0 触发；**OCF 为正不触发（防回归）** | tests/evidence/rules.test.ts |
| E03 | 收入/毛利率背离、行情期限背离、增速差阈值 1.0pct | 满足触发 / 不满足不触发 | tests/evidence/rules.test.ts |
| E04 | UNKNOWN（历史估值/行业） | 恒定生成、按能力组聚合 | tests/evidence/engine.test.ts |
| E05 | 断链引用 | Validator 失败并抛错，不静默删引用 | tests/evidence/engine.test.ts |
| E06 | 确定性 | 同输入两次运行输出一致 | tests/evidence/engine.test.ts |

## 3. AI 层测试（全部 mock LLM，CI 不依赖外网）

| 编号 | 场景 | 预期 | 测试位置 |
|---|---|---|---|
| A01 | Planner 校验（枚举/去重/≤4/reason 无数字无评价） | 违规拒绝；repair 1 次；再失败 AI failure | tests/ai/planner.test.ts |
| A02 | 合规 Pre-check（中文/英文/注入句） | 拦截并重定向；良性问题放行 | tests/ai/compliance.test.ts |
| A03 | 合规 Post-check（建议/预测/评级/低估高估断言；否定语境豁免） | 禁词 FAIL；「不能判断是否低估」放行 | tests/ai/compliance.test.ts |
| A04 | 伪造 Evidence ID（EV_FAKE_001） | 整体 FAIL，不静默删除 | tests/ai/diagnosis-validation.test.ts |
| A05 | 分区类型（confirmed 引 inference 等） | FAIL | tests/ai/diagnosis-validation.test.ts |
| A06 | Missing grounding（summary 空绑定） | FAIL | tests/ai/diagnosis-validation.test.ts |
| A07 | 非法 JSON → repair → 仍失败 | AI failure，Truth Layer 证据保留 | tests/ai/planner.test.ts、orchestrator.test.ts |
| A08 | 模型超时 | partial_failure/failed，Metric/Evidence 不受影响 | tests/ai/orchestrator.test.ts |
| A09 | Synthesizer 输入不含原始数据/密钥 | spy 断言无 operating_income/X-api-key/sk- | tests/ai/orchestrator.test.ts |
| A10 | Followup 五 case | 正常/grounding/伪造 ID/AI 失败/建议拦截 | tests/ai/followup.test.ts |

## 4. Presentation 测试

| 编号 | 场景 | 测试位置 |
|---|---|---|
| P01 | Featured 选择：层级优先 + 引用同级优先 + 去重 + ≤6 + synthesis 缺失 fallback | tests/presentation/featured-evidence.test.ts |
| P02 | 格式化（+9.83% / −0.36 pct / 1.42x / 期次） | tests/presentation/presentation.test.ts |
| P03 | 维度分组计数与关键证据；空维度=信息不足 | tests/presentation/presentation.test.ts |

## 5. Production Smoke（公网 URL 实测）

执行：`python scripts/production_smoke.py`（结果：`scripts/production-smoke-results.json`）

| 路径 | 结果 |
|---|---|
| P0 首页可达 | PASS |
| P1 诊断「公司现在经营情况怎么样？」 | PASS（ai=success，25 条证据，2 conflict） |
| P2 诊断「当前估值怎么样？」 | PASS（含历史估值 UNKNOWN） |
| P3 诊断「最近走势怎么样？」 | PASS（含行情期限背离） |
| P4 「现在能买吗？」 | PASS（compliance_redirect，683ms，零 LLM） |
| P5 沿 conflict 证据追问 | PASS（分层回答 + 引用全部可解析） |

## 6. 人工验收记录（浏览器实测，2026-09-30）

- 首页 → 输入 → 诊断 → 结果页全链路（截图 docs/screenshots/00-home.png、01-q1-overall.png）；
- Drawer：类型/信号/置信度徽章、依据事实、关联指标（值/期次/计算口径/技术口径折叠）8/8 检查（02-evidence-drawer-inference.png）；
- 合规重定向 UI（03-compliance-redirect.png）；
- AI 失败降级：synthesis=null 时证据照常展示 +「AI 解释暂不可用」提示（Live 实录）；
- 追问闭环：Drawer 内输入问题 → 分层回答 + 证据锚点（04-followup.png）。

## 已知测试边界

- 语义事实一致性（模型绑定合法 ID 但文字与证据矛盾）无自动校验——以 Eval Bad Case 固化为已知局限（tests/ai/diagnosis-validation.test.ts 末组）；
- CI 不依赖外网模型：LLM 行为以 mock 脚本测试 + Live smoke 人工记录双重覆盖；
- 隧道/部署 URL 存活依赖进程，测试脚本可在任意可访问实例上重跑。
