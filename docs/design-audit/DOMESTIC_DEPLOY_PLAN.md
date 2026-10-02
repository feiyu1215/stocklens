# 国内可访问部署方案（待办 → 交给下一个会话执行）

> 2026-10-01 由上一会话写下。用户已明确要求：**在 Vercel 之外再部署一个国内可直连的镜像**。
> 唯一卡点：国内云平台需要**实名注册**，只能由用户本人完成。注册完成后，本文件给出全部执行细节。
>
> **2026-10-03 更新：全部不依赖账号的准备工作已完成并提交** —— CloudBase CLI 3.8.5 已装好（用户无需再 `npm i -g`）；`next.config.ts` 已加 `output: "standalone"` 且本地 `next build` 验证 `.next/standalone/server.js` 正常生成；`Dockerfile`（node:22-alpine 多阶段，云上构建、平台无关、密钥零进镜像）与 `.dockerignore` 已写好。已核实：所有 `process.env` 均为请求时读取、9 个 API 路由全部 `force-dynamic`、无 middleware → **云端构建不需要任何环境变量**。用户剩余步骤只有：① 注册腾讯云+实名 ② 开通 CloudBase 建环境 ③ 在 `D:\zcode存储\stocklens` 跑 `tcb login`。

## 目标

把 StockLens（Next.js 全栈：页面 + 4 个 API 路由）部署到一个**中国大陆可直连**的平台，拿到备用 URL 后：
1. 更新 `README.md` 顶部「国内备用地址」占位行为真实地址，push 到 GitHub（push 需代理 `git -c http.proxy=http://127.0.0.1:7890`）；
2. 同步 `SUBMISSION.md` 与 `说明信息.txt`（ZIP 已提交，不必重新打包）。

## 为什么必须是"云托管/容器"类

API 路由（`/api/research/init` 等）在服务端执行，且 `FUYAO_API_KEY` / `DEEPSEEK_API_KEY` 只能放服务端环境变量（`src/lib/ai/model.ts` 有 `import "server-only"`）。**纯静态托管不可行。**

## 推荐平台（按优先级）

1. **腾讯云 CloudBase 云托管（主选，但注意套餐门槛）**：容器跑 Next.js standalone；默认域名（`*.tcloudbaseapp.com`）国内直连、测试用途无需备案；CLI（`tcb`）已装。**2026-10-03 控制台实况（用户贴回购买页 + 官方价格文档双重核实）：环境必须选套餐，免费体验版（¥0、3000 资源点/月、需公众号领兑换码）不含云托管**；云托管入门档＝**个人版 ¥19.90/月（原价 39.9，购买时长可只选 1 个月）**，含 4 万资源点/月、固定出口 IP。资源点换算：1000 点＝1 元；云托管 CPU 55 点/核·时、内存 32 点/GB·时、外网出流量 800 点/GB（cloud.tencent.com/document/product/876/127357）→ 演示量级月用量预计 <500 点（约 5 元等值），4 万点绰绰有余。**地域必须选境内（上海/广州）——新加坡地域不支持云托管**；数据库选默认 PostgreSQL 即可（创建后不可切换，但本项目不用数据库，无影响）。**可能的 ¥0 通道**：微信 AI 小程序成长计划"免费 6 个月个人版环境"（2026-07 仍在更新，需查资格）。
2. **腾讯云 EdgeOne Pages（免费备选，可作第三镜像）**：2026-08 起支持 Next.js 全栈（SSR + 动态 API，Node Functions）；免费版官方声明 "permanently available / $0 per month"、超限不断服；支持 GitHub 仓库直连构建部署，也可 CLI。注意：默认域名在大陆的访问走节点调度（可达性以部署后实测为准，可能走海外节点）。与云托管**同一个腾讯账号**即可开通。
3. 阿里云 函数计算 FC 3.0（custom runtime）或 SAE：可行，默认域名国内直连；但免费额度目前是试用性质（首开用户约 15 万 CU/月 × 3 个月），**非长期免费**，仅作备选。

## 当前执行路径（2026-10-03 用户拍板）

微信成长计划搁置（用户只有测试 AppID，转正式需时且资格不确定）；**先走 EdgeOne Pages 免费版**，不满意再买 CloudBase 个人版 1 个月（¥19.9）兜底。

