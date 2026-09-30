# StockLens

AI Native 个股多维诊断与证据验证工具（作业项目，题目 03）。

**Evidence First, Conclusion Second** —— 先有证据，再有结论。产品目标、三层架构、
Evidence 模型与开发阶段见 [`PRD.md`](./PRD.md)。

## 当前状态

Task 01–04 已完成：Data Layer + Metric Engine + Evidence Engine + **AI 诊断主链路**。

```text
Question → Compliance Pre-check → AI Planner → Truth Layer → Evidence Selection
        → AI Synthesizer → Diagnosis Validation → DiagnosisResponse
```

- `POST /api/diagnosis`（stockCode + question）→ 诊断 JSON：Planner 维度、Grounded Summary、
  分层证据（fact/inference/unknown）、后续研究问题、AI Trace；
- AI 层（DeepSeek）只组织与解释证据：不产生事实、不算数字、不评级、不建议买卖；
  所有输出必须通过确定性 Validation（Evidence 绑定 + 分区类型 + 合规扫描）；
- AI 失败不污染 Truth Layer：证据照常返回，synthesis = null；
- 架构与已知边界：[`docs/ai-architecture.md`](./docs/ai-architecture.md)。

**尚未开发**：正式诊断 UI、Evidence Drawer、Follow-up 交互。当前页面仅为脚手架占位。

调试入口：

- `POST /api/diagnosis` —— 完整诊断链路（需 DEEPSEEK_API_KEY）
- `GET /api/debug/stock-data?stockCode=000333.SZ` —— 数据层
- `GET /api/debug/metrics?stockCode=000333.SZ` —— 指标层
- `GET /api/debug/evidence?stockCode=000333.SZ` —— 证据层（无 LLM）

## 启动

```bash
npm install
cp .env.example .env.local   # 填入 FUYAO_API_KEY（fuyao.aicubes.cn/admin 签发）
npm run dev                  # http://localhost:3000
```

数据验证入口：`GET /api/debug/stock-data?stockCode=000333.SZ`

## 命令

```bash
npm run dev     # 开发服务器
npm run build   # 生产构建
npm run start   # 生产运行
npm run lint    # ESLint
npm run test    # Vitest
```

## 结构（当前）

```text
src/lib/data/          # 扶摇 Data Adapter（types / fuyao / normalize / stock-data）
src/lib/metrics/       # 确定性 Metric Engine（types / financial / market / valuation / engine）
src/lib/evidence/      # Evidence Engine（types / fact-builder / rules / inference-builder / unknown-builder / validate / engine）
src/lib/ai/            # AI 层（model / planner / synthesizer / select-evidence / prompts）
src/lib/validation/    # diagnosis / compliance（确定性校验与合规守卫）
src/lib/diagnosis/     # Diagnosis Orchestrator
src/app/api/           # debug 数据/指标/证据 + POST /api/diagnosis
docs/                  # metric-catalog / evidence-rules / ai-architecture（口径、规则与 AI 边界登记簿）
tests/                 # Vitest：归一化、指标公式、证据规则、null 语义、缺失 Key、部分失败
```

## 规则

- API Key 只来自环境变量，`.env.local` 不入库；
- 不伪造任何金融数据：缺失用 `null`/字段缺省表达，与真实 `0` 严格区分；
- 外部接口失败显式报错（`availability` + `errors`），禁止静默兜底；
- 不输出涨跌预测、收益承诺或买卖建议。
