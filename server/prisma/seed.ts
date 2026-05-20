import bcrypt from 'bcryptjs';
import { PrismaClient, PermType, SensitiveMatchType, type Role } from '@prisma/client';
import { detector } from '../src/engine/detector.js';

const prisma = new PrismaClient();

interface PermissionSeed {
  code: string;
  name: string;
  module: string;
  type: PermType;
  description?: string;
}

const permissions: PermissionSeed[] = [
  { code: 'dashboard:view', name: '查看工作台', module: 'dashboard', type: PermType.menu },

  { code: 'content:list', name: '内容列表', module: 'content', type: PermType.menu },
  { code: 'content:detail', name: '内容详情', module: 'content', type: PermType.action },
  { code: 'content:create', name: '新建内容', module: 'content', type: PermType.action },
  { code: 'content:update', name: '编辑内容', module: 'content', type: PermType.action },
  { code: 'content:delete', name: '删除内容', module: 'content', type: PermType.action },
  { code: 'content:submit', name: '提交审核', module: 'content', type: PermType.action },
  { code: 'content:pin', name: '内容置顶', module: 'content', type: PermType.action },
  { code: 'content:detect', name: '调用检测', module: 'content', type: PermType.action },

  { code: 'sensitive:list', name: '敏感词列表', module: 'sensitive', type: PermType.menu },
  { code: 'sensitive:create', name: '新增敏感词', module: 'sensitive', type: PermType.action },
  { code: 'sensitive:update', name: '编辑敏感词', module: 'sensitive', type: PermType.action },
  { code: 'sensitive:delete', name: '删除敏感词', module: 'sensitive', type: PermType.action },
  { code: 'sensitive:toggle', name: '启用/禁用敏感词', module: 'sensitive', type: PermType.action },

  { code: 'review:pending', name: '待审核队列', module: 'review', type: PermType.menu },
  { code: 'review:history', name: '审核历史', module: 'review', type: PermType.action },
  { code: 'review:approve', name: '审核通过', module: 'review', type: PermType.action },
  { code: 'review:reject', name: '审核驳回', module: 'review', type: PermType.action },
  { code: 'review:batch', name: '批量审核', module: 'review', type: PermType.action },

  { code: 'report:stats', name: '查看统计', module: 'report', type: PermType.menu },
  { code: 'report:export', name: '导出报表', module: 'report', type: PermType.action },

  { code: 'log:list', name: '查看操作日志', module: 'log', type: PermType.menu },

  { code: 'user:register', name: '注册用户', module: 'user', type: PermType.action },
  { code: 'user:password', name: '修改密码', module: 'user', type: PermType.action },

  { code: 'content:data:any', name: '内容数据-全部', module: 'content', type: PermType.data },
  { code: 'content:data:own', name: '内容数据-仅自己', module: 'content', type: PermType.data },
  { code: 'log:data:any', name: '日志数据-全部', module: 'log', type: PermType.data },
  { code: 'log:data:own', name: '日志数据-仅自己', module: 'log', type: PermType.data },
];

const editorPermissions = new Set([
  'dashboard:view',
  'content:list',
  'content:detail',
  'content:create',
  'content:update',
  'content:delete',
  'content:submit',
  'content:detect',
  'user:password',
  'content:data:own',
]);

interface MenuSeed {
  name: string;
  path: string;
  icon: string;
  permissionCode: string;
  sort: number;
}

const menus: MenuSeed[] = [
  { name: '工作台', path: '/dashboard', icon: 'DashboardOutlined', permissionCode: 'dashboard:view', sort: 10 },
  { name: '内容管理', path: '/contents', icon: 'FileTextOutlined', permissionCode: 'content:list', sort: 20 },
  { name: '敏感词库', path: '/sensitive-words', icon: 'SafetyCertificateOutlined', permissionCode: 'sensitive:list', sort: 30 },
  { name: '审核工作台', path: '/review', icon: 'AuditOutlined', permissionCode: 'review:pending', sort: 40 },
  { name: '审核报表', path: '/reports', icon: 'BarChartOutlined', permissionCode: 'report:stats', sort: 50 },
  { name: '操作日志', path: '/logs', icon: 'HistoryOutlined', permissionCode: 'log:list', sort: 60 },
];

interface SensitiveSeed {
  word: string;
  matchType: SensitiveMatchType;
  pattern?: string;
  riskLevel: 'low' | 'medium' | 'high';
  replacement: string;
  category: string;
}

