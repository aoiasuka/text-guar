# 文本内容管理与敏感信息审核系统

按 `技术选型方案.md` 与 `实施方案.md` 实现的全栈 TypeScript 项目，包含内容管理、敏感词检测、审核流、日志审计与报表导出。

## 技术栈

- 前端：React 18、Vite、Ant Design 5、React Router、Zustand、Axios
- 后端：Node.js、Express、TypeScript、Prisma、MySQL、JWT、Zod
- 检测：AC 自动机风格多模式匹配 + 正则规则 + 风险评分
- 报表：`docx` 导出 Word，`exceljs` 导出 Excel

## 快速启动

```bash
npm install
copy server\.env.example server\.env
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev:server
npm run dev:client
```

默认账号：

- 管理员：`admin / admin123`
- 编辑：`editor / editor123`

## 目录

```text
client/   React 前端
server/   Express API + Prisma
shared/   前后端共享类型
```

后端默认端口 `3000`，前端默认端口 `5173`。
