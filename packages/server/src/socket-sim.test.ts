/**
 * Socket Simulation Test -- 4 socket.io clients connect to an embedded
 * server and play through a full Tichu game.
 *
 * Run with: npx vitest run src/socket-sim.test.ts
 *
 * The test starts the server internally on a dedicated port (3099)
 * so no separate server process is needed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket } from 'socket.io-client';
import type { Card, Rank, PlayedHand, GamePhase } from '@tichu/shared';
import {
  isNormalCard, isMahjong, isDog, isDragon, isPhoenix,
  validateHand, canBeat,
} from '@tichu/shared';

// ── Helpers ─────────────────────────────────────────────────────

let SERVER_PORT = 0;
let SERVER_URL = '';

/** Promise that resolves on a specific socket event, rejects on timeout */
function waitForEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 15_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for "${event}" after ${timeoutMs}ms`));
    }, timeoutMs);
    function handler(data: T) {
      clearTimeout(timer);
      resolve(data);
    }
    socket.once(event, handler);
  });
}

/** Small delay helper */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Wait until all clients have received at least one cards_dealt event */
function waitForAllCardsDealt(
  clients: ClientState[],
  timeoutMs = 15_000,
): Promise<void> {
  return Promise.all(
    clients.map(c => waitForEvent(c.socket, 'cards_dealt', timeoutMs)),
  ).then(() => undefined);
}

/** Wait until at least one client reaches the given phase */
function waitUntilPhase(
  clients: ClientState[],
  phase: GamePhase,
  timeoutMs = 15_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (clients.some(c => c.phase === phase)) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      for (const c of clients) c.socket.off('phase_changed', onPhase);
      reject(new Error(`Timeout waiting for phase "${phase}" after ${timeoutMs}ms (current: ${clients[0]?.phase})`));
    }, timeoutMs);
    function onPhase(data: { phase: GamePhase }) {
      if (data.phase === phase) {
        clearTimeout(timer);
        for (const c of clients) c.socket.off('phase_changed', onPhase);
        resolve();
      }
    }
    for (const c of clients) c.socket.on('phase_changed', onPhase);
  });
}

// ── Client State Tracker ────────────────────────────────────────

interface ClientState {
  socket: Socket;
  playerId: string;
  nickname: string;
  mySeat: number;
  myHand: Card[];
  roomId: string;
  phase: GamePhase;
  currentTurn: number;
  tableCards: PlayedHand | null;
  finishOrder: number[];
  isGameOver: boolean;
  lastRoundResult: unknown;
  gameOverData: unknown;
}

function createClient(playerId: string, nickname: string): ClientState {
  const socket = ioClient(SERVER_URL, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: false,
    timeout: 10_000,
  });

  return {
    socket,
    playerId,
    nickname,
    mySeat: -1,
    myHand: [],
    roomId: '',
    phase: 'WAITING_FOR_PLAYERS',
    currentTurn: -1,
    tableCards: null,
    finishOrder: [],
    isGameOver: false,
    lastRoundResult: null,
    gameOverData: null,
  };
}

/** Compare two cards for equality */
function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') return a.specialType === b.specialType;
  if (a.type === 'normal' && b.type === 'normal') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

function removeCardsFromHand(hand: Card[], cards: Card[]): Card[] {
  const result = [...hand];
  for (const c of cards) {
    const idx = result.findIndex(h => cardEquals(h, c));
    if (idx >= 0) result.splice(idx, 1);
  }
  return result;
}

/** Attach persistent listeners to track state changes on a client */
function attachStateListeners(client: ClientState): void {
  const { socket } = client;

  socket.on('room_joined', (data: { seat: number; roomId: string }) => {
    client.mySeat = data.seat;
    client.roomId = data.roomId;
  });

  socket.on('game_state_sync', (state: {
    phase: GamePhase; myHand: Card[]; tableCards: PlayedHand | null;
    currentTurn: number; finishOrder: number[]; mySeat: number;
  }) => {
    client.phase = state.phase;
    client.myHand = state.myHand;
    client.tableCards = state.tableCards;
    client.currentTurn = state.currentTurn;
    client.finishOrder = state.finishOrder;
    client.mySeat = state.mySeat;
  });

  socket.on('phase_changed', (data: { phase: GamePhase }) => {
    client.phase = data.phase;
  });

  socket.on('cards_dealt', (data: { cards: Card[] }) => {
    // Server sends the full current hand each time (not just new cards).
    // broadcastEvents fires cards_dealt per seat, so we may receive duplicates;
    // always replace with the latest to keep state correct.
    client.myHand = data.cards;
  });

  socket.on('exchange_result', () => {
    // After exchange_result, the server also sends cards_dealt with the full
    // updated hand, so we do not need to manually add received cards here.
  });

  socket.on('card_played', (data: { seat: number; hand: PlayedHand }) => {
    client.tableCards = data.hand;
    if (data.seat === client.mySeat) {
      client.myHand = removeCardsFromHand(client.myHand, data.hand.cards);
    }
  });

  socket.on('your_turn', (data: { seat: number }) => {
    client.currentTurn = data.seat;
  });

  socket.on('turn_changed', (data: { seat: number }) => {
    client.currentTurn = data.seat;
  });

  socket.on('trick_won', () => {
    client.tableCards = null;
  });

  socket.on('player_finished', (data: { seat: number }) => {
    if (!client.finishOrder.includes(data.seat)) {
      client.finishOrder.push(data.seat);
    }
  });

  socket.on('round_result', (data: unknown) => {
    client.lastRoundResult = data;
    client.tableCards = null;
    client.finishOrder = [];
  });

  socket.on('game_over', (data: unknown) => {
    client.isGameOver = true;
    client.gameOverData = data;
  });

  socket.on('bomb_played', (data: { seat: number; bomb: PlayedHand }) => {
    client.tableCards = data.bomb;
    if (data.seat === client.mySeat) {
      client.myHand = removeCardsFromHand(client.myHand, data.bomb.cards);
    }
  });
}

// ── Play Logic ──────────────────────────────────────────────────

function getCardSortValue(c: Card): number {
  if (c.type === 'special') {
    switch (c.specialType) {
      case 'mahjong': return 1;
      case 'dog': return 0;
      case 'phoenix': return 15;
      case 'dragon': return 16;
    }
  }
  return c.value;
}

/** Pick a simple play: on lead play lowest single, on follow try to beat or pass */
function pickPlay(
  hand: Card[],
  tableCards: PlayedHand | null,
  isLead: boolean,
): { cards: Card[]; phoenixAs?: Rank; wish?: Rank } | 'pass' {
  if (hand.length === 0) return 'pass';

  if (isLead) {
    // Must include mahjong if we have it (first lead requirement)
    const mahjong = hand.find(c => isMahjong(c));
    if (mahjong) return { cards: [mahjong] };

    // Play lowest non-dog single
    const playable = hand.filter(c => !isDog(c));
    if (playable.length === 0) {
      const dog = hand.find(c => isDog(c));
      if (dog) return { cards: [dog] };
      return 'pass';
    }
    const sorted = [...playable].sort((a, b) => getCardSortValue(a) - getCardSortValue(b));
    return { cards: [sorted[0]!] };
  }

  // Follow: try to beat a single
  if (!tableCards) return 'pass';
  if (tableCards.type !== 'single' || tableCards.length !== 1) return 'pass';

  const candidates: { card: Card; sortVal: number }[] = [];
  for (const c of hand) {
    if (isDog(c)) continue;
    if (isPhoenix(c)) {
      if (tableCards.value < 15) candidates.push({ card: c, sortVal: tableCards.value + 0.5 });
    } else if (isDragon(c)) {
      candidates.push({ card: c, sortVal: 100 });
    } else if (isMahjong(c)) {
      if (1 > tableCards.value) candidates.push({ card: c, sortVal: 1 });
    } else if (isNormalCard(c) && c.value > tableCards.value) {
      candidates.push({ card: c, sortVal: c.value });
    }
  }
  candidates.sort((a, b) => a.sortVal - b.sortVal);

  if (candidates.length > 0) return { cards: [candidates[0]!.card] };
  return 'pass';
}

// ── Round-level Play Loop ───────────────────────────────────────

/**
 * Play through one round by responding to your_turn events.
 * Uses a shared event-driven approach: registers a listener on each client
 * that auto-plays when it's their turn.
 */
function playOneRound(clients: ClientState[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const MAX_TURNS = 200;
    let turnCount = 0;
    let resolved = false;

    function cleanup() {
      for (const c of clients) {
        c.socket.off('your_turn', onYourTurn);
        c.socket.off('round_result', onRoundResult);
        c.socket.off('game_over', onGameOver);
        c.socket.off('dragon_give_required', onDragonGive);
      }
    }

    function done() {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    }

    function fail(err: string) {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error(err));
    }

    const safetyTimer = setTimeout(
      () => fail('Round did not complete within 120 seconds'),
      120_000,
    );

    function onRoundResult(this: Socket) {
      clearTimeout(safetyTimer);
      // Reset client state for next round
      for (const c of clients) {
        c.myHand = [];
        c.tableCards = null;
        c.finishOrder = [];
      }
      done();
    }

    function onGameOver(this: Socket) {
      clearTimeout(safetyTimer);
      done();
    }

    function onDragonGive(this: Socket, data: { seat: number }) {
      const client = clients.find(c => c.socket === this);
      if (!client || client.mySeat !== data.seat) return;
      const opponents = [0, 1, 2, 3].filter(
        s => s !== client.mySeat && (s + 2) % 4 !== client.mySeat,
      );
      client.socket.emit('dragon_give', { targetSeat: opponents[0] });
    }

    function onYourTurn(this: Socket, data: { seat: number }) {
      if (resolved) return;
      turnCount++;
      if (turnCount > MAX_TURNS) {
        clearTimeout(safetyTimer);
        fail(`Exceeded ${MAX_TURNS} turns in a single round`);
        return;
      }

      const client = clients.find(c => c.socket === this);
      if (!client) return;

      // Small delay to mimic real client behavior and let state sync
      setTimeout(() => {
        if (resolved) return;
        const isLead = client.tableCards === null;
        const play = pickPlay(client.myHand, client.tableCards, isLead);

        if (play === 'pass') {
          client.socket.emit('pass_turn');
        } else {
          client.socket.emit('play_cards', play);
        }
      }, 50);
    }

    // Register listeners
    for (const c of clients) {
      c.socket.on('your_turn', onYourTurn);
      c.socket.on('round_result', onRoundResult);
      c.socket.on('game_over', onGameOver);
      c.socket.on('dragon_give_required', onDragonGive);
    }
  });
}

// ── Server Setup ────────────────────────────────────────────────

let httpServer: http.Server;
let ioServer: SocketIOServer;

async function startTestServer(): Promise<void> {
  const { registerSocketHandlers } = await import('./socket-handlers.js');

  httpServer = http.createServer();
  ioServer = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  registerSocketHandlers(ioServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      SERVER_PORT = typeof addr === 'object' && addr ? addr.port : 0;
      SERVER_URL = `http://localhost:${SERVER_PORT}`;
      resolve();
    });
  });
}

