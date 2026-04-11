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

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const START_TIME = Date.now();
const SERVER_VERSION = '1.1.0';
const MIN_APP_VERSION = process.env['MIN_APP_VERSION'] ?? '1.0.0';

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
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
});

registerSocketHandlers(io);
startScheduler();

httpServer.listen(PORT, () => {
  logger.info('server', `Tichu server v${SERVER_VERSION} listening on port ${PORT}`);
});

// ── Graceful Shutdown ─────────────────────────────────────────
function gracefulShutdown(signal: string) {
  logger.info('server', `Graceful shutdown started (${signal})`);

  // 글로벌 타이머 정리
  stopScheduler();
  if ((globalThis as any).__matchmakingTimer) clearInterval((globalThis as any).__matchmakingTimer);
  if ((globalThis as any).__roomCleanupTimer) clearInterval((globalThis as any).__roomCleanupTimer);

  // 모든 클라이언트에게 서버 재시작 알림
  io.emit('server_restarting');

  // 1초 대기 후 연결 종료 (클라이언트가 이벤트 수신할 시간)
  setTimeout(() => {
    io.close(() => {
      logger.info('server', 'Socket.IO closed');
      httpServer.close(() => {
        console.log('[shutdown] HTTP server closed');
        process.exit(0);
      });
    });
    // 5초 후 강제 종료
    setTimeout(() => process.exit(1), 5000);
  }, 1000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { io, httpServer };
