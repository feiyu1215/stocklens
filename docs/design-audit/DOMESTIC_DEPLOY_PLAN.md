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

1. **腾讯云 CloudBase 云托管（主选）**：容器跑 Next.js standalone；默认域名（`*.tcloudbaseapp.com`）国内直连、测试用途无需备案；有 CLI（`tcb`），授权后可全程命令行部署。费用按量、支持缩容到 0（无访问时 ¥0），演示量级预计每月几元内；按量付费账户需实名并有小额余额。
2. **腾讯云 EdgeOne Pages（免费备选，可作第三镜像）**：2026-08 起支持 Next.js 全栈（SSR + 动态 API，Node Functions）；免费版官方声明 "permanently available / $0 per month"、超限不断服；支持 GitHub 仓库直连构建部署，也可 CLI。注意：默认域名在大陆的访问走节点调度（可达性以部署后实测为准，可能走海外节点）。与云托管**同一个腾讯账号**即可开通。
3. 阿里云 函数计算 FC 3.0（custom runtime）或 SAE：可行，默认域名国内直连；但免费额度目前是试用性质（首开用户约 15 万 CU/月 × 3 个月），**非长期免费**，仅作备选。

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

- 本机 DNS 对 `*.vercel.app` 被污染 + TLS 重置（实测，含阿里/腾讯公共 DNS），Vercel 侧产品本身健康（部署 Ready，AI 链路实测成功）。
- GitHub README 顶部已有醒目的「⚠️ 访问提示」块（commit `a1f8ae2`），含本地运行兜底与产品走查链接；备用地址行已预留占位。
- git push 需代理：`git -c http.proxy=http://127.0.0.1:7890 push origin HEAD`。
