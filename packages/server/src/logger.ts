/**
 * 구조화된 로거 — 타임스탬프 + 레벨 + 컨텍스트
 * 프로덕션에서는 JSON 포맷, 개발 환경에서는 사람 읽기 쉬운 포맷
 */

const IS_PROD = process.env['NODE_ENV'] === 'production';

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, context: string, message: string, data?: unknown): string {
  if (IS_PROD) {
    return JSON.stringify({
      ts: timestamp(),
      level,
      ctx: context,
      msg: message,
      ...(data !== undefined ? { data } : {}),
    });
  }
  const prefix = `${timestamp()} [${level.toUpperCase()}] [${context}]`;
  if (data !== undefined) {
    return `${prefix} ${message} ${typeof data === 'object' ? JSON.stringify(data) : data}`;
  }
  return `${prefix} ${message}`;
}

export const logger = {
  info(context: string, message: string, data?: unknown) {
    console.log(formatMessage('info', context, message, data));
  },

  warn(context: string, message: string, data?: unknown) {
    console.warn(formatMessage('warn', context, message, data));
  },

  error(context: string, message: string, data?: unknown) {
    console.error(formatMessage('error', context, message, data));
  },

  /** 게임 이벤트 전용 (디버깅용, 프로덕션에서는 info) */
  game(context: string, message: string, data?: unknown) {
    if (IS_PROD) return; // 프로덕션에서 게임 이벤트 로그 억제
    console.log(formatMessage('game', context, message, data));
  },

  /** 심각한 오류 — 프로세스 크래시 등 */
  fatal(context: string, message: string, data?: unknown) {
    console.error(formatMessage('fatal', context, message, data));
  },
};
