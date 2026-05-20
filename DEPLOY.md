# Text Guard 部署文档

文本内容管理与敏感信息审核系统的完整部署指引。覆盖开发环境与生产部署、依赖安装、数据库初始化、可选的本地 AI 复核（Ollama + Gemma），以及常见排错。

---

## 目录

- [一、环境前置](#一环境前置)
- [二、克隆与依赖安装](#二克隆与依赖安装)
- [三、数据库初始化](#三数据库初始化)
- [四、环境变量配置](#四环境变量配置)
- [五、启动开发环境](#五启动开发环境)
- [六、启用本地 AI 复核（可选）](#六启用本地-ai-复核可选)
- [七、生产环境部署](#七生产环境部署)
- [八、验证清单](#八验证清单)
- [九、常见问题排查](#九常见问题排查)
- [十、项目结构与端口](#十项目结构与端口)

---

## 一、环境前置

### 必装

| 软件 | 版本 | 安装方式 |
|------|------|----------|
| **Node.js** | ≥ 18.0（推荐 20 LTS） | <https://nodejs.org/zh-cn/download> |
| **npm** | ≥ 9（随 Node 一起装） | — |
| **Git** | 任意现代版本 | <https://git-scm.com/downloads> |
| **MySQL** | 8.0+ | <https://dev.mysql.com/downloads/mysql/> |

### 可选

| 软件 | 用途 | 安装方式 |
|------|------|----------|
| **Ollama** | 本地 AI 复核（Gemma 4 e2b） | <https://ollama.com/download> |

### 系统支持

- **Windows 10/11**（建议 PowerShell 7+；命令示例以 PowerShell 为主）
- **macOS 13+**
- **Ubuntu 22.04+ / Debian 12+**

### 版本自检

```pwsh
node -v       # v20.x.x 或 v18.x.x
npm -v        # 10.x.x 或 9.x.x
git --version
mysql --version  # 8.0.x 或更高
```

---

## 二、克隆与依赖安装

```pwsh
# 1. 克隆代码
git clone https://github.com/aoiasuka/text-guar.git
cd text-guar

# 2. 一键安装所有 workspace 依赖（client / server / shared 三个包）
npm install
```

> **这一步会自动安装的关键依赖**（约 600+ 个包，总 ~500MB）：
> 
> **后端**（`server/`）：
> - `express` `prisma` `@prisma/client` `zod` `bcryptjs` `jsonwebtoken` — Web/DB/校验/鉴权
> - `pinyin-pro` — 拼音反绕过
> - `@node-rs/jieba` — 中文分词（rust 预编译二进制，自动选平台版本）
> - `re2-wasm` — 正则安全沙箱（避免 ReDoS）
> - `docx` `exceljs` — 报表导出
> - `tsx` — TypeScript dev runtime
> 
> **前端**（`client/`）：
> - `react` `react-dom` `react-router-dom` — UI 框架
> - `antd` `@ant-design/icons` — 组件库
> - `zustand` `axios` `dayjs` — 状态/请求/时间
> - `vite` — 开发与构建工具

### 验证依赖装好

```pwsh
npm ls @node-rs/jieba re2-wasm pinyin-pro --workspaces 2>$null
```

应输出含 `@node-rs/jieba@2.x` / `re2-wasm@1.x` / `pinyin-pro@3.x` 的列表。

---

## 三、数据库初始化

提供 **两种等价方式**，二选一即可。

### 方式 A：用 `init.sql` 一次性建库（推荐，最简单）

`init.sql` 包含完整 DDL + 全部种子数据（用户/权限/菜单/敏感词/演示内容），独立维护、不依赖 Prisma。

```pwsh
# Windows（mysql 客户端通常在 "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"）
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -uroot -p -P3306 -h127.0.0.1 --default-character-set=utf8mb4 -e "source D:/path/to/text-guar/init.sql"

# macOS / Linux
mysql -uroot -p -P3306 -h127.0.0.1 --default-character-set=utf8mb4 < init.sql
```

> 提示：脚本内部会 `CREATE DATABASE IF NOT EXISTS text_guard`，无需先手动建库。

跑完后必须生成一次 Prisma Client（让后端拿到类型化客户端）：

```pwsh
cd server
npx prisma generate
cd ..
```

### 方式 B：用 Prisma migrate（适合开发者持续迭代 schema）

```pwsh
cd server
npx prisma generate          # 生成类型化客户端
npx prisma migrate deploy    # 应用 prisma/migrations 下所有迁移
npx prisma db seed           # 灌入 seed.ts 里的种子数据
cd ..
```

> Prisma migrate 与 `init.sql` 始终保持同步维护，schema 结构一致。新加 schema 改动时优先走 Prisma migrate 生成新迁移文件，再手工把 DDL 同步到 `init.sql`。

### 验证

```sql
USE text_guard;
SELECT COUNT(*) AS users FROM users;              -- 2
SELECT COUNT(*) AS perms FROM permissions;        -- 31
SELECT COUNT(*) AS menus FROM menus;              -- 7
SELECT COUNT(*) AS words FROM sensitive_words;    -- 14
SELECT COUNT(*) AS contents FROM contents;        -- 4
```

---

## 四、环境变量配置

```pwsh
copy server\.env.example server\.env
```

打开 `server\.env`，按需修改：

```ini
# ---- 数据库 ----
# 格式：mysql://用户名:密码@主机:端口/数据库名
DATABASE_URL="mysql://root:你的密码@localhost:3306/text_guard"

# ---- JWT ----
# 生产环境必须改成长随机串；否则后端启动会强制退出
JWT_SECRET="replace-with-a-long-random-secret-at-least-32-chars"
JWT_EXPIRES_IN="15m"

# ---- 后端 ----
PORT=3000
# 允许跨域的前端来源，开发环境填 vite 端口
CLIENT_ORIGIN="http://localhost:5173"

# ---- 本地 AI 复核（可选） ----
LLM_JUDGE_ENABLED=false                  # 默认关闭；启用见下一章
OLLAMA_HOST=http://localhost:11434
LLM_JUDGE_MODEL=gemma4:e2b
LLM_JUDGE_MAX_PER_DETECTION=10           # 单次检测最多并发判定多少条命中
LLM_JUDGE_TIMEOUT_MS=30000               # CPU 推理冷启动较慢，默认 30s
```

### 生成强 `JWT_SECRET` 的小技巧

```pwsh
# PowerShell
[System.Web.Security.Membership]::GeneratePassword(48, 0)
# 或
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

```bash
# macOS / Linux
openssl rand -base64 32
```

---

## 五、启动开发环境

两个终端分别启动后端与前端：

```pwsh
# 终端 1：后端 dev (tsx watch, :3000)
npm run dev:server
```

```pwsh
# 终端 2：前端 dev (vite, :5173)
npm run dev:client
```

成功后控制台会输出：

- 后端：`Text Guard API listening on http://localhost:3000`
- 前端：`VITE v5.x.x  ready in xxx ms` + `Local: http://localhost:5173/`

打开 <http://localhost:5173> ，用默认账号登录：

| 账号 | 密码 | 角色 |
|------|------|------|
| `admin` | `admin123` | 管理员（所有菜单） |
| `editor` | `editor123` | 编辑（仅工作台 + 内容管理） |

---

## 六、启用本地 AI 复核（可选）

让 AI 对每次检测做二次判定，识别词库外的隐性风险（如广告软文、辱骂、凭证泄漏等）。

### 步骤 1：安装 Ollama

下载并安装 <https://ollama.com/download>。装完后命令行能看到：

```pwsh
ollama --version    # ollama version 0.x.x
```

Ollama 装好会自动启动，监听 `http://localhost:11434`。

### 步骤 2：拉取模型

```pwsh
ollama pull gemma4:e2b
```

下载约 **1.5-2GB**，显存占用约 **2-3GB**（适配 6GB 以下显卡）。

也支持其它模型，命中率不理想时可换：

```pwsh
ollama pull qwen2.5:7b     # 中文判定明显更强（7GB 模型，需 ≥8GB 显存）
ollama pull qwen2.5:3b     # 折中（3GB 模型，4GB 显存）
```

### 步骤 3：打开开关

修改 `server/.env`：

```ini
LLM_JUDGE_ENABLED=true
LLM_JUDGE_MODEL=gemma4:e2b   # 如换模型同步修改
```

### 步骤 4：重启后端

```pwsh
# Ctrl+C 停掉之前的 dev:server，再重新跑
npm run dev:server
```

### 步骤 5：验证

登录 admin 账号 → 侧边栏「AI 复核测试」→ 顶部状态卡应显示：

- LLM 已启用 ✓
- Ollama 可达 OK (XXms)
- 目标模型 已安装

点击任意演示样本 → 「执行检测」→ 「AI 调用日志」面板应出现 trace 行，后端控制台同步打：

```
[llm-judge] → ollama POST /api/generate word="xxx" category="xxx" model="gemma4:e2b"
[llm-judge] ✓ word="xxx" → neutral duration=2310ms reason="..."
```

---

## 七、生产环境部署

### 单机部署（最简单）

```pwsh
# 1. 构建前端 + 后端
npm run build

# 2. 直接启动后端（已经 serve 前端 dist 静态文件）
cd server
$env:NODE_ENV='production'
node dist/app.js
```

后端 `app.ts` 内置 `express.static('../client/dist')`，单进程对外暴露 3000 端口即可同时提供 API 和前端。

### 用 PM2 守护进程（推荐）

```pwsh
npm install -g pm2

cd server
pm2 start dist/app.js --name text-guard --env production
pm2 save
pm2 startup    # 跟随系统启动（Linux/macOS）
```

常用命令：

```pwsh
pm2 status              # 看进程状态
pm2 logs text-guard     # 看日志
pm2 restart text-guard  # 重启
pm2 stop text-guard     # 停止
```

### 反向代理（Nginx 示例）

如果要走 80/443 端口或加 HTTPS：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 5m;     # 内容正文上限对应 express.json limit
    }
}
```

### 生产环境必做检查清单

- [ ] `JWT_SECRET` 改成 ≥32 位随机串
- [ ] `NODE_ENV=production`（否则 errorHandler 会回显完整异常信息）
- [ ] `DATABASE_URL` 用独立的 MySQL 账号（最小权限：仅 `text_guard` 库的 SELECT/INSERT/UPDATE/DELETE）
- [ ] `CLIENT_ORIGIN` 改为前端实际域名（默认 `true` 接受任意来源，生产环境不安全）
- [ ] Ollama 启用时 `LLM_JUDGE_TIMEOUT_MS` 按服务器实际算力调整（GPU 服务器可降到 5000）
- [ ] 数据库定期备份（特别是 `contents` / `detection_events` 表）
- [ ] 反向代理层加 HTTPS + 限流

---

## 八、验证清单

部署完成后按这个清单跑一遍：

### 后端健康

```pwsh
# 基础健康
curl http://localhost:3000/api/health
# 期望：{"code":200,"data":{"status":"ok",...}}

# 深度健康（带 DB 探活）
curl "http://localhost:3000/api/health?deep=1"
# 期望：{"data":{"database":"ok",...}}
```

### 登录与菜单

```pwsh
# 登录拿 token
$body = '{"username":"admin","password":"admin123"}'
$resp = Invoke-RestMethod -Method POST -Uri http://localhost:3000/api/auth/login -ContentType 'application/json' -Body $body
$token = $resp.data.token

# 拿菜单（应返回 7 个）
Invoke-RestMethod -Uri http://localhost:3000/api/auth/menu -Headers @{Authorization="Bearer $token"} | ConvertTo-Json -Depth 5
```

### 权限隔离

```pwsh
# editor 登录后拿菜单应只有 2 个（工作台 + 内容管理）
$body = '{"username":"editor","password":"editor123"}'
$resp = Invoke-RestMethod -Method POST -Uri http://localhost:3000/api/auth/login -ContentType 'application/json' -Body $body
$editorToken = $resp.data.token
Invoke-RestMethod -Uri http://localhost:3000/api/auth/menu -Headers @{Authorization="Bearer $editorToken"} | ConvertTo-Json -Depth 5

# editor 调敏感词接口应 403
Invoke-RestMethod -Uri http://localhost:3000/api/sensitive-words -Headers @{Authorization="Bearer $editorToken"}
```

### 检测端到端

浏览器登录 admin → 侧边栏「AI 复核测试」→ 输入：

| 输入文本 | 期望命中 |
|---|---|
| `他在赌博` | 字面命中"赌博"，confidence ≥ 0.5 |
| `请勿沉迷赌博` | reverse 上下文降权，可能丢弃 |
| `DU博、dǔbó、赌@博` | literal_variant 拼音/形近/噪声变体命中 |
| `用 admin/admin123 登录` | credential 模式命中 |
| `AKIAIOSFODNN7EXAMPLE` | credential.aws_access_key 命中 |
| `傻逼，操你妈`（启用 AI 后） | AI 全文兜底判 sensitive，category=AI:辱骂 |

---

## 九、常见问题排查

### Q1：`npx prisma generate` 报 `EPERM rename ... query_engine-windows.dll.node`

> 有 node 进程（之前的 dev:server）锁着 Prisma 引擎 DLL。

```pwsh
# 找出占用进程
Get-Process node -ErrorAction SilentlyContinue
# 看进程命令行确认是 tsx src/app.ts
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object Id, CommandLine

# kill 后重试
Stop-Process -Id <PID> -Force
npx prisma generate
```

### Q2：后端启动失败 `生产环境必须设置 JWT_SECRET 环境变量`

> 把 `JWT_SECRET` 改成非默认值且 ≥1 字符。生产环境强制此检查避免使用 demo 密钥。

### Q3：MySQL 连接失败 `ECONNREFUSED 127.0.0.1:3306`

```pwsh
# Windows
Get-Service MySQL*    # 检查 MySQL 服务状态
Start-Service MySQL80 # 启动（服务名按实际版本）

# macOS
brew services list
brew services start mysql

# Linux
sudo systemctl status mysql
sudo systemctl start mysql
```

或者 `.env` 里 `DATABASE_URL` 的端口/用户名/密码不对，对照 MySQL 实际配置修正。

### Q4：「AI 复核测试」页提示 `Ollama 可达 FAIL: fetch failed`

> Ollama 没启动或端口被改。

```pwsh
# 检查 ollama 是否在跑
curl http://localhost:11434/api/tags    # 应返回 {"models":[...]}

# 没在跑就启动
ollama serve    # 前台启动；Windows GUI 装的 ollama 重启电脑后会自启
```

### Q5：「AI 复核测试」trace 显示 `失败` + `This operation was aborted`

> AI 推理时间超过 `LLM_JUDGE_TIMEOUT_MS`。CPU 推理首次冷启动尤其慢。

```ini
# .env 调大超时，例如 60 秒
LLM_JUDGE_TIMEOUT_MS=60000
```

或者首次访问时手动预热模型（让模型常驻显存）：

```pwsh
ollama run gemma4:e2b "你好"
# 看到回复就关掉，模型已加载，后续调用就不会冷启动了
```

### Q6：前端访问菜单空白 / 接口 401

> token 过期了（默认 15 分钟）。重新登录即可，或在 `.env` 改 `JWT_EXPIRES_IN=8h`。

### Q7：`npm install` 在 `@node-rs/jieba` 卡住

> 拉 rust 预编译二进制需要网络。国内可换 npm 镜像：

```pwsh
npm config set registry https://registry.npmmirror.com
npm install
```

### Q8：重跑 `init.sql` 报 `Table 'detection_events' already exists`

> 老版本 `init.sql` 的 DROP 列表漏了该表。最新版本已修，确保用最新代码。

### Q9：`prisma db seed` 提示 `Cannot find module '@prisma/client'`

> 先跑 `npx prisma generate` 再 seed。

---

## 十、项目结构与端口

### 目录结构

```text
text-guar/
├── client/                       前端（React + Vite）
│   ├── src/
│   │   ├── App.tsx               路由
│   │   ├── components/
│   │   │   ├── Layout/AppLayout.tsx      动态菜单
│   │   │   ├── Permission.tsx            按钮权限包装
│   │   │   ├── RequirePermission.tsx     路由权限保护
│   │   │   ├── DetectResult.tsx          检测结果展示
│   │   │   └── HighlightedText.tsx       命中高亮
│   │   ├── hooks/usePermission.ts
│   │   ├── pages/
│   │   │   ├── Dashboard/                工作台
│   │   │   ├── Content/                  内容管理
│   │   │   ├── SensitiveWords/           敏感词库 + 审计
│   │   │   ├── Review/                   审核工作台
│   │   │   ├── Reports/                  审核报表
│   │   │   ├── Logs/                     操作日志
│   │   │   └── LLMTest/                  AI 复核测试
│   │   ├── services/api.ts
│   │   ├── stores/useAuthStore.ts
│   │   └── types/index.ts
│   └── package.json
├── server/                       后端（Express + Prisma）
│   ├── prisma/
│   │   ├── schema.prisma         数据模型定义
│   │   ├── migrations/           迁移历史
│   │   └── seed.ts               种子数据
│   ├── src/
│   │   ├── app.ts                启动入口
│   │   ├── engine/               检测引擎
│   │   │   ├── detector.ts                Aho-Corasick + 流水线总调度
│   │   │   ├── normalizer.ts              归一化 + 拼音/leet/形近 变体
│   │   │   ├── regex-rules.ts             11 条内置 PII 正则
│   │   │   ├── regex-safe.ts              re2-wasm 编译器
│   │   │   ├── credential-rules.ts        15 条凭证识别规则
│   │   │   ├── context-disambiguator.ts   jieba 分词 + 上下文打分
│   │   │   ├── risk-scorer.ts             置信度加权
│   │   │   ├── filter.ts                  命中替换
│   │   │   ├── whitelist.ts               URL 白名单
│   │   │   └── llm-judge.ts               本地 LLM 复核
│   │   ├── controllers/          HTTP 处理器
│   │   ├── services/             业务服务层
│   │   │   └── permission.service.ts      RBAC + 60s 缓存
│   │   ├── middlewares/
│   │   │   ├── auth.middleware.ts
│   │   │   └── permission.middleware.ts   requirePermission + dataScope
│   │   ├── routes/
│   │   └── types/express.d.ts
│   ├── tests/                    Node 内置测试（64 条）
│   └── package.json
├── shared/                       前后端共享 TS 类型
│   ├── src/index.ts
│   └── package.json
├── init.sql                      整库初始化（与 Prisma 同步维护）
├── DEPLOY.md                     本文档
├── README.md                     项目介绍
└── package.json                  npm workspaces 根
```

### 默认端口

| 服务 | 端口 | 用途 |
|------|------|------|
| 前端 dev（Vite） | 5173 | 开发模式 |
| 后端 API | 3000 | 生产模式同端口承载前端静态文件 |
| MySQL | 3306 | 默认 |
| Ollama | 11434 | 仅启用 AI 复核时需要 |

### 关键 npm scripts

| 命令 | 作用 |
|------|------|
| `npm install` | 一键装三个 workspace 依赖 |
| `npm run dev:server` | tsx watch 后端，文件变更自动重启 |
| `npm run dev:client` | vite 前端，浏览器 HMR |
| `npm run build` | shared → server → client 依次构建生产产物 |
| `npm run typecheck` | 三个 workspace 串行 tsc --noEmit |
| `npm run prisma:generate` | 生成 Prisma Client |
| `npm run prisma:migrate` | 本地开发新增迁移 |
| `npm run seed` | 重跑 seed.ts |
| `cd server && npm test` | 跑 64 条单测 |

---

## 附：升级现有部署到最新版

```pwsh
git pull
npm install                          # 安装新依赖
cd server
npx prisma generate                  # 更新 Prisma Client
npx prisma migrate deploy            # 应用新迁移（不影响现有数据）
cd ..
npm run build                        # 生产构建
pm2 restart text-guard               # 用 PM2 时
```

> 如果新增了菜单或权限码，需要 `npx prisma db seed` 重新跑一次种子（已有数据走 upsert 不会覆盖）。

---

## 许可与反馈

- 仓库：<https://github.com/aoiasuka/text-guar>
- Issues：在 GitHub 提交问题
