# 国内可访问部署方案（待办 → 交给下一个会话执行）

> 2026-10-01 由上一会话写下。用户已明确要求：**在 Vercel 之外再部署一个国内可直连的镜像**。
> 唯一卡点：国内云平台需要**实名注册**，只能由用户本人完成。注册完成后，本文件给出全部执行细节。

## 目标

把 StockLens（Next.js 全栈：页面 + 4 个 API 路由）部署到一个**中国大陆可直连**的平台，拿到备用 URL 后：
1. 更新 `README.md` 顶部「国内备用地址」占位行为真实地址，push 到 GitHub（push 需代理 `git -c http.proxy=http://127.0.0.1:7890`）；
2. 同步 `SUBMISSION.md` 与 `说明信息.txt`（ZIP 已提交，不必重新打包）。

## 为什么必须是"云托管/容器"类

API 路由（`/api/research/init` 等）在服务端执行，且 `FUYAO_API_KEY` / `DEEPSEEK_API_KEY` 只能放服务端环境变量（`src/lib/ai/model.ts` 有 `import "server-only"`）。**纯静态托管不可行。**

## 推荐平台（按优先级）

1. **腾讯云 CloudBase 云托管（推荐）**：容器跑 Next.js standalone；默认域名（`*.tcloudbaseapp.com`）国内直连、测试用途无需备案；有 CLI（`tcb`），授权后可全程命令行部署。费用按量，演示量级通常每月几元～几十元。
2. 阿里云 函数计算 FC 3.0（custom runtime）或 SAE：同样可行，默认域名国内直连。

## 用户要做的（一次性，约 10 分钟）

1. 注册腾讯云账号并完成**个人实名认证**；
2. 开通 CloudBase 并**创建环境**（按量付费即可），记下**环境 ID**；
3. 在本机（`D:\zcode存储\stocklens`）执行：
   ```bash
   npm i -g @cloudbase/cli
   tcb login
   ```
   （会弹浏览器到腾讯云授权——国内站点，**不需要代理**。）
4. 告诉会话："腾讯云开好了，环境 ID 是 `<envId>`"。

## 会话接手后的执行步骤

1. `npx next build`（确认 standalone 输出配置；如无则在 `next.config.ts` 加 `output: "standalone"`——**这是唯一的代码改动**，属部署配置，不是产品改动）；
2. 写 `Dockerfile`（node:20-alpine，复制 `.next/standalone` + `.next/static` + `public`，`PORT=3000`）；
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
