# 知阅 文献阅读与笔记管理系统

知阅是一个面向学生和研究者的个人文献管理 Web 应用，完成文献录入、编辑、删除、标签分类、阅读笔记、组合检索、排序和阅读统计的完整数据闭环。

## 已实现功能

- 文献信息增删改查：标题、作者、年份、来源、DOI、链接、摘要、阅读状态与评分
- 标签增删改查：自定义名称和颜色，支持文献多标签关联
- 阅读笔记增删改查：每篇文献可记录多条笔记和页码或章节
- 检索筛选：按标题、作者、期刊、DOI、状态和标签检索
- 排序：按最近更新、录入时间、年份和标题排序
- 统计：文献总数、阅读状态、笔记数、标签数、年份分布和完成率
- 数据一致性：删除文献同步删除笔记与标签关联；删除标签不删除文献
- 异常处理：必填字段、非法年份、非法链接、非法评分、重复文献、重复标签和空笔记校验
- 响应式界面：支持桌面浏览器和手机浏览器

## 技术栈

- TypeScript、React 19、Vinext / Next.js App Router
- Cloudflare Workers
- Cloudflare D1（SQLite）
- Drizzle ORM 与数据库迁移
- Lucide React 图标
- 原生 CSS 响应式布局

## 项目结构

```text
app/
  api/                    后端 REST API
  globals.css             全局视觉与响应式样式
  layout.tsx              页面元数据与根布局
  page.tsx                应用入口
components/
  literature-app.tsx      前端业务界面与交互
db/
  index.ts                D1 数据库连接
  schema.ts               数据表、索引与外键
lib/
  api.ts                  API 通用工具
  literature-validation.ts 文献参数校验
docs/
  开发设计文档.md
  验收标准.md
drizzle/                  数据库迁移
```

## 本地启动

环境要求：Node.js 22.13 或更高版本。

```powershell
npm run install:ci
npm run db:generate
npm run build
```

首次运行需要按 `drizzle/meta/_journal.json` 中的顺序将生成的 SQL 迁移应用到本地 D1。项目构建后执行：

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_acoustic_supernaut.sql
```

启动开发服务器：

```powershell
npm run dev
```

默认访问地址通常为 `http://127.0.0.1:5173`。本地调试数据保存在 `.wrangler/state` 中。

## 独立部署到 Cloudflare

项目可以脱离 ChatGPT Sites，直接部署到 Cloudflare Workers，并使用独立的 D1 数据库。

首次部署前登录 Cloudflare：

```powershell
npx wrangler login
```

构建项目并初始化远程数据库：

```powershell
npm run build
npm run cloudflare:migrate
```

发布或更新网站：

```powershell
npm run cloudflare:deploy
```

独立部署资源：

- Worker：`zhiyue-literature-notes`
- D1：`zhiyue-literature-notes-db`
- D1 绑定名：`DB`

Cloudflare 与 ChatGPT Sites 使用不同的 D1 数据库，数据不会自动同步。

`workers.dev` 地址默认可以从公网访问。个人使用时，应在 Cloudflare 控制台进入
Workers & Pages，选择 `zhiyue-literature-notes`，在 Access 页签中保护 All traffic，
并将允许规则限制为自己的邮箱。部署配置已关闭公开的版本预览 URL。

应用不会在数据库中保存密码，而是使用 Cloudflare Access 完成 Google 登录。启用
Access 后，还需要在 Worker 的 Settings > Variables and Secrets 中添加两个文本变量：

- `CF_ACCESS_TEAM_DOMAIN`：Zero Trust 团队域名，例如
  `https://your-team.cloudflareaccess.com`
- `CF_ACCESS_AUD`：Access 应用 Additional settings 中的 Application Audience (AUD) Tag

部署配置启用了 `keep_vars`，重新发布代码时会保留控制台中设置的变量。应用会校验
Access JWT 的签名、签发者、Audience 和有效期，并使用验证后的邮箱隔离每位用户的
文献、标签和阅读笔记；缺少有效身份时，所有数据接口都会返回 `401`。

## 数据库设计

- `literatures`：文献核心信息与阅读状态
- `tags`：用户自定义标签
- `literature_tags`：文献与标签的多对多关联
- `reading_notes`：与具体文献关联的阅读笔记

所有业务数据按访问用户隔离。外键启用级联删除，保证文献删除后不会残留孤立笔记或标签关联。

## 主要业务规则

1. 标题和作者不能为空。
2. 相同用户下，标题、作者和年份完全相同的记录视为重复文献。
3. 年份必须在 1800 至下一自然年之间，评分必须为 0 至 5 的整数。
4. 文献链接仅接受 HTTP 或 HTTPS 地址。
5. 笔记必须关联一篇有效文献，内容不能为空。
6. 标签名称不能为空，同一用户下不允许重复标签。
7. 删除文献时同步删除其笔记与标签关联；删除标签时只删除关联，不删除文献。

## AI 辅助开发说明

AI 参与了需求拆解、数据模型设计、接口代码生成、异常场景梳理、界面实现和构建问题排查。所有生成内容均通过类型检查、数据库迁移、生产构建和功能验收进行验证。本版本没有加入 AI 摘要等可选业务功能，确保基础验收流程不依赖外部接口。

## 验收

完整验收步骤、测试数据和预期结果见 [docs/验收标准.md](docs/验收标准.md)。
