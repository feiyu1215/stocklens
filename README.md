# StockLens

AI Native 个股多维诊断与证据验证工具（题目 03 交付）。

> **先看证据，再下结论。** StockLens 不判断股票好坏、不给评分、不给买卖建议——
> 它把真实金融数据组织成可追溯的证据链，区分**事实、分析推断与暂时无法验证的信息**，
> 并让每一个结论都能点回原始数据。

- **公开访问（正式）**：https://stocklens-blush.vercel.app （Vercel 生产部署；源码 https://github.com/feiyu1215/stocklens ）
- **研究对象**：美的集团 000333.SZ（P0 固定标的，不做全市场搜索）

## 目标用户

希望快速研究一家上市公司，但不满足于 AI 长篇总结、简单评分或"好/坏"标签的用户。
他们关心的是：现在到底发生了什么？这个判断有什么证据？哪些地方存在矛盾？接下来该验证什么？

## 核心设计

```text
Question → Compliance Pre-check → AI Planner（选维度，看不到数据）
→ Truth Layer（扶摇 REST → Data Adapter → Normalized Data → Metric Engine → Evidence Engine）
→ Evidence Selection（代码按维度过滤）→ AI Synthesizer（只组织证据）
→ Diagnosis Validation（结构→绑定→分区类型→合规）→ 诊断工作台 UI → Evidence Drawer 钻取 → Follow-up
```

三层职责（详细口径见 docs/）：

| 层 | 职责 | 纪律 |
|---|---|---|
| **Truth Layer** | 数据适配、39 个确定性指标（含基准/行业/趋势）、40 条证据（fact/inference/unknown） | LLM 禁入；缺失=null；真实 0 不改写；单季/累计口径分离 |
| **Intelligence Layer** | Planner 选维度；Synthesizer/Followup 组织与解释证据 | 只能引用已有 Evidence ID；输出全过确定性校验，伪造 ID 整体拒绝 |
| **Experience Layer** | 诊断工作台、Evidence Drawer、追问 | 只呈现/组织/格式化/钻取，不产生新金融结论 |

## AI 的角色

模型（DeepSeek）只做三件事：**理解研究问题并选择维度**、**组织与解释已有证据**、
**提出后续研究方向**。它不能：调用不存在的数据、重算数字、修改/新增 Evidence、
评级（优秀/低估/高估）、给买卖建议或预测。所有 AI 输出必须通过
Evidence Binding + 分区类型 + 合规扫描校验；失败 repair 一次，仍失败则
synthesis = null，证据照常返回（AI 失败不污染 Truth Layer）。
架构细节与已知边界：[docs/ai-architecture.md](./docs/ai-architecture.md)。

## Observatory V2（/observatory）

**Observatory dynamically constructs a company-specific research space rather than applying one fixed analysis template to every stock.**
AI Research Framer 依据公司、行业、用户问题与真实 Capability Manifest 动态生成研究维度
（4–6 个，可自由命名），每个维度经 capability → evidence 匹配后由一次 Composer 生成
grounded claims；用户可直接添加研究角度（无数据支撑时生成 UNKNOWN 维度并列出缺失数据，
绝不编造），沿 Claim 的 ①②③ 证据锚点 hover 预览 / 点击固定右侧 Evidence Rail，
并在 Claim 下就地追问（复用 /api/followup）。V1（/、/diagnosis、/api/diagnosis）完整保留。
设计与实现细节：[`docs/observatory-architecture.md`](./docs/observatory-architecture.md) ·
[`docs/observatory-visual-spec.md`](./docs/observatory-visual-spec.md)。

## 产品设计（progressive disclosure）

首屏围绕用户问题呈现关键结论、重点证据与研究边界（合理关注 ≤4 条、尚待验证 ≤3 条），
完整指标与证据通过维度视图（primary 维度默认展开）与 Evidence Drawer 逐层下钻。

## 数据使用

- **扶摇金融数据 API**（同花顺系，X-api-key 鉴权）：行情快照/历史 K 线（前复权）、
  三大报表多期、官方财务指标、估值快照、交易日历、标的检索——唯一事实来源；
- **DeepSeek API**：Planner / Synthesizer / Followup（temperature 0/0.2/0.2）；
- 所有密钥走服务端环境变量，不暴露给浏览器；前端不直接请求任何外部数据源。

## 本地运行

```bash
npm install
cp .env.example .env.local   # 填入 FUYAO_API_KEY 与 DEEPSEEK_API_KEY
npm run dev                  # http://localhost:3000
```

命令：npm run build / npm run start -- --port 3100 / npm run test（Vitest，253 个）/ npm run lint。

正式部署（Vercel，已完成）：

```bash
npx vercel link --yes --project stocklens
npx vercel env add FUYAO_API_KEY production      # 值来自 .env.local
npx vercel env add DEEPSEEK_API_KEY production
npx vercel deploy --prod                         # https://stocklens-blush.vercel.app
```

后续更新只需 `git push`（Vercel 已关联仓库自动部署）或再次 `npx vercel deploy --prod`。

## 调试 API

- POST /api/diagnosis — 完整诊断链路
- POST /api/followup — 沿证据追问
- GET /api/debug/stock-data?stockCode=000333.SZ · /metrics · /evidence — 分层验证

## 测试与质量记录

- 253 个自动化测试（含打包预算、事件护栏、研究视图）；
- Production smoke（公网 5 路径）：scripts/production_smoke.py → scripts/production-smoke-results.json；
- 交付文档：docs/test-notes.md · docs/ai-usage-record.md · docs/demo-script.md ·
  docs/metric-catalog.md · docs/evidence-rules.md · docs/ai-architecture.md。

## 已知边界与未做事项

**已知边界**（诚实声明，详见 ai-architecture.md）：

1. 语义事实一致性无法形式化证明——模型可能绑定合法证据却写出矛盾句子；
   通过 Prompt 禁令 + Eval Bad Case + Summary 少写数字 + 证据钻取缓解，不假装零幻觉；
2. 合规 Pre-check 是 P0 关键词规则，不是完整金融合规模型；
3. 行业/新闻/历史估值数据未接入 → 对应维度以 UNKNOWN 显式呈现，不编造；
4. 每次诊断实时重新执行 Truth Layer（无持久化），刷新即重新诊断。

**未做**：Follow-up 多轮上下文记忆、历史诊断存储、多股票搜索、行业对比、
新闻/公告事件、K 线图、部署持久化域名、用户系统。