async function stopTestServer(): Promise<void> {
  if (ioServer) {
    await new Promise<void>(resolve => { ioServer.close(() => resolve()); });
  }
  if (httpServer) {
    await new Promise<void>(resolve => { httpServer.close(() => resolve()); });
  }
}

function connectSocket(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.connect();
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

// ── Tests ───────────────────────────────────────────────────────

describe('Socket Simulation: Full Game', () => {
  const clients: ClientState[] = [];

  beforeAll(async () => {
    await startTestServer();

    for (let i = 0; i < 4; i++) {
      const client = createClient(
        `sim_player_${i}_${Date.now()}`,
        `SimPlayer${i}`,
      );
      attachStateListeners(client);
      clients.push(client);
    }

    await Promise.all(clients.map(c => connectSocket(c.socket)));
  }, 15_000);

  afterAll(async () => {
    for (const c of clients) {
      if (c.socket.connected) c.socket.disconnect();
    }
    clients.length = 0;
    await stopTestServer();
  }, 10_000);

  // ──────────────────────────────────────────────────────────────
  // Test 1: Full game play-through
  // ──────────────────────────────────────────────────────────────
  it('should play through a complete game with 4 clients', async () => {
    const [host, p1, p2, p3] = clients as [ClientState, ClientState, ClientState, ClientState];

    // -- Step 1: Host creates a custom room --
    host.socket.emit('create_custom_room', {
      roomName: 'SimTest Room',
      playerId: host.playerId,
      nickname: host.nickname,
    });

    const hostJoin = await waitForEvent<{ seat: number; roomId: string }>(
      host.socket, 'room_joined',
    );
    expect(hostJoin.seat).toBe(0);
    expect(hostJoin.roomId).toBeTruthy();

    const roomId = hostJoin.roomId;

    // -- Step 2: Other 3 clients join --
    for (const client of [p1, p2, p3]) {
      client.socket.emit('join_room', {
        roomId,
        playerId: client.playerId,
        nickname: client.nickname,
      });
      const jd = await waitForEvent<{ seat: number; roomId: string }>(
        client.socket, 'room_joined',
      );
      expect(jd.roomId).toBe(roomId);
      expect(jd.seat).toBeGreaterThan(0);
    }

    // All 4 should have unique seats
    const seats = clients.map(c => c.mySeat);
    expect(new Set(seats).size).toBe(4);

    // -- Step 3: Host starts the game --
    // All 4 seats are human, no bots created.
    host.socket.emit('start_game');

    // Wait for cards_dealt and a brief settling time
    await waitForAllCardsDealt(clients, 10_000);
    await delay(200);

    for (const c of clients) {
      expect(c.myHand.length).toBe(8);
    }

    // -- Step 4: Large Tichu -- all pass --
    for (const c of clients) c.socket.emit('pass_tichu');

    // Wait for second deal (14 cards total)
    await waitForAllCardsDealt(clients, 10_000);
    await delay(200);

    for (const c of clients) {
      expect(c.myHand.length).toBe(14);
    }

    // -- Step 5: Card exchange --
    await delay(300);

    for (const c of clients) {
      const hand = c.myHand;
      c.socket.emit('exchange_cards', {
        left: hand[0],
        partner: hand[1],
        right: hand[2],
      });
    }

    // Wait for TRICK_PLAY phase and cards settling
    await waitUntilPhase(clients, 'TRICK_PLAY', 15_000);
    await delay(200);

    for (const c of clients) {
      expect(c.myHand.length).toBe(14);
    }

    // -- Step 6: Play rounds until game_over --
    let roundCount = 0;
    const MAX_ROUNDS = 50;

    while (!clients.some(c => c.isGameOver) && roundCount < MAX_ROUNDS) {
      roundCount++;
      console.log(`[test] Starting round ${roundCount}...`);

      await playOneRound(clients);

      if (clients.some(c => c.isGameOver)) break;

      // Server auto-starts next round after 5s delay.
      // Wait for LARGE_TICHU_WINDOW phase (first deal happens before it).
      try {
        await waitUntilPhase(clients, 'LARGE_TICHU_WINDOW', 12_000);
      } catch {
        if (clients.some(c => c.isGameOver)) break;
        throw new Error(`Round ${roundCount}: Failed to reach LARGE_TICHU_WINDOW`);
      }

      // Pass large tichu
      for (const c of clients) c.socket.emit('pass_tichu');

      // Wait for PASSING phase (second deal happens before it)
      await waitUntilPhase(clients, 'PASSING', 10_000);

      // Exchange
      await delay(200);
      for (const c of clients) {
        const hand = c.myHand;
        c.socket.emit('exchange_cards', {
          left: hand[0],
          partner: hand[1],
          right: hand[2],
        });
      }

      // Wait for TRICK_PLAY
      await waitUntilPhase(clients, 'TRICK_PLAY', 15_000);
    }

    // Verify game completed
    expect(clients.some(c => c.isGameOver)).toBe(true);
    const winner = clients.find(c => c.gameOverData !== null);
    expect(winner).toBeTruthy();
    console.log('[test] Game over:', JSON.stringify(winner!.gameOverData));
    console.log(`[test] Completed in ${roundCount} round(s)`);
  }, 300_000); // 5 min timeout
});

// ──────────────────────────────────────────────────────────────
// Test 2: Reconnection (separate describe to get fresh sockets)
// ──────────────────────────────────────────────────────────────

describe('Socket Simulation: Reconnection', () => {
  const clients: ClientState[] = [];

  beforeAll(async () => {
    // Server already running from previous describe; start if needed
    if (!httpServer?.listening) {
      await startTestServer();
    }
    for (let i = 0; i < 4; i++) {
      const client = createClient(
        `recon_player_${i}_${Date.now()}`,
        `ReconPlayer${i}`,
      );
      attachStateListeners(client);
      clients.push(client);
    }
    await Promise.all(clients.map(c => connectSocket(c.socket)));
  }, 15_000);

  afterAll(async () => {
    for (const c of clients) {
      if (c.socket.connected) c.socket.disconnect();
    }
    clients.length = 0;
  }, 10_000);

  it('should receive game_state_sync on rejoin_room', async () => {
    const [host, p1, p2, p3] = clients as [ClientState, ClientState, ClientState, ClientState];

    // Create room
    host.socket.emit('create_custom_room', {
      roomName: 'Reconnect Test',
      playerId: host.playerId,
      nickname: host.nickname,
    });
    const joinData = await waitForEvent<{ seat: number; roomId: string }>(
      host.socket, 'room_joined',
    );
    const roomId = joinData.roomId;

    // Others join
    for (const client of [p1, p2, p3]) {
      client.socket.emit('join_room', {
        roomId,
        playerId: client.playerId,
        nickname: client.nickname,
      });
      await waitForEvent(client.socket, 'room_joined');
    }

    // Start game
    host.socket.emit('start_game');
    await Promise.all(
      clients.map(c => waitForEvent(c.socket, 'cards_dealt', 10_000)),
    );

    // All pass tichu
    for (const c of clients) c.socket.emit('pass_tichu');
    await Promise.all(
      clients.map(c => waitForEvent(c.socket, 'cards_dealt', 10_000)),
    );

    const p1Seat = p1.mySeat;
    const p1PlayerId = p1.playerId;

    // Create a new socket and rejoin as p1
    const reconnectSocket = ioClient(SERVER_URL, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
    });
    await connectSocket(reconnectSocket);

    reconnectSocket.emit('rejoin_room', { roomId, playerId: p1PlayerId });

    const syncState = await waitForEvent<{
      phase: GamePhase; myHand: Card[]; mySeat: number;
    }>(reconnectSocket, 'game_state_sync', 5_000);

    expect(syncState).toBeTruthy();
    expect(syncState.mySeat).toBe(p1Seat);
    expect(syncState.myHand.length).toBeGreaterThan(0);
    expect(syncState.phase).toBeTruthy();
    console.log(
      `[test] Reconnection OK. Phase: ${syncState.phase}, Hand: ${syncState.myHand.length} cards`,
    );

    reconnectSocket.disconnect();

    // Cleanup: leave room
    for (const c of clients) c.socket.emit('leave_room');
    await delay(500);
  }, 30_000);
});

