process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[CRASH] unhandledRejection:', err);
});

import http from 'node:http';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socket-handlers.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10_000,
  pingTimeout: 30_000,
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Tichu server listening on port ${PORT}`);
});

export { io, httpServer };
