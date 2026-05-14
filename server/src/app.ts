import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import path from 'node:path';
import router from './routes/index.js';
import { rebuildDetector } from './services/sensitive.service.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { rateLimit, securityHeaders } from './middlewares/security.middleware.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me')) {
  console.error('[启动失败] 生产环境必须设置 JWT_SECRET 环境变量');
  process.exit(1);
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(securityHeaders);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(isProduction ? 'combined' : 'dev'));

const generalLimiter = rateLimit({ windowMs: 60_000, max: 300 });
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  message: '登录尝试过多，请 15 分钟后重试',
  keyGenerator: (req) => `auth|${req.ip}`,
});

app.get('/api/health', (_req, res) => res.json({ code: 200, message: 'ok', data: true }));
app.use('/api/auth/login', authLimiter);
app.use('/api', generalLimiter, router);

const staticDir = path.resolve(process.cwd(), '../client/dist');
app.use(express.static(staticDir));
app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'), (error) => {
    if (error) res.status(404).send('Not Found');
  });
});

app.use('/api/*', notFoundHandler);
app.use(errorHandler);

rebuildDetector()
  .catch((error) => {
    console.warn('敏感词检测器初始化失败，请检查数据库连接：', error.message);
  })
  .finally(() => {
    app.listen(port, () => {
      console.log(`Text Guard API listening on http://localhost:${port}`);
    });
  });

export default app;