// ──────────────────────────────────────────────────────────────
// Test 3: Leave room notification
// ──────────────────────────────────────────────────────────────

describe('Socket Simulation: Leave Room', () => {
  const clients: ClientState[] = [];

  beforeAll(async () => {
    if (!httpServer?.listening) {
      await startTestServer();
    }
    for (let i = 0; i < 3; i++) {
      const client = createClient(
        `leave_player_${i}_${Date.now()}`,
        `LeavePlayer${i}`,
      );
      attachStateListeners(client);
      clients.push(client);
    }
    await Promise.all(clients.map(c => connectSocket(c.socket)));
  }, 15_000);

  afterAll(async () => {
    for (const c of clients) {
      if (c.socket.connected) c.socket.disconnect();
    }
    clients.length = 0;
    await stopTestServer();
  }, 10_000);

  it('should notify others with player_left when a player leaves in lobby', async () => {
    const [host, p1, p2] = clients as [ClientState, ClientState, ClientState];

    // Create room
    host.socket.emit('create_custom_room', {
      roomName: 'Leave Test',
      playerId: host.playerId,
      nickname: host.nickname,
    });
    await waitForEvent(host.socket, 'room_joined');
    const roomId = host.roomId;

    // p1 joins
    p1.socket.emit('join_room', {
      roomId,
      playerId: p1.playerId,
      nickname: p1.nickname,
    });
    await waitForEvent(p1.socket, 'room_joined');

    // p2 joins
    p2.socket.emit('join_room', {
      roomId,
      playerId: p2.playerId,
      nickname: p2.nickname,
    });
    await waitForEvent(p2.socket, 'room_joined');

    const p2Seat = p2.mySeat;

    // p2 leaves -- host should get player_left
    const leftPromise = waitForEvent<{ seat: number }>(
      host.socket, 'player_left', 5_000,
    );
    p2.socket.emit('leave_room');

    const leftData = await leftPromise;
    expect(leftData.seat).toBe(p2Seat);
    console.log(`[test] player_left received for seat ${leftData.seat}`);

    // Cleanup
    host.socket.emit('leave_room');
    p1.socket.emit('leave_room');
    await delay(300);
  }, 15_000);
});
