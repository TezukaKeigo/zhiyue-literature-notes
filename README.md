# 知阅：文献阅读与笔记管理系统

知阅是一个面向学生和研究者的个人文献管理 Web 应用，覆盖文献录入、分类检索、阅读笔记、统计分析以及 AI 辅助阅读。系统使用账号密码登录，不同用户的文献、标签、笔记和 AI 结果相互隔离。

线上地址：[https://zhiyue-literature-notes.hyn-literature.workers.dev](https://zhiyue-literature-notes.hyn-literature.workers.dev)

## 已实现功能

- 文献信息增删改查：标题、作者、年份、来源、DOI、链接、摘要、阅读状态与评分
- 标签和阅读笔记管理：支持多标签关联，每篇文献可记录多条笔记及页码或章节
- 检索与排序：可按标题、作者、来源、DOI、标签、阅读状态检索，并按更新时间、录入时间、年份或标题排序
- 阅读统计：展示文献、笔记和标签数量，以及阅读状态、全部年份和常用标签分布
- PDF 辅助录入：在浏览器中解析 PDF 并尝试填充题录信息；重新选择文件时会更新未被手工修改的字段，原文件不会上传
- AI 阅读助手：根据摘要生成文献概括、候选关键词和核心要点，并可根据已保存笔记生成阅读总结
- 个人空间：支持修改空间名称、查看网站使用说明和安全退出
- 数据校验与异常处理：覆盖缺失字段、非法年份或链接、重复文献、重复标签、空笔记及关联数据删除
- 响应式界面：支持桌面和手机浏览器

## 技术栈

- TypeScript、React 19、Vinext / Next.js App Router
- Cloudflare Workers、Workers AI 与 D1（SQLite）
- Drizzle ORM 与 SQL 数据库迁移
- PDF.js、Lucide React 和原生 CSS 响应式布局

## 项目结构

```text
app/
  api/                         认证、文献、标签、笔记和 AI 接口
  globals.css                  全局视觉与响应式样式
  page.tsx                     应用入口
components/
  literature-app.tsx           主业务界面与交互
  login-gate.tsx               登录和注册界面
db/
  index.ts                     D1 数据库连接
  schema.ts                    数据表、索引与外键
lib/
  ai.ts                        AI 输入构造、调用、校验与缓存哈希
  local-auth.ts                本地账号、密码和会话工具
  pdf-import.ts                浏览器端 PDF 题录解析
drizzle/                       数据库迁移及快照
docs/                          开发设计与验收资料
```

## 本地运行

环境要求为 Node.js 22.13 或更高版本。AI 使用远程 Cloudflare Workers AI 绑定，因此首次运行前需要登录 Cloudflare；本地 D1 数据仍保存在项目目录，不会与生产数据库混用。

```powershell
npm run install:ci
npx wrangler login
npm run build
npm run cloudflare:prepare
```

首次初始化本地数据库时，按照迁移顺序执行：

```powershell
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_acoustic_supernaut.sql --yes
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_worthless_doctor_strange.sql --yes
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_worthless_justin_hammer.sql --yes
```

随后启动构建后的 Worker：

```powershell
npm start
```

终端会显示实际访问地址，通常为 `http://127.0.0.1:8787`。修改代码后重新执行 `npm run build` 和 `npm run cloudflare:prepare`。

## 部署到 Cloudflare

项目使用一个 Worker、一个 D1 数据库和一个 Workers AI 绑定。首次部署前先完成 Cloudflare 登录，然后构建并依次初始化远程数据库：

```powershell
npx wrangler login
npm run build
npm run cloudflare:migrate
npm run cloudflare:migrate:auth
npm run cloudflare:migrate:ai
npm run cloudflare:deploy
```

已有数据库只需要执行尚未应用的迁移。例如已经具备账号系统、但尚无 AI 结果表的环境，只需运行 `npm run cloudflare:migrate:ai` 后重新部署。

当前部署资源如下：

- Worker：`zhiyue-literature-notes`
- D1：`zhiyue-literature-notes-db`，绑定名为 `DB`
- Workers AI：绑定名为 `AI`
- 认证模式：`AUTH_MODE=local`

生产 D1 与本地调试数据库完全独立，数据不会自动同步。`workers.dev` 地址可以从公网访问，但业务数据接口必须登录；未登录请求会返回 `401`。

## 账号与数据安全

密码使用 PBKDF2-SHA256 加盐哈希保存，服务端登录会话通过带有 `HttpOnly`、`Secure` 和 `SameSite=Lax` 属性的 Cookie 维护。注册入口当前开放，每个邮箱只能注册一次；服务端所有查询和写入均按用户标识隔离。

PDF 只在当前浏览器中解析，不上传或保存原文件。只有用户主动点击 AI 生成按钮时，相应的题录与摘要或阅读笔记文本才会发送给 Workers AI。生成结果按用户、文献和任务类型保存在 D1 中，原始内容修改后会标记旧结果已过期，并提示重新生成。

AI 输出仅用于辅助阅读。候选关键词不会自动创建为系统标签，生成失败也不会覆盖上一次成功结果。当前模型为 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`，无需单独配置第三方 API 密钥，但会使用 Cloudflare 账号的 Workers AI 配额。

## 数据库设计

- `user_accounts`、`auth_sessions`：账号、密码哈希与登录会话
- `literatures`：文献题录、阅读状态和评分
- `tags`、`literature_tags`：用户标签及文献多对多关联
- `reading_notes`：与具体文献正确关联的阅读笔记
- `literature_ai_outputs`：文献分析与阅读总结，以及输入哈希、模型和更新时间

外键启用级联删除。删除文献时，其笔记、标签关联和 AI 结果会同步删除；删除标签只移除标签及关联，不删除文献。

## 主要业务规则

1. 标题和作者不能为空；相同用户下，标题、作者和年份完全相同的记录视为重复文献。
2. 年份必须在 1800 至下一自然年之间，评分必须为 0 至 5 的整数，原文链接仅接受 HTTP 或 HTTPS。
3. 笔记必须关联当前用户拥有的有效文献，内容不能为空；同一用户下不允许出现同名标签。
4. 文献分析需要摘要，阅读总结需要至少一条已保存笔记；其他用户无法读取或生成该文献的 AI 结果。

## 验证与验收

提交前可执行以下检查：

```powershell
npm run lint
npx tsc --noEmit
npm run build
```

AI 功能可按以下方式快速验收：打开一篇包含摘要的文献，在详情页生成“文献分析”，确认概括、候选关键词和核心要点正常显示且刷新后仍存在；保存至少一条阅读笔记后生成“阅读总结”；随后修改摘要或笔记，确认旧结果出现过期提示并可重新生成。

基础功能的完整测试数据和预期结果见 [docs/验收标准.md](docs/验收标准.md)。

## AI 辅助开发说明

AI 参与了需求拆解、数据模型设计、接口与界面实现、异常场景梳理和构建问题排查。生成代码、业务规则与文档均经过人工检查；本版本已通过类型检查、数据库迁移、生产构建以及 Cloudflare 生产环境的 Workers AI 调用验证。
