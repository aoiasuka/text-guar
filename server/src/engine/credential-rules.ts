// 凭证识别规则：用于 SensitiveMatchType=credential 类型的敏感词
// 这套规则识别"账号+分隔符+密码"组合，覆盖中英文常见场景
// 例：admin/admin123、user:password、账号 admin 密码 admin123、password=qwerty

export const credentialPatterns: RegExp[] = [
  // 1. 账号关键字 + 分隔符 + 任意非空（覆盖 "admin/admin123"、"admin:admin"、"user=root"）
  /\b(?:admin|administrator|sysadmin|root|user|username|account|guest|test|demo|login)\b[\s\/:=\-|]+\S{3,40}/gi,

  // 2. 任意标识 + 分隔符 + 密码关键字（覆盖 "xxx:password"、"login=admin123"）
  /\b\S{3,40}[\s\/:=\-|]+(?:password|passwd|pwd|pass|secret|token|admin123|root123|qwerty|123456)\b/gi,

  // 3. 显式密码字段（覆盖 "password=xxx"、"pwd:yyy"）
  /\b(?:password|passwd|pwd|pass|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*\S{3,40}/gi,

  // 4. 中文场景："账号 xxx 密码 yyy" / "用户名:xxx 密码:yyy"
  /(?:账号|账户|用户名|用户)[\s:：]*\S{2,40}[\s,，]+(?:密码|密钥|口令)[\s:：]*\S{3,40}/g,
];
