export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notFound(message = '资源不存在') {
  return new HttpError(404, message);
}

export function badRequest(message = '请求参数错误', details?: unknown) {
  return new HttpError(400, message, details);
}

export function unauthorized(message = '未授权') {
  return new HttpError(401, message);
}

export function forbidden(message = '权限不足') {
  return new HttpError(403, message);
}

export function conflict(message = '资源冲突') {
  return new HttpError(409, message);
}
