import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { detector } from '../src/engine/detector.js';

const prisma = new PrismaClient();

const words = [
  ['泄密', 'high', '[保密信息]', '安全'],
  ['攻击', 'high', '***', '安全'],
  ['暴力', 'high', '***', '违规'],
  ['诈骗', 'high', '***', '违规'],
  ['赌博', 'high', '***', '违规'],
  ['违法', 'high', '***', '违规'],
  ['内部资料', 'medium', '[内部资料]', '保密'],
  ['客户名单', 'medium', '[客户名单]', '保密'],
  ['账号密码', 'medium', '[凭证]', '隐私'],
  ['转账', 'medium', '***', '金融'],
  ['推广', 'low', '***', '营销'],
  ['广告', 'low', '***', '营销'],
  ['测试敏感词', 'low', '***', '测试'],
] as const;

const samples = [
  {
    title: '平台内容发布规范',
    body: '这是一篇正常的内容发布规范，适合直接提交审核。',
    category: '公告',
    status: 'published' as const,
  },
  {
    title: '活动推广文案',
    body: '本周活动推广内容包含广告字样，需要低风险替换。',
    category: '营销',
    status: 'draft' as const,
  },
  {
    title: '客户资料处理说明',
    body: '文档中涉及客户名单和账号密码，需要管理员确认后再发布。',
    category: '合规',
    status: 'pending' as const,
  },
  {
    title: '异常内容示例',
    body: '该内容包含泄密和攻击等高风险词，应拒绝发布。',
    category: '安全',
    status: 'rejected' as const,
  },
];

async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const editorHash = await bcrypt.hash('editor123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash: adminHash, role: 'admin' },
  });

  const editor = await prisma.user.upsert({
    where: { username: 'editor' },
    update: {},
    create: { username: 'editor', passwordHash: editorHash, role: 'editor' },
  });

  await Promise.all(
    words.map(([word, riskLevel, replacement, category]) =>
      prisma.sensitiveWord.upsert({
        where: { word },
        update: { riskLevel, replacement, category, enabled: true },
        create: { word, riskLevel, replacement, category, enabled: true },
      }),
    ),
  );

  const dbWords = await prisma.sensitiveWord.findMany({ where: { enabled: true } });
  detector.rebuild(
    dbWords.map((item) => ({
      word: item.word,
      riskLevel: item.riskLevel,
      replacement: item.replacement,
      category: item.category,
    })),
  );

  for (const item of samples) {
    const existing = await prisma.content.findFirst({
      where: { title: item.title, authorId: editor.id },
      select: { id: true },
    });
    if (existing) continue;

    const detection = detector.detect(item.body);
    await prisma.content.create({
      data: {
        title: item.title,
        body: item.body,
        filteredBody: detection.filteredText,
        category: item.category,
        status: item.status,
        riskLevel: detection.level,
        riskScore: detection.score,
        detectionResult: detection as never,
        authorId: editor.id,
      },
    });
  }

  const seedLogged = await prisma.operationLog.findFirst({
    where: { action: 'seed', userId: admin.id },
    select: { id: true },
  });
  if (!seedLogged) {
    await prisma.operationLog.create({
      data: {
        userId: admin.id,
        action: 'seed',
        targetType: 'system',
        detail: JSON.stringify({ message: '初始化演示数据', words: words.length, samples: samples.length }),
      },
    });
  }

  console.log(`Seed 完成：管理员=${admin.username}，编辑=${editor.username}，敏感词=${words.length} 条，示例内容=${samples.length} 篇`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
