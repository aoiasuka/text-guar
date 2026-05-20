# 文本内容管理与敏感信息审核系统（Text Guard）

全栈 TypeScript 项目，覆盖内容采集、敏感信息检测、审核流转、数据权限与报表导出，提供：

- **RBAC 权限模型**：功能权限（菜单/按钮/接口）与数据权限（owner 范围）分离，菜单按角色动态加载
- **成熟敏感词检测引擎**：
  - **反绕过归一化**：拼音（`dǔbó` → 赌博）、leet（`adm!n` → admin）、形近字（攴击 → 攻击）、间隔符号（赌·博 / 赌@博 / 零宽字符）统一识别
  - **三种匹配模式**：字面（literal）、自定义正则（regex，re2-wasm 编译杜绝 ReDoS）、内置凭证识别（credential，覆盖 AWS Key、JWT、SSH 私钥、API token、数据库连接串、bcrypt hash、中英文账密组合等 15+ 模板）
  - **上下文消歧**：用 jieba 分词识别复合词（攻击力 ≠ 攻击）、检测引号/代码块/反向劝阻关键词，给命中打 0-1 置信度而非二元命中
  - **规则治理**：每条规则带 version / baseConfidence / 正负样本，改一条规则可一键回归；命中事件全量入 `detection_events` 表，可按规则回溯
  - **本地 AI 复核**（可选）：每次检测的所有命中都送本地 Gemma 4 e2b 二次判定，区分「确实敏感 / 中性提及 / 引用 / 反向劝阻」，AI 判定可改写规则原始置信度
- **审核流**：编辑提审 → 管理员通过/驳回，附操作审计日志
- **报表导出**：Word（关键指标 + 高风险列表）、Excel（全量明细）

## 技术栈

| 层 | 选型 |
|----|----|
| 前端 | React 18、Vite、Ant Design 5、React Router、Zustand、Axios |
| 后端 | Node.js ≥18、Express、TypeScript、Prisma 5、MySQL 8、JWT、Zod |
| 检测引擎 | Aho-Corasick Trie + pinyin-pro 拼音/leet/形近变体 + @node-rs/jieba 分词 + re2-wasm 安全正则 + 内置凭证规则 + 置信度评分 |
| AI 复核 | Ollama + Gemma 4 e2b（可选，完全本地推理） |
| 报表 | `docx`（Word）、`exceljs`（Excel） |

## 环境要求

- Node.js ≥ 18
- npm（随 Node 安装）
- MySQL 8.0+，建议字符集 `utf8mb4` / `utf8mb4_unicode_ci`

## 快速启动（推荐用 Prisma 维护数据库）

### 1. 克隆与依赖

```pwsh
git clone <repo-url> text-guard
cd text-guard
npm install
```

> 这是 npm workspaces 仓库，根目录 `npm install` 会自动装好 `client / server / shared` 三个包。

### 2. 配置后端环境变量

```pwsh
copy server\.env.example server\.env
```

按需修改 `server\.env`：

```dotenv
DATABASE_URL="mysql://root:password@localhost:3306/text_guard"
JWT_SECRET="replace-with-a-long-random-secret"   # 生产环境必须改
JWT_EXPIRES_IN="15m"
PORT=3000
CLIENT_ORIGIN="http://localhost:5173"
```

确保 MySQL 中已经有用户和库的访问权限（库会由迁移自动创建）。

### 3. 生成 Prisma Client + 应用迁移 + 灌种子

```pwsh
cd server
npx prisma generate          # 生成类型化客户端
npx prisma migrate deploy    # 应用 prisma/migrations 里所有迁移（含最新 RBAC + match_type）
npx prisma db seed           # 灌入：2 用户 + 28 权限 + 6 菜单 + 14 敏感词 + 4 演示内容
cd ..
```

> 全新数据库第一次拉代码请用 `prisma migrate deploy`；本地开发想改 schema 后生成新迁移用 `prisma migrate dev --name <desc>`。

### 4. 启动开发服务

两个终端分别启动：

