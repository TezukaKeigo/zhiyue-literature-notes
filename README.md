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
  pdf-form.ts                  PDF 重选与手工修改保护
drizzle/                       数据库迁移及快照
docs/                          开发设计与验收资料
tests/                         账号、业务接口、AI、PDF 与配置回归测试
scripts/local.mjs              本地构建、初始化和启动
.github/workflows/checks.yml   持续集成检查
```

## 本地运行

环境要求为 Node.js 22.13 或更高版本，建议使用 Node.js 22 LTS。Windows、macOS 和 Linux 均可运行；Windows 如遇到 workerd 启动缺少运行库的提示，需要安装 Microsoft Visual C++ Redistributable。

当前测试已在 Node.js 22.15.0 和 24.19.0 验证通过。本机 Windows 的 Node.js 24.15.0 曾出现测试进程原生崩溃；遇到 `Worker exited unexpectedly` 时请切换 Node.js 22 LTS 或更新的 24.x 版本。仓库提供 `.nvmrc`，供支持该文件的 Node 版本管理工具读取。

首次克隆后，在项目目录执行：

```powershell
npm run install:ci
npm run setup
npm start
```

`setup` 会构建项目，并按顺序应用全部本地迁移。重复运行只应用新增迁移，不会清空已有数据。终端会显示实际访问地址，通常为 `http://127.0.0.1:8787`；首次打开后自行注册账号。

默认模式不需要 Cloudflare 账号、云数据库或 API 密钥。文献、标签、笔记、统计和 PDF 辅助录入都在本地工作，数据保存在 `.wrangler/local-state`。AI 按钮在有摘要或笔记时仍可点击，但未配置 AI 时会明确提示“AI 服务尚未配置”，不会返回伪造结果。

日常修改代码可使用支持热更新的开发服务器：

```powershell
npm run dev
```

开发地址通常为 `http://localhost:5173`，与 `npm start` 使用同一份本地数据库。新增迁移后执行 `npm run db:migrate:local`；若要查看生产构建效果，先运行 `npm run setup`，再运行 `npm start`。首次安装依赖需要联网，安装完成后的本地基础功能和自动化测试不依赖云服务。

旧版本的 `.wrangler/state` 数据不会被删除，也不会自动复制到新目录。需要继续使用旧数据时，请先保留原目录并单独导出迁移，不要删除本地状态目录。

### 本地启用真实 AI（可选）

将 `.env.example` 复制为 `.env.local`，设置 `ZHIYUE_LOCAL_AI=1`，然后执行：

```powershell
npx wrangler login
npm run setup
npm start
```

此时只有 AI 请求发送到 Cloudflare，D1 仍使用本地数据库。需要有效的 Workers AI 权限和可用配额，无需填写远程数据库 ID。不要给此启动命令增加 `--local`，否则远程 AI 绑定会被禁用。

## 部署到 Cloudflare

项目使用一个 Worker、一个 D1 数据库和一个 Workers AI 绑定。部署脚本从本机环境变量或未提交的 `.env.local` 读取资源信息，不绑定原作者的个人数据库。

首次部署到自己的账号，先创建数据库：

```powershell
npx wrangler login
npx wrangler d1 create zhiyue-literature-notes-db
```

将 `.env.example` 复制为 `.env.local`，填写上一步返回的 `database_id`。以下为配置格式，ID 必须替换为自己的值：

```dotenv
CLOUDFLARE_WORKER_NAME=zhiyue-literature-notes
CLOUDFLARE_D1_DATABASE_NAME=zhiyue-literature-notes-db
CLOUDFLARE_D1_DATABASE_ID=<创建数据库后返回的 UUID>
```

构建、初始化新建的远程数据库并发布：

```powershell
npm run build
npm run cloudflare:migrate:all
npm run cloudflare:deploy
```

`cloudflare:migrate:all` 使用迁移记录表跟踪已执行的 SQL，适用于新建数据库及之后的增量升级。远程操作会明确使用 `--remote`；本地初始化始终使用 `--local`。

旧版线上数据库使用逐文件执行 SQL 的方式，没有这份迁移记录，不能直接再次运行 `cloudflare:migrate:all`。如果已执行全部三份迁移，只需部署；若只缺 AI 表，使用原有的 `npm run cloudflare:migrate:ai`。迁移文件保持不变，不要通过删表解决“表已存在”。

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

无需登录 Cloudflare，即可运行完整的自动化检查：

```powershell
npm run check
```

也可以单独执行 `npm test`、`npm run test:watch`、`npm run typecheck` 或 `npm run lint`。`npm run build` 单独验证生产构建。

| 测试文件 | 验证范围 |
|---|---|
| `tests/api.test.ts` | 注册登录与会话撤销、错误密码锁定、账号隔离、文献/标签/笔记闭环、筛选排序、重复和非法输入、级联删除、AI 缓存和过期提示、失败保留旧结果 |
| `tests/pdf.test.ts` | 标题与作者区分、脚注符号清理、DOI 和 arXiv 提取、无文字或异常文档、PDF 重选及手工修改保护 |
| `tests/runtime-config.test.mjs` | 本地配置不绑定个人资源、AI 显式启用、远程参数校验、自定义部署资源 |

接口测试执行真实路由、密码哈希和 SQL 迁移，数据库使用 Miniflare 提供的独立临时 D1；不会读写日常本地数据库或线上数据。测试中的请求上下文使用适配器，AI 返回值和 PDF.js 提取数据使用明确的测试桩，因此测试不消耗 AI 配额，也不代表已经验证所有实际 PDF 或真实模型输出。界面交互和真实 AI 调用仍需按下述流程人工验收。

运行结束会生成 `test-results/junit.xml`。GitHub Actions 在每次推送和 Pull Request 时运行检查及生产构建，并保存测试报告；执行结果以仓库 Actions 页中的实际记录为准。

AI 功能可按以下方式快速验收：打开一篇包含摘要的文献，在详情页生成“文献分析”，确认概括、候选关键词和核心要点正常显示且刷新后仍存在；保存至少一条阅读笔记后生成“阅读总结”；随后修改摘要或笔记，确认旧结果出现过期提示并可重新生成。

基础功能的完整测试数据和预期结果见 [docs/验收标准.md](docs/验收标准.md)。

## AI 辅助开发说明

AI 参与了需求拆解、数据模型设计、接口与界面实现、异常场景梳理和构建问题排查。生成代码、业务规则与文档均经过人工检查；本版本已通过类型检查、数据库迁移、生产构建以及 Cloudflare 生产环境的 Workers AI 调用验证。
