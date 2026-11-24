# OpenAI 自动例句服务

2026 年 11 月 23 日，家长已明确同意使用官方按量计费接口、创建名为 `Codex` 的应用程序接口密钥（API key），并保存到本机未跟踪的 `.env.local`。79 美元赠额已到账，本机真实 OpenAI 调用已成功。

服务已部署到 Sites 项目 `appgprj_6b043e37f58081919d5eb120a75ec501`，地址为 https://hanzi-magic-sentence-service.candidcypress64.chatgpt.site 。当前使用环境变量修订版 4，已在关闭初始化入口和诊断输出后重新部署。真实云端生成及重复请求的缓存命中均返回 HTTP 200。正式游戏电脑浏览器已实际生成并保存四条例句，显示家庭进度已同步；iPad 真机仍由家长验收。

## 运行与授权

`sentence-service.mjs` 实现例句生成，`sentence-worker.mjs` 提供部署入口。网页适配器 `../openai-sentences.js` 保留原模块的 `status/begin/complete/disconnect/get/generate` 接口。`../progress-sync.js` 的 `sentenceAccessToken()` 从设备已有的家庭连接派生访问令牌 `T`。已接入同一家庭的设备可获得相同令牌，iPad 无需另行登录模型服务或填写 OpenAI 密钥。

服务地址允许公开访问，`GET /health` 和 `POST /v1/sentences` 均校验请求的家庭访问令牌。服务器保存 `H = SHA-256(T)`，通过 Sites 原生秘密环境变量 `HANZI_FAMILY_HASH` 配置。服务器不持久保存 `T`，令牌值也不进入公开网页源文件。

`POST /v1/sentences` 接收 `{items:[{char,word,pinyin}]}`，每批最多六项，返回 `{sentences:[{char,word,pinyin,sentence}]}`。服务器只向 OpenAI 官方响应接口（Responses API）发送目标字、完整词语和目标读音，固定调用 `gpt-6.1-terra`，设置 `store:false`，限制输出长度并校验完整返回。网页再按精确字词读音核对，写入原有 `sentence` 字段，沿用学习存档同步。内置离线例句优先使用。

## 密钥、缓存与限额

`sentence-key-vault.mjs` 使用 AES-GCM 认证加密（authenticated encryption）保护 API 密钥。独立包裹密钥保存于 Sites 原生秘密环境变量 `HANZI_KEY_WRAPPING_SECRET`。Cloudflare D1 数据库只保存 API 密钥的初始化向量和密文，解密所需的包裹密钥不进入 D1。API 密钥明文按批准保存在本机 `.env.local`，服务端仅在内存中解密并调用 OpenAI，不写入源文件、客户端包、数据库或日志。

`sentence-storage.mjs` 使用 D1 保存按目标字、词语和读音区分的例句缓存，并用单条原子 SQL 预留限额。生产入口统一限制全站每分钟 20 个已授权请求、每天 120 条待生成例句尝试，按协调世界时（Coordinated Universal Time，UTC）时间窗口计数。失败和超时仍占尝试额度，缓存命中可继续使用，缺失数据库或存储失败时拒绝继续调用模型（fail closed）。这些限额控制尝试次数，实际费用还取决于模型用量。

表结构由部署迁移管理，运行请求不执行建表。生产配置 `HANZI_BOOTSTRAP_ENABLED=false`、`HANZI_UPSTREAM_DIAGNOSTICS=false`。后续更新应保留现有 Sites 项目、数据库、家庭指纹及秘密环境变量。

## 已定位的部署故障

本机成功而云端调用失败的原因已确认为 Cloudflare Workers 的 `fetch()` 不支持 `redirect:'error'`。上游调用已改为 `redirect:'manual'`，并明确拒绝所有 3xx 响应，避免跟随重定向携带授权头。修改后真实云端生成和重复缓存请求均已通过。

## 验证

在仓库根目录运行以下合成测试，覆盖输入输出校验、持久缓存、并发限额、加密密钥、家庭派生、Worker 授权和学习存档写回。

```sh
node tests/sentence-service.cjs
node tests/sentence-storage.cjs
node tests/sentence-key-vault.cjs
node tests/sentence-worker.cjs
node tests/sentence-family-token.cjs
node tests/sentence-pairing-integration.cjs
node tests/openai-sentences.cjs
node tests/ai-sentence-persistence.cjs
node tests/shared-learning.cjs
```

真实验证应使用已配置的服务，核对授权后的健康检查、首次生成、重复缓存命中、页面刷新后恢复及跨设备句子保存。浏览器验收需以实际结果补充记录。

## 费用估算与官方资料

按 GPT-6.1 Terra 标准文本价格，输入每百万计费单位（token）1 美元，输出每百万 token 5 美元。假设每条例句平均使用 1,000 个输入 token 和 200 个输出 token，每条约 0.002 美元，1,000 条约 2 美元。实际账单取决于输入、输出、推理、重试及缓存情况，按 OpenAI 当时价格结算。来源为 OpenAI 模型说明及价格表，核对日期为 2026 年 11 月 23 日。

- 模型与标准价格 https://developers.openai.com/api/docs/models/gpt-6.1-terra
- 价格表 https://developers.openai.com/api/docs/pricing
- 结构化输出（Structured Outputs） https://developers.openai.com/api/docs/guides/structured-outputs
- API 密钥保存 https://developers.openai.com/api/docs/guides/api-keys
