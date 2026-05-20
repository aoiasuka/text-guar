-- =============================================================================
-- 数据库初始化构建脚本 (MySQL 8.0+)
-- 系统名称：文本内容管理与敏感信息审核系统 (Text Guard)
-- 字符集：utf8mb4 (支持表情及完整中文字符集)
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. 创建并使用数据库
-- -----------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `text_guard`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `text_guard`;

-- -----------------------------------------------------------------------------
-- 2. 清理旧表（若存在，按外键依赖逆序删除）
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS `operation_logs`;
DROP TABLE IF EXISTS `reviews`;
DROP TABLE IF EXISTS `contents`;
DROP TABLE IF EXISTS `sensitive_words`;
DROP TABLE IF EXISTS `menus`;
DROP TABLE IF EXISTS `role_permissions`;
DROP TABLE IF EXISTS `permissions`;
DROP TABLE IF EXISTS `users`;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- 3. 创建表结构
-- -----------------------------------------------------------------------------

-- 3.1 用户表 (users)
CREATE TABLE `users` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `username` VARCHAR(50) NOT NULL COMMENT '用户名（唯一）',
  `password_hash` VARCHAR(255) NOT NULL COMMENT '加盐哈希密码',
  `role` ENUM('admin', 'editor') NOT NULL DEFAULT 'editor' COMMENT '角色：管理员(admin)/编辑员(editor)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',

  UNIQUE INDEX `users_username_key`(`username`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户表';

-- 3.2 内容数据表 (contents)
CREATE TABLE `contents` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '内容ID',
  `title` VARCHAR(200) NOT NULL COMMENT '内容标题',
  `body` TEXT NOT NULL COMMENT '原始内容',
  `filtered_body` TEXT NOT NULL COMMENT '敏感词过滤替换后的内容',
  `category` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '内容分类',
  `status` ENUM('draft', 'pending', 'published', 'rejected') NOT NULL DEFAULT 'draft' COMMENT '状态：草稿(draft)/待审核(pending)/已发布(published)/驳回(rejected)',
  `risk_level` ENUM('low', 'medium', 'high') NULL COMMENT '风险等级：低(low)/中(medium)/高(high)',
  `risk_score` INTEGER NOT NULL DEFAULT 0 COMMENT '风险总评分',
  `detection_result` JSON NULL COMMENT '敏感词详细匹配和策略的 JSON 报告',
  `is_pinned` BOOLEAN NOT NULL DEFAULT false COMMENT '是否置顶',
  `author_id` INTEGER NOT NULL COMMENT '作者用户ID',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',

  INDEX `contents_status_created_at_idx`(`status`, `created_at`),
  INDEX `contents_risk_level_idx`(`risk_level`),
  INDEX `contents_author_id_status_idx`(`author_id`, `status`),
  INDEX `contents_category_idx`(`category`),
  INDEX `contents_is_pinned_created_at_idx`(`is_pinned`, `created_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内容文章表';

-- 3.3 敏感词库表 (sensitive_words)
CREATE TABLE `sensitive_words` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '敏感词ID',
  `word` VARCHAR(200) NOT NULL COMMENT '敏感词条/规则名',
  `match_type` ENUM('literal', 'regex', 'credential') NOT NULL DEFAULT 'literal' COMMENT '匹配模式：字面/正则/凭证',
  `pattern` VARCHAR(500) NULL COMMENT '匹配模式=regex 时存储自定义正则；literal/credential 留空',
  `risk_level` ENUM('low', 'medium', 'high') NOT NULL COMMENT '风险等级：低(low)/中(medium)/高(high)',
  `replacement` VARCHAR(100) NOT NULL DEFAULT '***' COMMENT '替换词/脱敏显示词',
  `category` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '敏感词分类',
  `enabled` BOOLEAN NOT NULL DEFAULT true COMMENT '是否启用',
  `version` INTEGER NOT NULL DEFAULT 1 COMMENT '规则版本号，每次更新自增',
  `base_confidence` DOUBLE NOT NULL DEFAULT 1.0 COMMENT '基础置信度上限 0-1',
  `variant_match` BOOLEAN NOT NULL DEFAULT true COMMENT '是否启用反绕过变体匹配',
  `context_scope` ENUM('strict', 'lenient', 'global') NOT NULL DEFAULT 'strict' COMMENT '上下文判定范围',
  `positive_samples` TEXT NULL COMMENT '应命中样本 JSON 数组',
  `negative_samples` TEXT NULL COMMENT '不应命中样本 JSON 数组',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',

  UNIQUE INDEX `sensitive_words_word_key`(`word`),
  INDEX `sensitive_words_enabled_idx`(`enabled`),
  INDEX `sensitive_words_enabled_risk_level_idx`(`enabled`, `risk_level`),
  INDEX `sensitive_words_enabled_match_type_idx`(`enabled`, `match_type`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='敏感词库';

-- 3.4 内容审核表 (reviews)
CREATE TABLE `reviews` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '审核记录ID',
  `content_id` INTEGER NOT NULL COMMENT '被审核内容ID',
  `reviewer_id` INTEGER NOT NULL COMMENT '审核员ID (关联用户id)',
  `action` ENUM('approve', 'reject') NOT NULL COMMENT '审核操作：通过(approve)/驳回(reject)',
  `comment` TEXT NULL COMMENT '审核批注/驳回意见',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '审核时间',

  INDEX `reviews_content_id_idx`(`content_id`),
  INDEX `reviews_reviewer_id_created_at_idx`(`reviewer_id`, `created_at`),
  INDEX `reviews_action_created_at_idx`(`action`, `created_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内容审核记录表';

-- 3.5 操作审计日志表 (operation_logs)
CREATE TABLE `operation_logs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `user_id` INTEGER NOT NULL COMMENT '操作人ID',
  `action` VARCHAR(50) NOT NULL COMMENT '动作类型',
  `target_type` VARCHAR(50) NOT NULL COMMENT '操作对象模块',
  `target_id` INTEGER NULL COMMENT '操作对象关联ID',
  `detail` TEXT NULL COMMENT '详细操作载荷(JSON等)',
  `ip` VARCHAR(45) NULL COMMENT '操作人IP地址',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '记录时间',

  INDEX `operation_logs_user_id_created_at_idx`(`user_id`, `created_at`),
  INDEX `operation_logs_action_created_at_idx`(`action`, `created_at`),
  INDEX `operation_logs_target_type_target_id_idx`(`target_type`, `target_id`),
  INDEX `operation_logs_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统操作审计日志表';

-- 3.6 权限定义表 (permissions)
CREATE TABLE `permissions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '权限ID',
  `code` VARCHAR(80) NOT NULL COMMENT '权限码，格式 模块:动作（如 content:list、content:data:own）',
  `name` VARCHAR(80) NOT NULL COMMENT '权限显示名',
  `module` VARCHAR(40) NOT NULL COMMENT '所属模块',
  `type` ENUM('menu', 'action', 'data') NOT NULL COMMENT '权限类型：菜单/操作/数据',
  `description` VARCHAR(200) NULL COMMENT '权限说明',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',

  UNIQUE INDEX `permissions_code_key`(`code`),
  INDEX `permissions_module_idx`(`module`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限定义表';

-- 3.7 角色-权限关联表 (role_permissions)
CREATE TABLE `role_permissions` (
  `role` ENUM('admin', 'editor') NOT NULL COMMENT '角色',
  `permission_id` INTEGER NOT NULL COMMENT '权限ID',

  INDEX `role_permissions_permission_id_idx`(`permission_id`),
  PRIMARY KEY (`role`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色与权限的多对多关联';

-- 3.8 菜单表 (menus)
CREATE TABLE `menus` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
  `parent_id` INTEGER NULL COMMENT '父菜单ID',
  `name` VARCHAR(40) NOT NULL COMMENT '菜单显示名',
  `path` VARCHAR(120) NOT NULL COMMENT '前端路由路径',
  `icon` VARCHAR(40) NULL COMMENT '图标名称（@ant-design/icons）',
  `permission_id` INTEGER NULL COMMENT '关联权限ID（无权限码则所有人可见）',
  `sort` INTEGER NOT NULL DEFAULT 0 COMMENT '排序',
  `visible` BOOLEAN NOT NULL DEFAULT true COMMENT '是否可见',

  INDEX `menus_parent_id_idx`(`parent_id`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='前端菜单定义表';

-- 3.9 检测命中事件表 (detection_events)
CREATE TABLE `detection_events` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '事件ID',
  `content_id` INTEGER NULL COMMENT '关联内容ID（detect 接口为 NULL）',
  `word_id` INTEGER NULL COMMENT '关联敏感词规则ID（内置 PII 规则为 NULL）',
  `word_version` INTEGER NULL COMMENT '命中时的规则版本',
  `rule_source` VARCHAR(40) NOT NULL COMMENT '规则来源：literal/literal_variant/regex/credential/llm',
  `hit_text` VARCHAR(500) NOT NULL COMMENT '命中文本片段',
  `start` INTEGER NOT NULL COMMENT '命中起点',
  `end` INTEGER NOT NULL COMMENT '命中终点',
  `risk_level` ENUM('low', 'medium', 'high') NOT NULL COMMENT '风险等级',
  `confidence` DOUBLE NOT NULL COMMENT '置信度 0-1',
  `judge_verdict` VARCHAR(40) NULL COMMENT 'LLM 判定结论',
  `reason` VARCHAR(200) NULL COMMENT '置信度调整原因',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '事件时间',

  INDEX `detection_events_content_id_idx`(`content_id`),
  INDEX `detection_events_word_id_created_at_idx`(`word_id`, `created_at`),
  INDEX `detection_events_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='检测命中事件审计';


-- -----------------------------------------------------------------------------
-- 4. 添加外键约束
-- -----------------------------------------------------------------------------
ALTER TABLE `contents`
  ADD CONSTRAINT `contents_author_id_fkey`
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `reviews`
  ADD CONSTRAINT `reviews_content_id_fkey`
  FOREIGN KEY (`content_id`) REFERENCES `contents`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `reviews`
  ADD CONSTRAINT `reviews_reviewer_id_fkey`
  FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `operation_logs`
  ADD CONSTRAINT `operation_logs_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `role_permissions`
  ADD CONSTRAINT `role_permissions_permission_id_fkey`
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `menus`
  ADD CONSTRAINT `menus_parent_id_fkey`
  FOREIGN KEY (`parent_id`) REFERENCES `menus`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `menus`
  ADD CONSTRAINT `menus_permission_id_fkey`
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `detection_events`
  ADD CONSTRAINT `detection_events_word_id_fkey`
  FOREIGN KEY (`word_id`) REFERENCES `sensitive_words`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- 5. 初始化演示数据 (种子数据)
-- -----------------------------------------------------------------------------
START TRANSACTION;

-- 5.1 注入系统默认用户 (管理员和编辑账号，密码均为 pbkdf2/bcrypt 强度10 哈希)
-- admin / admin123
-- editor / editor123
INSERT INTO `users` (`id`, `username`, `password_hash`, `role`, `created_at`) VALUES
(1, 'admin', '$2a$10$wcatoa1ojtYfUgipKw8fbuIF3AMs7Mk8U69Q9.XfQq8ksVtLjpk8e', 'admin', NOW(3)),
(2, 'editor', '$2a$10$ZJNlAcZeDrMGlrIdAV0AZOD7WqilndrL2MSHlaRcnf2iLzos23gPe', 'editor', NOW(3));

-- 5.2 注入权限定义
INSERT INTO `permissions` (`id`, `code`, `name`, `module`, `type`, `description`, `created_at`) VALUES
(1,  'dashboard:view',       '查看工作台',          'dashboard', 'menu',   NULL, NOW(3)),
(2,  'content:list',         '内容列表',            'content',   'menu',   NULL, NOW(3)),
(3,  'content:detail',       '内容详情',            'content',   'action', NULL, NOW(3)),
(4,  'content:create',       '新建内容',            'content',   'action', NULL, NOW(3)),
(5,  'content:update',       '编辑内容',            'content',   'action', NULL, NOW(3)),
(6,  'content:delete',       '删除内容',            'content',   'action', NULL, NOW(3)),
(7,  'content:submit',       '提交审核',            'content',   'action', NULL, NOW(3)),
(8,  'content:pin',          '内容置顶',            'content',   'action', NULL, NOW(3)),
(9,  'content:detect',       '调用检测',            'content',   'action', NULL, NOW(3)),
(10, 'sensitive:list',       '敏感词列表',          'sensitive', 'menu',   NULL, NOW(3)),
(11, 'sensitive:create',     '新增敏感词',          'sensitive', 'action', NULL, NOW(3)),
(12, 'sensitive:update',     '编辑敏感词',          'sensitive', 'action', NULL, NOW(3)),
(13, 'sensitive:delete',     '删除敏感词',          'sensitive', 'action', NULL, NOW(3)),
(14, 'sensitive:toggle',     '启用/禁用敏感词',     'sensitive', 'action', NULL, NOW(3)),
(15, 'review:pending',       '待审核队列',          'review',    'menu',   NULL, NOW(3)),
(16, 'review:history',       '审核历史',            'review',    'action', NULL, NOW(3)),
(17, 'review:approve',       '审核通过',            'review',    'action', NULL, NOW(3)),
(18, 'review:reject',        '审核驳回',            'review',    'action', NULL, NOW(3)),
(19, 'review:batch',         '批量审核',            'review',    'action', NULL, NOW(3)),
(20, 'report:stats',         '查看统计',            'report',    'menu',   NULL, NOW(3)),
(21, 'report:export',        '导出报表',            'report',    'action', NULL, NOW(3)),
(22, 'log:list',             '查看操作日志',        'log',       'menu',   NULL, NOW(3)),
(23, 'user:register',        '注册用户',            'user',      'action', NULL, NOW(3)),
(24, 'user:password',        '修改密码',            'user',      'action', NULL, NOW(3)),
(25, 'content:data:any',     '内容数据-全部',       'content',   'data',   NULL, NOW(3)),
(26, 'content:data:own',     '内容数据-仅自己',     'content',   'data',   NULL, NOW(3)),
(27, 'log:data:any',         '日志数据-全部',       'log',       'data',   NULL, NOW(3)),
(28, 'log:data:own',         '日志数据-仅自己',     'log',       'data',   NULL, NOW(3)),
(29, 'sensitive:event:view', '查看规则命中审计',    'sensitive', 'action', NULL, NOW(3)),
(30, 'sensitive:test',       '测试敏感词规则',      'sensitive', 'action', NULL, NOW(3));

-- 5.3 注入角色-权限绑定
-- admin: 拥有除 content:data:own / log:data:own 外的全部权限
INSERT INTO `role_permissions` (`role`, `permission_id`) VALUES
('admin', 1),  ('admin', 2),  ('admin', 3),  ('admin', 4),  ('admin', 5),  ('admin', 6),  ('admin', 7),
('admin', 8),  ('admin', 9),  ('admin', 10), ('admin', 11), ('admin', 12), ('admin', 13), ('admin', 14),
('admin', 15), ('admin', 16), ('admin', 17), ('admin', 18), ('admin', 19), ('admin', 20), ('admin', 21),
('admin', 22), ('admin', 23), ('admin', 24), ('admin', 25), ('admin', 27), ('admin', 29), ('admin', 30);

-- editor: dashboard/content 基础 + 修改密码 + 仅看自己的数据
INSERT INTO `role_permissions` (`role`, `permission_id`) VALUES
('editor', 1),  ('editor', 2),  ('editor', 3),  ('editor', 4),  ('editor', 5),  ('editor', 6),  ('editor', 7),
('editor', 9),  ('editor', 24), ('editor', 26);

-- 5.4 注入菜单
INSERT INTO `menus` (`id`, `parent_id`, `name`, `path`, `icon`, `permission_id`, `sort`, `visible`) VALUES
(1, NULL, '工作台',       '/dashboard',       'DashboardOutlined',          1,  10, true),
(2, NULL, '内容管理',     '/contents',        'FileTextOutlined',           2,  20, true),
(3, NULL, '敏感词库',     '/sensitive-words', 'SafetyCertificateOutlined',  10, 30, true),
(4, NULL, '审核工作台',   '/review',          'AuditOutlined',              15, 40, true),
(5, NULL, '审核报表',     '/reports',         'BarChartOutlined',           20, 50, true),
(6, NULL, '操作日志',     '/logs',            'HistoryOutlined',            22, 60, true);

-- 5.5 注入系统初始化敏感词 (14 条)
INSERT INTO `sensitive_words` (`id`, `word`, `match_type`, `pattern`, `risk_level`, `replacement`, `category`, `enabled`, `positive_samples`, `negative_samples`, `created_at`, `updated_at`) VALUES
(1,  '泄密',         'literal',    NULL,                                                                                                          'high',   '[保密信息]', '安全', true, '["公司机密被泄密","他向竞争对手泄密"]',                                       '["保密协议"]',                                                  NOW(3), NOW(3)),
(2,  '攻击',         'literal',    NULL,                                                                                                          'high',   '***',        '安全', true, '["黑客攻击系统","发起网络攻击"]',                                            '["攻击力很强","攻克难题"]',                                       NOW(3), NOW(3)),
(3,  '暴力',         'literal',    NULL,                                                                                                          'high',   '***',        '违规', true, '["实施暴力","暴力倾向"]',                                                    '["暴力美学讨论"]',                                                NOW(3), NOW(3)),
(4,  '诈骗',         'literal',    NULL,                                                                                                          'high',   '***',        '违规', true, '["诈骗团伙","识破诈骗"]',                                                    '["反诈骗宣传"]',                                                  NOW(3), NOW(3)),
(5,  '赌博',         'literal',    NULL,                                                                                                          'high',   '***',        '违规', true, '["他在赌博","组织赌博"]',                                                    '["赌一把","赌徒心态"]',                                           NOW(3), NOW(3)),
(6,  '违法',         'literal',    NULL,                                                                                                          'high',   '***',        '违规', true, NULL,                                                                          NULL,                                                              NOW(3), NOW(3)),
(7,  '内部资料',     'literal',    NULL,                                                                                                          'medium', '[内部资料]', '保密', true, NULL,                                                                          NULL,                                                              NOW(3), NOW(3)),
(8,  '客户名单',     'literal',    NULL,                                                                                                          'medium', '[客户名单]', '保密', true, NULL,                                                                          NULL,                                                              NOW(3), NOW(3)),
(9,  '账号密码',     'credential', NULL,                                                                                                          'medium', '[凭证]',     '隐私', true, '["账号 admin 密码 admin123","admin/admin123","password=admin123"]',          '["文档涉及账号密码字样"]',                                        NOW(3), NOW(3)),
(10, '转账',         'literal',    NULL,                                                                                                          'medium', '***',        '金融', true, NULL,                                                                          NULL,                                                              NOW(3), NOW(3)),
(11, '推广',         'literal',    NULL,                                                                                                          'low',    '***',        '营销', true, NULL,                                                                          NULL,                                                              NOW(3), NOW(3)),
(12, '广告',         'literal',    NULL,                                                                                                          'low',    '***',        '营销', true, NULL,                                                                          NULL,                                                              NOW(3), NOW(3)),
(13, '测试敏感词',   'literal',    NULL,                                                                                                          'low',    '***',        '测试', true, NULL,                                                                          NULL,                                                              NOW(3), NOW(3)),
(14, '弱密码',       'regex',      '(?i)(?:password|passwd|pwd|pass)\\s*[:=]\\s*(?:123456|admin|admin123|root|root123|password|qwerty)',         'high',   '[弱密码]',   '隐私', true, '["password=123456","pwd: admin"]',                                            '["请勿使用弱密码"]',                                              NOW(3), NOW(3));

-- 5.6 注入演示内容 (4 篇，覆盖各类状态与预置检测结果)
INSERT INTO `contents` (`id`, `title`, `body`, `filtered_body`, `category`, `status`, `risk_level`, `risk_score`, `detection_result`, `is_pinned`, `author_id`, `created_at`, `updated_at`) VALUES
(
  1,
  '平台内容发布规范',
  '这是一篇正常的内容发布规范，适合直接提交审核。',
  '这是一篇正常的内容发布规范，适合直接提交审核。',
  '公告',
  'published',
  'low',
  0,
  '{"score": 0, "level": "low", "matches": [], "strategy": "replace", "summary": "未发现敏感信息", "filteredText": "这是一篇正常的内容发布规范，适合直接提交审核。"}' ,
  false,
  2,
  NOW(3),
  NOW(3)
),
(
  2,
  '活动推广文案',
  '本周活动推广内容包含广告字样，需要低风险替换。',
  '本周活动***内容包含***字样，需要低风险替换。',
  '营销',
  'draft',
  'low',
  10,
  '{"score": 10, "level": "low", "strategy": "replace", "summary": "命中 2 项风险，评分 10，建议策略：replace", "filteredText": "本周活动***内容包含***字样，需要低风险替换。", "matches": [{"end": 6, "type": "word", "word": "推广", "start": 4, "category": "营销", "riskLevel": "low", "replacement": "***"}, {"end": 12, "type": "word", "word": "广告", "start": 10, "category": "营销", "riskLevel": "low", "replacement": "***"}]}',
  false,
  2,
  NOW(3),
  NOW(3)
),
(
  3,
  '客户资料处理说明',
  '文档中涉及客户名单，账号 admin 密码 admin123，需要管理员确认后再发布。',
  '文档中涉及[客户名单]，[凭证]，需要管理员确认后再发布。',
  '合规',
  'pending',
  'medium',
  55,
  '{"score": 55, "level": "medium", "strategy": "warn", "summary": "命中 2 项风险，评分 55，建议策略：warn", "filteredText": "文档中涉及[客户名单]，[凭证]，需要管理员确认后再发布。", "matches": [{"end": 9, "type": "word", "word": "客户名单", "start": 5, "category": "保密", "riskLevel": "medium", "replacement": "[客户名单]"}, {"end": 30, "type": "regex", "word": "账号 admin 密码 admin123", "start": 10, "category": "隐私", "riskLevel": "medium", "replacement": "[凭证]"}]}',
  false,
  2,
  NOW(3),
  NOW(3)
),
(
  4,
  '异常内容示例',
  '该内容包含泄密和攻击等高风险词，应拒绝发布。',
  '该内容包含[保密信息]和***等高风险词，应拒绝发布。',
  '安全',
  'rejected',
  'high',
  80,
  '{"score": 80, "level": "high", "strategy": "reject", "summary": "命中 2 项风险，评分 80，建议策略：reject", "filteredText": "该内容包含[保密信息]和***等高风险词，应拒绝发布。", "matches": [{"end": 7, "type": "word", "word": "泄密", "start": 5, "category": "安全", "riskLevel": "high", "replacement": "[保密信息]"}, {"end": 10, "type": "word", "word": "攻击", "start": 8, "category": "安全", "riskLevel": "high", "replacement": "***"}]}',
  false,
  2,
  NOW(3),
  NOW(3)
);

-- 5.7 记录初始化动作到操作审计日志
INSERT INTO `operation_logs` (`id`, `user_id`, `action`, `target_type`, `target_id`, `detail`, `ip`, `created_at`) VALUES
(
  1,
  1,
  'seed',
  'system',
  NULL,
  '{"message": "初始化演示数据", "permissions": 28, "menus": 6, "words": 14, "samples": 4}',
  '127.0.0.1',
  NOW(3)
);

COMMIT;

-- =============================================================================
-- 脚本执行完成
-- =============================================================================
