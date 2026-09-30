# StockLens

AI Native 个股多维诊断与证据验证工具（作业项目，题目 03）。

**Evidence First, Conclusion Second** —— 先有证据，再有结论。产品目标、三层架构、
Evidence 模型与开发阶段见 [`PRD.md`](./PRD.md)。

## 当前状态

Task 01（Data Layer）+ Task 02（Deterministic Metric Engine）已完成：

```text
Fuyao REST → Data Adapter → Normalized Data → Metric Engine → MetricResult[]
```

- 指标口径与公式登记在 [`docs/metric-catalog.md`](./docs/metric-catalog.md)；
- 21 个确定性指标（财务 13 / 估值 2 / 行情 6），缺失指标以 unavailable + 原因呈现，
  不静默丢弃、不 0 兜底；
- Metric Engine 只计算、不解释：无语义标签、无评分。

**尚未开发**：Evidence Engine、AI（Planner/Synthesis/Followup）、正式诊断 UI、
Evidence Drill-down。当前页面仅为脚手架占位。

数据验证入口：

- `GET /api/debug/stock-data?stockCode=000333.SZ` —— 归一化数据层
- `GET /api/debug/metrics?stockCode=000333.SZ` —— 指标层

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
src/app/api/debug/     # 数据与指标验证 Debug API
docs/                  # metric-catalog.md（指标口径登记簿）
tests/                 # Vitest：归一化、指标公式、null 语义、缺失 Key、部分失败
```

## 规则

- API Key 只来自环境变量，`.env.local` 不入库；
- 不伪造任何金融数据：缺失用 `null`/字段缺省表达，与真实 `0` 严格区分；
- 外部接口失败显式报错（`availability` + `errors`），禁止静默兜底；
- 不输出涨跌预测、收益承诺或买卖建议。
