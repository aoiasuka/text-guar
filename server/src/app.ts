import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import path from 'node:path';
import router from './routes/index.js';
import { rebuildDetector } from './services/sensitive.service.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { rateLimit, securityHeaders } from './middlewares/security.middleware.js';
import { requestId } from './middlewares/request-id.middleware.js';
import { prisma } from './utils/prisma.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const startedAt = new Date();

if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-me')) {
  console.error('[启动失败] 生产环境必须设置 JWT_SECRET 环境变量');
  process.exit(1);
}

app.set('trust proxy', 1);
app.disable('x-powered-by');

morgan.token('reqId', (req: express.Request) => req.requestId || '-');
const morganFormat = isProduction
  ? ':remote-addr :reqId :method :url :status :res[content-length] - :response-time ms'
  : ':method :url :status :response-time ms :reqId';

app.use(requestId);
app.use(securityHeaders);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true, exposedHeaders: ['X-Request-Id'] }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(morganFormat));

const generalLimiter = rateLimit({ windowMs: 60_000, max: 300 });
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 20,
  message: '登录尝试过多，请 15 分钟后重试',
  keyGenerator: (req) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : 'anonymous';
    return `auth|${req.ip}|${username}`;
  },
});

app.get('/api/health', async (req, res) => {
  const deep = req.query.deep === '1' || req.query.deep === 'true';
  const payload: Record<string, unknown> = {
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    startedAt: startedAt.toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
  if (deep) {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      payload.database = 'ok';
    } catch (error) {
      payload.status = 'degraded';
      payload.database = error instanceof Error ? error.message : 'unreachable';
      return res.status(503).json({ code: 503, message: 'degraded', data: payload, requestId: req.requestId });
    }
  }
  return res.json({ code: 200, message: 'ok', data: payload, requestId: req.requestId });
});

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

const shutdown = async (signal: string) => {
  console.log(`收到 ${signal}，开始优雅退出...`);
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.warn('Prisma 断开失败：', error);
  }
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export default app;