const sensitiveWords: SensitiveSeed[] = [
  { word: '泄密', matchType: SensitiveMatchType.literal, riskLevel: 'high', replacement: '[保密信息]', category: '安全' },
  { word: '攻击', matchType: SensitiveMatchType.literal, riskLevel: 'high', replacement: '***', category: '安全' },
  { word: '暴力', matchType: SensitiveMatchType.literal, riskLevel: 'high', replacement: '***', category: '违规' },
  { word: '诈骗', matchType: SensitiveMatchType.literal, riskLevel: 'high', replacement: '***', category: '违规' },
  { word: '赌博', matchType: SensitiveMatchType.literal, riskLevel: 'high', replacement: '***', category: '违规' },
  { word: '违法', matchType: SensitiveMatchType.literal, riskLevel: 'high', replacement: '***', category: '违规' },
  { word: '内部资料', matchType: SensitiveMatchType.literal, riskLevel: 'medium', replacement: '[内部资料]', category: '保密' },
  { word: '客户名单', matchType: SensitiveMatchType.literal, riskLevel: 'medium', replacement: '[客户名单]', category: '保密' },
  { word: '账号密码', matchType: SensitiveMatchType.credential, riskLevel: 'medium', replacement: '[凭证]', category: '隐私' },
  { word: '转账', matchType: SensitiveMatchType.literal, riskLevel: 'medium', replacement: '***', category: '金融' },
  { word: '推广', matchType: SensitiveMatchType.literal, riskLevel: 'low', replacement: '***', category: '营销' },
  { word: '广告', matchType: SensitiveMatchType.literal, riskLevel: 'low', replacement: '***', category: '营销' },
  { word: '测试敏感词', matchType: SensitiveMatchType.literal, riskLevel: 'low', replacement: '***', category: '测试' },
  {
    word: '弱密码',
    matchType: SensitiveMatchType.regex,
    pattern: '(?i)(?:password|passwd|pwd|pass)\\s*[:=]\\s*(?:123456|admin|admin123|root|root123|password|qwerty)',
    riskLevel: 'high',
    replacement: '[弱密码]',
    category: '隐私',
  },
];

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
    body: '文档中涉及客户名单，账号 admin 密码 admin123，需要管理员确认后再发布。',
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

async function seedPermissionsAndMenus() {
  const codeToId = new Map<string, number>();
  for (const perm of permissions) {
    const saved = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, module: perm.module, type: perm.type, description: perm.description },
      create: perm,
    });
    codeToId.set(perm.code, saved.id);
  }

  const adminAssignments = permissions.map((p) => ({ role: 'admin' as Role, permissionId: codeToId.get(p.code)! }));
  const editorAssignments = permissions
    .filter((p) => editorPermissions.has(p.code))
    .map((p) => ({ role: 'editor' as Role, permissionId: codeToId.get(p.code)! }));

  await prisma.rolePermission.deleteMany();
  await prisma.rolePermission.createMany({ data: [...adminAssignments, ...editorAssignments] });

  for (const menu of menus) {
    const permissionId = codeToId.get(menu.permissionCode);
    await prisma.menu.upsert({
      where: { id: menus.indexOf(menu) + 1 },
      update: { name: menu.name, path: menu.path, icon: menu.icon, permissionId, sort: menu.sort, visible: true },
      create: { name: menu.name, path: menu.path, icon: menu.icon, permissionId, sort: menu.sort, visible: true },
    });
  }
}

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

  await seedPermissionsAndMenus();

  for (const item of sensitiveWords) {
    await prisma.sensitiveWord.upsert({
      where: { word: item.word },
      update: {
        matchType: item.matchType,
        pattern: item.pattern,
        riskLevel: item.riskLevel,
        replacement: item.replacement,
        category: item.category,
        enabled: true,
      },
      create: {
        word: item.word,
        matchType: item.matchType,
        pattern: item.pattern,
        riskLevel: item.riskLevel,
        replacement: item.replacement,
        category: item.category,
        enabled: true,
      },
    });
  }

  const dbWords = await prisma.sensitiveWord.findMany({ where: { enabled: true } });
  detector.rebuild(
    dbWords.map((item) => ({
      word: item.word,
      matchType: item.matchType,
      pattern: item.pattern,
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
        detail: JSON.stringify({
          message: '初始化演示数据',
          permissions: permissions.length,
          menus: menus.length,
          words: sensitiveWords.length,
          samples: samples.length,
        }),
      },
    });
  }

  console.log(
    `Seed 完成：管理员=${admin.username}，编辑=${editor.username}，权限=${permissions.length} 条，菜单=${menus.length} 条，敏感词=${sensitiveWords.length} 条，示例内容=${samples.length} 篇`,
  );
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
