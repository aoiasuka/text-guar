import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import path from 'node:path';
import router from './routes/index.js';
import { rebuildDetector } from './services/sensitive.service.js';
import { fail } from './utils/response.js';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ code: 200, message: 'ok', data: true }));
app.use('/api', router);

const staticDir = path.resolve(process.cwd(), '../client/dist');
app.use(express.static(staticDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'), (error) => {
    if (error) res.status(404).send('Not Found');
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : '服务器内部错误';
  return fail(res, 500, message);
});

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