1. 用户：注册腾讯云账号 + 实名认证（哪条路都必需，不浪费）；
2. 用户：EdgeOne Pages 控制台（console.cloud.tencent.com 搜 "EdgeOne Pages"，或 pages.edgeone.ai 登录）→ 创建项目 → **导入 Git 仓库** → GitHub 授权 → 选 `feiyu1215/stocklens`（公开仓库）→ 框架自动检测 Next.js → 部署；
3. 用户：项目设置里配 4 个环境变量（`FUYAO_API_KEY`/`DEEPSEEK_API_KEY` 的值从本地 `.env.local` 复制，不外发；`DEEPSEEK_BASE_URL=https://api.deepseek.com`；`DEEPSEEK_MODEL=deepseek-chat`）；
4. 部署完成后把 `*.edgeone.app` 预览域名发会话；
5. 会话：**直连语义验收**——本机即大陆网络，curl 不带代理实测（HTTP 200、`?live=1` init 冒烟、AI 追问链路）；实测不通则此路径出局，转 ¥19.9 兜底；
6. 通过 → README「国内备用地址」回填 + push（主分支 push 会自动触发 EdgeOne 重新构建，属预期行为）。

已知旋钮：若 EdgeOne 构建报错与 `output: "standalone"` 相关 → 把 next.config.ts 改为按环境变量条件启用（Dockerfile 加 ENV 保持容器路径不变），两分钟修复；若构建 Node 版本不匹配 → repo 已加 `.nvmrc`（22）。

**2026-10-03 EdgeOne 部署实况**：Git 导入一次成功，默认域名 `stocklens-gtz6k1nz.edgeone.cool`（注意是 `.cool` 后缀）状态"已生效"。**大陆链路实测：DNS 无污染、解析到大陆节点（114.237.67.63，江苏电信段）、TLS 正常、0.3–1.5s 连接——物理链路完全通**。但所有请求 HTTP 401（`X-EOP-MSG: eo_time missing`）：官方错误码文档证实——**加速区域含中国大陆的项目，默认域名必须用控制台生成的签名预览链接访问、有效期仅 3 小时**（合规原因），文档建议"绑定自定义域名建立稳定访问通道"（自定义域名走大陆节点需备案）。待验证出路：① 项目设置里找"部署保护/访问控制"开关能否关闭 ② 若无开关，把项目加速区域改为"全球可用区（不含中国大陆）"重建，默认域名即公开（走海外节点），再无代理实测大陆可达性——这是当初 EdgeOne 假设的最终检验。当前先让用户点"预览"拿签名链接验证构建产物本身正确。

**2026-10-03 EdgeOne 终局结论（出局）**：设置页无"部署保护"开关（用户截图：仅函数地域/部署钩子/删除项目——函数地域显示大陆=ap-guangzhou、海外=ap-singapore）。签名链接实测：查询参数 `eo_token`/`eo_time` 首访种 Cookie（Max-Age=10800s）后放行——带 Cookie 无代理实测**三路径全 200**（首页/`/observatory-v5`/fixture API），标题「StockLens · 个股证据诊断」，0.4–1.0s，构建与大陆服务完全正常。**但官方错误码文档明确：两种加速区域的默认域名都无法稳定公开**——含大陆＝3 小时签名链接；不含大陆＝大陆访客 401。免费版给不出"稳定公开的大陆直连地址"，属平台合规设计非配置问题。EdgeOne 项目暂留（零成本，日后若购域名可复用）。**转 CloudBase 个人版 ¥19.9/1 个月**：云托管默认域名 `*.tcloudbaseapp.com` 长期公开、无需备案、大陆直连（部署时复核），Dockerfile/CLI/方案全部已备，用户建环境 + `tcb login` 后会话接管全部部署。

## 用户要做的（一次性，约 10 分钟）

1. 注册腾讯云账号并完成**个人实名认证**；
2. 开通 CloudBase 并**创建环境**（按量付费即可），记下**环境 ID**；
3. 在本机（`D:\zcode存储\stocklens`）执行 `tcb login`（**CLI 已由会话装好，无需再安装**；会弹浏览器到腾讯云授权——国内站点，**不需要代理**）。
4. 告诉会话："腾讯云开好了，环境 ID 是 `<envId>`"。

