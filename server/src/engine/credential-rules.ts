import type { RiskLevel } from '@text-guard/shared';

// 结构化凭证识别规则：每条独立元信息（id/分类/风险/替换占位）
// 当词库中存在 matchType=credential 的记录时，detector 会用记录的 risk/replacement/category 覆盖这里的默认值
export interface CredentialRule {
  id: string;
  description: string;
  category: string;
  baseRisk: RiskLevel;
  defaultReplacement: string;
  pattern: RegExp;
}

export const credentialRules: CredentialRule[] = [
  // ===== 中英文账号密码组合（旧 4 条扩展+保留） =====
  {
    id: 'credential.username_password_separator',
    description: '常见账号关键字 + 分隔符 + 任意非空（admin/admin123、user=root）',
    category: '凭证-账密组合',
    baseRisk: 'medium',
    defaultReplacement: '[凭证]',
    pattern: /\b(?:admin|administrator|sysadmin|root|user|username|account|guest|test|demo|login)\b[\s\/:=\-|]+\S{3,40}/gi,
  },
  {
    id: 'credential.identifier_password_keyword',
    description: '任意标识 + 分隔符 + 密码关键字（login=admin123、xxx:password）',
    category: '凭证-账密组合',
    baseRisk: 'medium',
    defaultReplacement: '[凭证]',
    pattern: /\b\S{3,40}[\s\/:=\-|]+(?:password|passwd|pwd|pass|secret|token|admin123|root123|qwerty|123456)\b/gi,
  },
  {
    id: 'credential.password_field',
    description: '显式密码/secret 字段（password=xxx、pwd:yyy）',
    category: '凭证-账密组合',
    baseRisk: 'medium',
    defaultReplacement: '[凭证]',
    pattern: /\b(?:password|passwd|pwd|pass|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*\S{3,40}/gi,
  },
  {
    id: 'credential.chinese_username_password',
    description: '中文「账号 xxx 密码 yyy」表述',
    category: '凭证-账密组合',
    baseRisk: 'medium',
    defaultReplacement: '[凭证]',
    pattern: /(?:账号|账户|用户名|用户)[\s:：]*\S{2,40}[\s,，]+(?:密码|密钥|口令)[\s:：]*\S{3,40}/g,
  },

  // ===== 云服务密钥 =====
  {
    id: 'credential.aws_access_key',
    description: 'AWS Access Key ID（AKIA/ASIA/AGPA + 16 大写字母数字）',
    category: '凭证-云密钥',
    baseRisk: 'high',
    defaultReplacement: '[AWS_KEY]',
    pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16}\b/g,
  },
  {
    id: 'credential.aws_secret_key',
    description: 'AWS Secret Access Key（40 字符 base64-like，且前置 aws/secret 关键字）',
    category: '凭证-云密钥',
    baseRisk: 'high',
    defaultReplacement: '[AWS_SECRET]',
    pattern: /\b(?:aws[_-]?(?:secret[_-]?)?(?:access[_-]?)?key|secret[_-]?access[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9\/+=]{40}['"]?/gi,
  },
  {
    id: 'credential.google_api_key',
    description: 'Google API Key（AIza + 35 chars）',
    category: '凭证-云密钥',
    baseRisk: 'high',
    defaultReplacement: '[GOOGLE_KEY]',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },

  // ===== SaaS Token =====
  {
    id: 'credential.github_pat',
    description: 'GitHub Personal Access Token（ghp_/gho_/ghu_/ghs_/ghr_ 等）',
    category: '凭证-SaaS Token',
    baseRisk: 'high',
    defaultReplacement: '[GITHUB_PAT]',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b/g,
  },
  {
    id: 'credential.slack_token',
    description: 'Slack Token（xox[baprs]-）',
    category: '凭证-SaaS Token',
    baseRisk: 'high',
    defaultReplacement: '[SLACK_TOKEN]',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: 'credential.stripe_live_key',
    description: 'Stripe 生产密钥（sk_live_ + 24+ chars）',
    category: '凭证-SaaS Token',
    baseRisk: 'high',
    defaultReplacement: '[STRIPE_KEY]',
    pattern: /\bsk_live_[A-Za-z0-9]{24,}\b/g,
  },
  {
    id: 'credential.bearer_header',
    description: 'HTTP Bearer Token（Authorization: Bearer ...）',
    category: '凭证-Token',
    baseRisk: 'high',
    defaultReplacement: '[BEARER]',
    pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{16,}/gi,
  },
  {
    id: 'credential.jwt',
    description: 'JWT 三段式 token',
    category: '凭证-Token',
    baseRisk: 'high',
    defaultReplacement: '[JWT]',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },

  // ===== 密钥块 / 证书 =====
  {
    id: 'credential.private_key_block',
    description: 'PEM 私钥块（RSA/OPENSSH/EC/DSA/PRIVATE KEY）',
    category: '凭证-私钥',
    baseRisk: 'high',
    defaultReplacement: '[PRIVATE_KEY]',
    pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
  },
  {
    id: 'credential.certificate_block',
    description: 'PEM 证书块（CERTIFICATE）',
    category: '凭证-证书',
    baseRisk: 'medium',
    defaultReplacement: '[CERTIFICATE]',
    pattern: /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  },

  // ===== 哈希值（仅当 hash/password 关键字后才认） =====
  {
    id: 'credential.bcrypt_hash',
    description: 'bcrypt hash（$2a$/$2b$/$2y$ + 10/12 rounds + 53 chars）',
    category: '凭证-Hash',
    baseRisk: 'medium',
    defaultReplacement: '[BCRYPT]',
    pattern: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}\b/g,
  },

  // ===== 数据库连接串 =====
  {
    id: 'credential.db_connection_uri',
    description: '含密码的数据库连接串（mysql/postgres/mongodb/redis://user:pass@host）',
    category: '凭证-连接串',
    baseRisk: 'high',
    defaultReplacement: '[DB_URI]',
    pattern: /\b(?:mysql|mariadb|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp|amqps)\:\/\/[^\s:@\/]+:[^\s@\/]+@[^\s\/]+/gi,
  },
];

// 向后兼容：detector.ts 用 credentialPatterns 数组按规则跑
export const credentialPatterns: RegExp[] = credentialRules.map((r) => r.pattern);
