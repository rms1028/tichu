import { logger } from './logger.js';

process.on('uncaughtException', (err) => {
  logger.fatal('process', 'uncaughtException', err);
});
process.on('unhandledRejection', (err) => {
  logger.fatal('process', 'unhandledRejection', err);
});

import http from 'node:http';
import { Server } from 'socket.io';
import { registerSocketHandlers, getRoomCount } from './socket-handlers.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { prisma } from './db.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const START_TIME = Date.now();
const SERVER_VERSION = '1.1.0';
const MIN_APP_VERSION = process.env['MIN_APP_VERSION'] ?? '1.0.0';

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    const status = isShuttingDown ? 'shutting_down' : 'ok';
    const code = isShuttingDown ? 503 : 200;
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status,
      timestamp: Date.now(),
      startedAt: START_TIME,
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
      rooms: getRoomCount(),
      serverVersion: SERVER_VERSION,
      minAppVersion: MIN_APP_VERSION,
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const allowedOrigins = process.env['CORS_ORIGINS']
  ? process.env['CORS_ORIGINS'].split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:19006', 'https://tichu-app.vercel.app'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
  pingInterval: 25_000,
  pingTimeout: 60_000,
  connectTimeout: 30_000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling'],
});

registerSocketHandlers(io);
startScheduler();

httpServer.listen(PORT, () => {
  logger.info('server', `Tichu server v${SERVER_VERSION} listening on port ${PORT}`);
});

// ── Graceful Shutdown ─────────────────────────────────────────
let isShuttingDown = false;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('server', `Graceful shutdown started (${signal})`);

  // 글로벌 타이머 정리
  stopScheduler();
  if ((globalThis as any).__matchmakingTimer) clearInterval((globalThis as any).__matchmakingTimer);
  if ((globalThis as any).__roomCleanupTimer) clearInterval((globalThis as any).__roomCleanupTimer);

  // 새 연결 거부 (health check는 shutting_down 반환)
  httpServer.on('request', (_req, res) => {
    res.writeHead(503);
    res.end();
  });

  // 모든 클라이언트에게 서버 재시작 알림
  io.emit('server_restarting');

  // 2초 대기 후 연결 종료 (클라이언트가 이벤트 수신 + 재접속 준비할 시간)
  setTimeout(async () => {
    io.close(() => {
      logger.info('server', 'Socket.IO closed');
    });
    httpServer.close(() => {
      logger.info('server', 'HTTP server closed');
    });

    // DB 커넥션 정리
    try {
      await prisma.$disconnect();
      logger.info('server', 'Prisma disconnected');
    } catch { /* ignore */ }

    process.exit(0);
  }, 2000);

  // 10초 후 강제 종료 (안전장치)
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { io, httpServer };