## 会话接手后的执行步骤

1. ✅ **已完成（2026-10-03）**：`next.config.ts` 加了 `output: "standalone"`（唯一代码改动，属部署配置非产品改动）；本地 `next build` 通过，`.next/standalone/server.js` 生成正常；
2. ✅ **已完成（2026-10-03）**：`Dockerfile` 为 node:22-alpine **多阶段**（deps → builder 云上构建 → runner），平台无关，`PORT=3000`、非 root 运行；`.dockerignore` 排除 `.git`/`docs`(62MB)/`.env*`——密钥绝不进镜像；**`tests` 目录不能排除**（2026-10-03 修正）：fixture 路由运行时读 `tests/fixtures/*.json`（已核实 nft 把它追踪进 standalone，`.next/standalone/tests/fixtures/` 实测存在），云端构建上下文丢掉它，默认首屏（非 `?live=1`）会 500。部署命令以 `tcb cloudrun -h` 实测为准（CLI 子命令可能有版本差异；必要时引导用户在控制台用"本地上传代码包"方式构建）；
3. `tcb` 部署容器到用户环境（或引导用户在控制台用"镜像托管"上传）；
4. 在云托管服务设置里配置环境变量（值取自本地 `.env.local`，**绝不写进仓库**）：
   - `FUYAO_API_KEY`、`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`、`DEEPSEEK_MODEL=deepseek-chat`
5. 开启公网访问，拿到默认域名；
6. **浏览器验收（不带代理的直连语义）**：页面加载（默认 fixture）→ `?live=1` 完整 init → AI 追问 → 切换公司 → console 无错误；
7. 更新 README「国内备用地址」行 + SUBMISSION.md + 说明信息.txt，push（走代理）。

## 备忘

- 2026-10-03 用户确认：**作业已上交，提交包内 Vercel 网址冻结**。结论：**"保持原网址不变 + 国内无代理直连"技术上不可能**——`vercel.app` 域名不归我们控制，大陆侧的 DNS 污染 + SNI 阻断发生在网络层；连"国内服务器反向代理 vercel.app"都不可行（出站同样被阻断；唯一技术变体是境外如香港服务器反代，但那照样是一个新网址，解决不了核心诉求）。因此备用地址以**增补**而非修改存在：GitHub README「国内备用地址」占位行填真值 + 必要时用户向评审补发一行地址——均**不动提交包**，原 Vercel 网址继续有效（代理/海外可达，产品本身健康）。
- 2026-10-03 计费口径复核（回应"轻量 vs CVM"的对比）：**云托管官方口径为"按实际使用付费，流量低谷时自动缩容到 0"**，按实例启动后的 CPU/内存用量计量（换算"计算资源使用量"，精确到 100ms），扣量顺序＝环境套餐 → 资源包 → 按量付费（docs.cloudbase.net/run/introduction、/run/faq/fee）。CVM 按量计费仅作 plan B：关机免 CPU/内存费、能跑 Docker，但裸 IP 无 HTTPS、国内域名需备案（2–4 周），评审打开体验差——仅当云托管开通受阻时使用。轻量应用服务器基础套餐仅包年包月（其"按量"只是超额流量），不适用于本需求；其常驻套餐建议适用于装修同步小程序项目，与本仓库无关。
- 2026-10-03 套餐实况（修正此前"按量付费即可"口径）：**免费体验版上跑不了云托管**；备选 ¥0 通道按优先级＝①微信 AI 小程序成长计划免费 6 个月个人版（含云托管，资格待用户在活动页确认）②EdgeOne Pages 免费版（GitHub 直连，部署后实测大陆可达性）③付费兜底＝个人版 ¥19.9 只买 1 个月。在免费体验版上用"云函数 + HTTP 网关 custom runtime"跑 Next.js 理论可行但工程成本高、超时配额风险（init 14–28s），**不做首选**。
- 本机 DNS 对 `*.vercel.app` 被污染 + TLS 重置（实测，含阿里/腾讯公共 DNS），Vercel 侧产品本身健康（部署 Ready，AI 链路实测成功）。
- GitHub README 顶部已有醒目的「⚠️ 访问提示」块（commit `a1f8ae2`），含本地运行兜底与产品走查链接；备用地址行已预留占位。
- git push 需代理：`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`。
