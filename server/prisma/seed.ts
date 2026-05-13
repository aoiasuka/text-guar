import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

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

  for (const [word, riskLevel, replacement, category] of words) {
    await prisma.sensitiveWord.upsert({
      where: { word },
      update: { riskLevel, replacement, category, enabled: true },
      create: { word, riskLevel, replacement, category, enabled: true },
    });
  }

  const samples = [
    {
      title: '平台内容发布规范',
      body: '这是一篇正常的内容发布规范，适合直接提交审核。',
      category: '公告',
      status: 'published',
    },
    {
      title: '活动推广文案',
      body: '本周活动推广内容包含广告字样，需要低风险替换。',
      category: '营销',
      status: 'draft',
    },
    {
      title: '客户资料处理说明',
      body: '文档中涉及客户名单和账号密码，需要管理员确认后再发布。',
      category: '合规',
      status: 'pending',
    },
    {
      title: '异常内容示例',
      body: '该内容包含泄密和攻击等高风险词，应拒绝发布。',
      category: '安全',
      status: 'rejected',
    },
  ] as const;

  for (const item of samples) {
    await prisma.content.create({
      data: {
        title: item.title,
        body: item.body,
        filteredBody: item.body,
        category: item.category,
        status: item.status,
        riskLevel: 'low',
        riskScore: 0,
        authorId: editor.id,
      },
    });
  }

  await prisma.operationLog.create({
    data: {
      userId: admin.id,
      action: 'seed',
      targetType: 'system',
      detail: '初始化演示数据',
    },
  });
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