```pwsh
# 终端 1：后端 (默认 :3000)
npm run dev:server

# 终端 2：前端 (默认 :5173)
npm run dev:client
```

浏览器打开 <http://localhost:5173>，使用下方默认账号登录。

## 替代方案：用 init.sql 一次性建库

不想用 Prisma 管理 schema 时，可以直接跑根目录的 `init.sql`（与 Prisma schema 同步维护，含完整 DDL + 种子）：

```pwsh
mysql -u root -p < init.sql
```

执行后跳过上面第 3 步的 `prisma migrate deploy / db seed`，但仍然需要执行：

```pwsh
cd server
npx prisma generate
```

以便后端运行时拿到正确的类型化客户端。

## 默认账号 & 权限矩阵

| 用户 | 密码 | 角色 | 能看到的菜单 | 数据范围 |
|------|------|------|--------------|----------|
| admin | admin123 | 管理员 | 全部 6 项 | 所有内容 / 全部日志 |
| editor | editor123 | 编辑 | 工作台、内容管理 | 仅自己创建的内容 |

权限码细分（28 条）：

- 功能权限：`dashboard:view`、`content:list/detail/create/update/delete/submit/pin/detect`、`sensitive:list/create/update/delete/toggle`、`review:pending/history/approve/reject/batch`、`report:stats/export`、`log:list`、`user:register/password`
- 数据权限：`content:data:any`、`content:data:own`、`log:data:any`、`log:data:own`

要新增角色或调整权限：直接改 `server/prisma/seed.ts` 里的 `editorPermissions`，或在运行时往 `role_permissions` 表里加行，60s 缓存到期或重启即生效。

## 敏感词匹配模式

在「敏感词库」页新增条目时可选三种 `matchType`，并搭配 `baseConfidence / variantMatch / contextScope / positiveSamples / negativeSamples` 字段精细控制：

| 模式 | 适用场景 | 示例 |
|------|----------|------|
| `literal` | 普通敏感词，按字面命中（自动启用反绕过变体匹配） | 词条「赌博」→ 同时命中「dǔbó / DU博 / 赌@博 / 赌​博」 |
| `regex` | 用户自定义正则；用 re2-wasm 编译避免 ReDoS；支持前置 `(?i)/(?s)` 等内联 flag | 词条「弱密码」+ pattern `(?i)password\s*[:=]\s*(?:admin|123456)` |
| `credential` | 凭证组合识别，**忽略词条文本**，使用 15+ 条内置规则集 | 启用后命中 AWS Key、JWT、SSH 私钥、Bearer Token、bcrypt hash、`mysql://user:pass@host`、「账号 admin 密码 admin123」等 |

每条规则配置：
- **baseConfidence** (0-1)：规则上限置信度，最终命中置信度 = 该值 × 来源折扣 × 上下文调整
- **variantMatch**：是否启用拼音/leet/形近字反绕过匹配（命中变体时置信度 × 0.75）
- **contextScope**：
  - `strict`（默认）：应用全部上下文规则（引号 ×0.5、代码块 ×0.3、反向劝阻 ×0.4、jieba 复合词 ×0.5、同类聚类 ×1.1）
  - `lenient`：只判定引号 + 代码块
  - `global`：完全跳过上下文调整
- **positiveSamples / negativeSamples**：用于点击「测试」按钮一键回归

命中事件自动入 `detection_events` 表，进规则详情可查全部历史。

## 启用本地 AI 复核（可选）

对每次检测的全部命中调本地 Gemma 4 e2b 二次判定，输出 `sensitive / neutral / quote / reverse`，前端紫色「AI 复核」角标显示。完全离线、零调用成本。

```pwsh
# 1. 安装 Ollama
# https://ollama.com/download

# 2. 拉取模型（e2b 显存约 2-3GB，适合 6GB 以下显卡）
ollama pull gemma4:e2b

# 3. 在 server/.env 设
#   LLM_JUDGE_ENABLED=true
#   OLLAMA_HOST=http://localhost:11434
#   LLM_JUDGE_MODEL=gemma4:e2b
#   LLM_JUDGE_MAX_PER_DETECTION=3
#   LLM_JUDGE_TIMEOUT_MS=5000

# 4. 重启后端
npm run dev:server
```

