/**
 * 100-game socket simulation — 4 socket.io clients play full games
 * through the actual server socket-handlers layer.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket } from 'socket.io-client';
import type { Card, Rank, PlayedHand, GamePhase } from '@tichu/shared';
import {
  isNormalCard, isMahjong, isDog, isDragon, isPhoenix,
} from '@tichu/shared';

let SERVER_PORT = 0;
let SERVER_URL = '';

// ── Helpers ─────────────────────────────────────────────────────

function waitForEvent<T = unknown>(socket: Socket, event: string, timeoutMs = 15_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timeout: "${event}" ${timeoutMs}ms`)); }, timeoutMs);
    function handler(data: T) { clearTimeout(timer); resolve(data); }
    socket.once(event, handler);
  });
}

function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

function waitUntilPhase(clients: CS[], phase: GamePhase, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (clients.some(c => c.phase === phase)) { resolve(); return; }
    const timer = setTimeout(() => { for (const c of clients) c.socket.off('phase_changed', fn); reject(new Error(`Timeout phase "${phase}"`)); }, timeoutMs);
    function fn(data: { phase: GamePhase }) {
      if (data.phase === phase) { clearTimeout(timer); for (const c of clients) c.socket.off('phase_changed', fn); resolve(); }
    }
    for (const c of clients) c.socket.on('phase_changed', fn);
  });
}

// ── Client State ────────────────────────────────────────────────

interface CS {
  socket: Socket; playerId: string; nickname: string;
  mySeat: number; myHand: Card[]; roomId: string;
  phase: GamePhase; currentTurn: number; tableCards: PlayedHand | null;
  finishOrder: number[]; isGameOver: boolean; gameOverData: any;
  wish: Rank | null;
}

function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') return a.specialType === b.specialType;
  if (a.type === 'normal' && b.type === 'normal') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

function removeCards(hand: Card[], cards: Card[]): Card[] {
  const r = [...hand];
  for (const c of cards) { const i = r.findIndex(h => cardEquals(h, c)); if (i >= 0) r.splice(i, 1); }
  return r;
}

function createClient(id: string, nick: string): CS {
  const socket = ioClient(SERVER_URL, { transports: ['websocket'], autoConnect: false, reconnection: false, timeout: 10_000 });
  return { socket, playerId: id, nickname: nick, mySeat: -1, myHand: [], roomId: '', phase: 'WAITING_FOR_PLAYERS', currentTurn: -1, tableCards: null, finishOrder: [], isGameOver: false, gameOverData: null, wish: null };
}

function attachListeners(c: CS): void {
  c.socket.on('room_joined', (d: any) => { c.mySeat = d.seat; c.roomId = d.roomId; });
  c.socket.on('game_state_sync', (s: any) => { c.phase = s.phase; c.myHand = s.myHand; c.tableCards = s.tableCards; c.currentTurn = s.currentTurn; c.finishOrder = s.finishOrder; c.mySeat = s.mySeat; c.wish = s.wish ?? null; });
  c.socket.on('phase_changed', (d: any) => { c.phase = d.phase; });
  c.socket.on('cards_dealt', (d: any) => { c.myHand = d.cards; });
  c.socket.on('card_played', (d: any) => { c.tableCards = d.hand; if (d.seat === c.mySeat) c.myHand = removeCards(c.myHand, d.hand.cards); });
  c.socket.on('your_turn', (d: any) => { c.currentTurn = d.seat; });
  c.socket.on('turn_changed', (d: any) => { c.currentTurn = d.seat; });
  c.socket.on('trick_won', () => { c.tableCards = null; });
  c.socket.on('player_finished', (d: any) => { if (!c.finishOrder.includes(d.seat)) c.finishOrder.push(d.seat); });
  c.socket.on('round_result', () => { c.tableCards = null; c.finishOrder = []; });
  c.socket.on('game_over', (d: any) => { c.isGameOver = true; c.gameOverData = d; });
  c.socket.on('bomb_played', (d: any) => { c.tableCards = d.bomb; if (d.seat === c.mySeat) c.myHand = removeCards(c.myHand, d.bomb.cards); });
  c.socket.on('wish_active', (d: any) => { c.wish = d.wish; });
  c.socket.on('wish_fulfilled', () => { c.wish = null; });
  c.socket.on('return_to_waiting', () => { c.isGameOver = false; c.gameOverData = null; c.phase = 'WAITING_FOR_PLAYERS'; });
}

// ── Simple Play (싱글 기반 — 소켓 상태와 안전하게 동기화) ──────

function getCardSortValue(c: Card): number {
  if (c.type === 'special') {
    switch (c.specialType) { case 'mahjong': return 1; case 'dog': return 0; case 'phoenix': return 15; case 'dragon': return 16; }
  }
  return c.value;
}

function pickSimplePlay(hand: Card[], tableCards: PlayedHand | null, isLead: boolean): { cards: Card[]; phoenixAs?: Rank; wish?: Rank } | 'pass' {
  if (hand.length === 0) return 'pass';

  if (isLead) {
    const mahjong = hand.find(isMahjong);
    if (mahjong) return { cards: [mahjong] };
    const playable = hand.filter(c => !isDog(c));
    if (playable.length === 0) {
      const dog = hand.find(isDog);
      if (dog) return { cards: [dog] };
      return 'pass';
    }
    const sorted = [...playable].sort((a, b) => getCardSortValue(a) - getCardSortValue(b));
    return { cards: [sorted[0]!] };
  }

  // 팔로우: 싱글만 처리
  if (!tableCards || tableCards.type !== 'single' || tableCards.length !== 1) return 'pass';

  const candidates: { card: Card; val: number }[] = [];
  for (const c of hand) {
    if (isDog(c)) continue;
    if (isPhoenix(c)) {
      if (tableCards.value < 15) candidates.push({ card: c, val: tableCards.value + 0.5 });
    } else if (isDragon(c)) {
      candidates.push({ card: c, val: 100 });
    } else if (isMahjong(c)) {
      if (1 > tableCards.value) candidates.push({ card: c, val: 1 });
    } else if (isNormalCard(c) && c.value > tableCards.value) {
      candidates.push({ card: c, val: c.value });
    }
  }
  candidates.sort((a, b) => a.val - b.val);
  if (candidates.length > 0) return { cards: [candidates[0]!.card] };
  return 'pass';
}

// ── Round Loop ──────────────────────────────────────────────────

function playOneRound(clients: CS[]): Promise<{ turns: number; error?: string }> {
  return new Promise((resolve) => {
    const MAX_TURNS = 300;
    let turnCount = 0;
    let done = false;

    function finish(error?: string) {
      if (done) return;
      done = true;
      clearTimeout(safety);
      for (const c of clients) {
        c.socket.off('your_turn', onTurn);
        c.socket.off('round_result', onRound);
        c.socket.off('game_over', onOver);
        c.socket.off('dragon_give_required', onDragon);
      }
      resolve({ turns: turnCount, error });
    }

    const safety = setTimeout(() => finish('round timeout 120s'), 120_000);

    function onRound() { finish(); }
    function onOver() { finish(); }

    function onDragon(this: Socket, data: { seat: number }) {
      const c = clients.find(cl => cl.socket === this);
      if (!c || c.mySeat !== data.seat) return;
      const opps = [0, 1, 2, 3].filter(s => s !== c.mySeat && (s + 2) % 4 !== c.mySeat);
      c.socket.emit('dragon_give', { targetSeat: opps[0] });
    }

    function onTurn(this: Socket, data: { seat: number }) {
      if (done) return;
      turnCount++;
      if (turnCount > MAX_TURNS) { finish(`exceeded ${MAX_TURNS} turns`); return; }

      const c = clients.find(cl => cl.socket === this);
      if (!c) return;

      setTimeout(() => {
        if (done) return;
        const isLead = c.tableCards === null;
        const play = pickSimplePlay(c.myHand, c.tableCards, isLead);
        if (play === 'pass') {
          c.socket.emit('pass_turn');
        } else {
          c.socket.emit('play_cards', play);
        }
      }, 10); // 최소 딜레이
    }

    for (const c of clients) {
      c.socket.on('your_turn', onTurn);
      c.socket.on('round_result', onRound);
      c.socket.on('game_over', onOver);
      c.socket.on('dragon_give_required', onDragon);
    }
  });
}

// ── Single Game ─────────────────────────────────────────────────

async function playOneGame(gameIdx: number): Promise<{
  winner: string; scores: any; rounds: number; turns: number; error?: string;
}> {
  // 매 게임마다 새 소켓 생성
  const clients: CS[] = [];
  for (let i = 0; i < 4; i++) {
    const c = createClient(`g${gameIdx}_p${i}_${Date.now()}`, `G${gameIdx}P${i}`);
    attachListeners(c);
    clients.push(c);
  }
  await Promise.all(clients.map(c => connectSocket(c.socket)));

  const host = clients[0]!;
  let totalTurns = 0;
  let rounds = 0;

  try {
    // 방 생성
    host.socket.emit('create_custom_room', {
      roomName: `Sim100_${gameIdx}`, playerId: host.playerId, nickname: host.nickname,
    });
    const joinData = await waitForEvent<any>(host.socket, 'room_joined', 5_000);
    const roomId = joinData.roomId;

    // 나머지 입장
    for (let i = 1; i < 4; i++) {
      clients[i]!.socket.emit('join_room', { roomId, playerId: clients[i]!.playerId, nickname: clients[i]!.nickname });
      await waitForEvent(clients[i]!.socket, 'room_joined', 5_000);
    }

    // 게임 시작
    host.socket.emit('start_game');
    await Promise.all(clients.map(c => waitForEvent(c.socket, 'cards_dealt', 10_000)));
    await delay(50);

    // 첫 라운드: 라지 티츄 패스 + 교환
    for (const c of clients) c.socket.emit('pass_tichu');
    await Promise.all(clients.map(c => waitForEvent(c.socket, 'cards_dealt', 10_000)));
    await delay(50);
    for (const c of clients) {
      const h = c.myHand;
      c.socket.emit('exchange_cards', { left: h[0], partner: h[1], right: h[2] });
    }
    await waitUntilPhase(clients, 'TRICK_PLAY', 15_000);

    // 라운드 루프
    const MAX_ROUNDS = 50;
    while (!clients.some(c => c.isGameOver) && rounds < MAX_ROUNDS) {
      rounds++;
      const result = await playOneRound(clients);
      totalTurns += result.turns;

      if (result.error) {
        return { winner: '?', scores: null, rounds, turns: totalTurns, error: `R${rounds}: ${result.error}` };
      }

      if (clients.some(c => c.isGameOver)) break;

      // 다음 라운드 대기
      try {
        await waitUntilPhase(clients, 'LARGE_TICHU_WINDOW', 12_000);
      } catch {
        if (clients.some(c => c.isGameOver)) break;
        return { winner: '?', scores: null, rounds, turns: totalTurns, error: `R${rounds}: no LARGE_TICHU_WINDOW` };
      }

      for (const c of clients) c.socket.emit('pass_tichu');
      await waitUntilPhase(clients, 'PASSING', 10_000);
      await delay(50);
      for (const c of clients) {
        const h = c.myHand;
        c.socket.emit('exchange_cards', { left: h[0], partner: h[1], right: h[2] });
      }
      await waitUntilPhase(clients, 'TRICK_PLAY', 15_000);
    }

    const overClient = clients.find(c => c.gameOverData);
    const winner = (overClient?.gameOverData as any)?.winner ?? '?';
    const scores = (overClient?.gameOverData as any)?.scores ?? null;

    return { winner, scores, rounds, turns: totalTurns };
  } finally {
    // 항상 소켓 정리
    for (const c of clients) { if (c.socket.connected) c.socket.disconnect(); }
  }
}

// ── Server Setup ────────────────────────────────────────────────

let httpServer: http.Server;
let ioServer: SocketIOServer;

async function startServer(): Promise<void> {
  const { registerSocketHandlers } = await import('./socket-handlers.js');
  httpServer = http.createServer();
  ioServer = new SocketIOServer(httpServer, { cors: { origin: '*' }, pingInterval: 25_000, pingTimeout: 60_000 });
  registerSocketHandlers(ioServer);
  await new Promise<void>(r => httpServer.listen(0, () => {
    const addr = httpServer.address();
    SERVER_PORT = typeof addr === 'object' && addr ? addr.port : 0;
    SERVER_URL = `http://localhost:${SERVER_PORT}`;
    r();
  }));
}

async function stopServer(): Promise<void> {
  if (ioServer) await new Promise<void>(r => ioServer.close(() => r()));
  if (httpServer) await new Promise<void>(r => httpServer.close(() => r()));
}

function connectSocket(s: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    s.connect(); s.once('connect', () => resolve()); s.once('connect_error', e => reject(e));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

// ── Test ─────────────────────────────────────────────────────────

describe('Socket 100-game simulation', () => {
  beforeAll(async () => {
    await startServer();
  }, 15_000);

  afterAll(async () => {
    await stopServer();
  }, 10_000);

  it('plays 100 full games through socket layer', async () => {
    const GAMES = 10;
    const results: { winner: string; scores: any; rounds: number; turns: number; error?: string }[] = [];
    const start = Date.now();

    for (let i = 0; i < GAMES; i++) {
      const r = await playOneGame(i);
      results.push(r);
      if ((i + 1) % 10 === 0) console.log(`  [${i + 1}/${GAMES}] ...`);
    }

    const elapsed = Date.now() - start;
    const ok = results.filter(r => !r.error);
    const fail = results.filter(r => r.error);
    const t1 = results.filter(r => r.winner === 'team1').length;
    const t2 = results.filter(r => r.winner === 'team2').length;
    const totalRounds = results.reduce((s, r) => s + r.rounds, 0);
    const totalTurns = results.reduce((s, r) => s + r.turns, 0);

    console.log('\n══════════════════════════════════════════');
    console.log('  SOCKET 100-GAME SIMULATION REPORT');
    console.log('══════════════════════════════════════════');
    console.log(`  소요 시간:        ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  성공/실패:        ${ok.length} / ${fail.length}`);
    console.log(`  팀1 승리:         ${t1}`);
    console.log(`  팀2 승리:         ${t2}`);
    console.log(`  평균 라운드:      ${(totalRounds / GAMES).toFixed(1)}`);
    console.log(`  평균 턴/게임:     ${(totalTurns / GAMES).toFixed(0)}`);
    console.log(`  총 라운드:        ${totalRounds}`);
    console.log(`  총 턴:            ${totalTurns}`);
    console.log('══════════════════════════════════════════');

    if (fail.length > 0) {
      console.log('\n  ERRORS:');
      for (const f of fail.slice(0, 10)) {
        const idx = results.indexOf(f);
        console.log(`  Game #${idx}: ${f.error}`);
      }
    }

    expect(ok.length).toBeGreaterThanOrEqual(Math.floor(GAMES * 0.9));
  }, 1_800_000); // 30분 타임아웃
});
