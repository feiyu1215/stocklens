# StockLens

AI Native 个股多维诊断与证据验证工具（作业项目，题目 03）。

**Evidence First, Conclusion Second** —— 先有证据，再有结论。产品目标、三层架构、
Evidence 模型与开发阶段见 [`PRD.md`](./PRD.md)。

## 当前状态

Task 01（Data Layer）+ Task 02（Metric Engine）+ Task 03（Evidence Engine）已完成：

```text
Fuyao REST → Data Adapter → Normalized Data → Metric Engine → Evidence Engine
```

- 指标口径与公式：[`docs/metric-catalog.md`](./docs/metric-catalog.md)；
- 证据类型 / 信号语义 / 规则目录：[`docs/evidence-rules.md`](./docs/evidence-rules.md)；
- 21 个确定性指标 → FACT / INFERENCE / UNKNOWN 三类证据（`evidence_rules_v1`），
  每个 inference 可追溯到 ≥2 条 FACT，断链即校验失败；
- Evidence Engine 只陈述事实与确定性关系，不解释原因、不评价好坏、不用 LLM。

**尚未开发**：AI Planner / Synthesizer / Follow-up（LLM 层）、正式诊断 UI、
Evidence Drill-down。当前页面仅为脚手架占位。

数据验证入口：

- `GET /api/debug/stock-data?stockCode=000333.SZ` —— 归一化数据层
- `GET /api/debug/metrics?stockCode=000333.SZ` —— 指标层
- `GET /api/debug/evidence?stockCode=000333.SZ` —— 证据层

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
src/app/api/debug/     # 数据 / 指标 / 证据验证 Debug API
docs/                  # metric-catalog.md + evidence-rules.md（口径与规则登记簿）
tests/                 # Vitest：归一化、指标公式、证据规则、null 语义、缺失 Key、部分失败
```

## 规则

- API Key 只来自环境变量，`.env.local` 不入库；
- 不伪造任何金融数据：缺失用 `null`/字段缺省表达，与真实 `0` 严格区分；
- 外部接口失败显式报错（`availability` + `errors`），禁止静默兜底；
- 不输出涨跌预测、收益承诺或买卖建议。