若 Ollama 不可达，judge 自动 fallback 为「保守不放过」，主流程不挂；前端仍显示规则命中，仅少 AI 角标。中文判定不理想时把 `LLM_JUDGE_MODEL` 切到 `qwen2.5:3b` 即可。

**测试页**：admin 登录后侧边栏会显示「AI 复核测试」菜单（路径 `/llm-test`），可粘贴任意文本快速观察检测全链路（规则命中 / 置信度 / AI 复核判定 / 耗时）。

## 目录结构

```text
text-guard/
├── client/                       React 前端
│   └── src/
│       ├── components/
│       │   ├── Permission.tsx       按钮权限包装
│       │   ├── RequirePermission.tsx 路由权限保护
│       │   └── Layout/AppLayout.tsx  动态菜单
│       ├── hooks/usePermission.ts
│       ├── stores/useAuthStore.ts    持久化 token/permissions/menus
│       └── pages/                    各业务页面
├── server/                       Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts                   权限/菜单/敏感词初始化
│   └── src/
│       ├── engine/                   敏感词检测引擎
│       │   ├── detector.ts            literal/regex/credential 三路分发
│       │   ├── credential-rules.ts    内置凭证识别正则
│       │   └── ...
│       ├── middlewares/
│       │   ├── auth.middleware.ts
│       │   └── permission.middleware.ts  requirePermission + dataScope
│       ├── services/
│       │   └── permission.service.ts     RBAC 查询 + 60s 缓存
│       ├── controllers/
│       └── routes/
├── shared/                       前后端共享类型
├── init.sql                      整库初始化（与 Prisma 同步维护）
└── package.json                  npm workspaces 根
```

## 常用脚本

| 命令 | 作用 |
|------|------|
| `npm run dev:server` | 启动后端开发服 (tsx watch, :3000) |
| `npm run dev:client` | 启动前端开发服 (vite, :5173) |
| `npm run build` | 顺序构建 shared → server → client |
| `npm run typecheck` | 三个包统一 tsc --noEmit |
| `npm run prisma:generate` | 重新生成 Prisma Client |
| `npm run prisma:migrate` | 本地开发用，新建迁移 |
| `npm run seed` | 重跑 `prisma/seed.ts` |

后端单独跑测试：

```pwsh
cd server
npm test
```

当前包含 27 条用例，覆盖：字面/正则/凭证三种匹配模式、白名单、全角/零宽字符归一化、风险评分、合并重叠区间等。

## 端到端验证清单

1. 用 `editor / editor123` 登录，左侧菜单应仅显示「工作台 / 内容管理」
2. URL 手工改成 `/sensitive-words`，应自动跳回 `/dashboard`
3. 内容列表里只能看到 editor 自己创建的条目，不显示 admin 的
4. 进入内容编辑页，输入 `账号 admin 密码 admin123`，正文下方应实时高亮 credential 命中
5. 切到 `admin / admin123`，进入敏感词页新增一条 `matchType=regex` 词条，故意写非法正则（如 `(unclosed`）会被前端表单校验拦截
6. curl 直接打后端：editor 拿到的 token 请求 `/api/sensitive-words` 应返回 403；请求 `/api/auth/menu` 应只返回 2 条菜单

## 部署提示

- 生产环境务必把 `JWT_SECRET` 改成长随机串（否则启动会失败）
- 前端 `npm run build` 后产物落到 `client/dist/`，由后端 `app.ts` 内的 `express.static` 兜底，可以单进程对外暴露
- 默认对 `/api/auth/login` 启用了 15 分钟 20 次的限流，按 ip + username 隔离
- 权限缓存是内存级（60s），多实例部署时考虑接入 Redis 或缩短缓存窗口

## 默认端口

| 服务 | 端口 |
|------|------|
| 后端 API | 3000 |
| 前端 Vite | 5173 |
