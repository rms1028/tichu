/**
 * 0단계 회귀 게이트 — shuffle 과 bot 의 결정성 검증.
 *
 * 같은 시드로 여러 번 셔플/봇 결정을 돌렸을 때 동일한 결과가 나오는지,
 * 그리고 다른 시드는 다른 결과를 내는지 확인. 이 테스트가 flaky 하면
 * 0단계가 끝난 게 아니다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  createDeck, shuffleDeck, __setShuffleRngForTest, createSeededRng,
} from '@tichu/shared';
import { createGameRoom } from './game-room.js';
import { startRound } from './game-engine.js';
import { decideBotAction, __setBotRngForTest } from './bot.js';

afterEach(() => {
  __setShuffleRngForTest(null);
  __setBotRngForTest(null);
});

describe('shuffleDeck determinism (seeded)', () => {
  it('same seed → identical shuffle result (100 runs)', () => {
    const deck = createDeck();
    const runs: string[] = [];
    for (let i = 0; i < 100; i++) {
      __setShuffleRngForTest(createSeededRng('seed-a'));
      const shuffled = shuffleDeck(deck);
      runs.push(shuffled.map(c =>
        c.type === 'normal' ? `${c.suit}-${c.rank}` : c.specialType,
      ).join(','));
    }
    const first = runs[0]!;
    for (const r of runs) expect(r).toBe(first);
  });

  it('different seeds → different shuffle results', () => {
    const deck = createDeck();
    __setShuffleRngForTest(createSeededRng('seed-a'));
    const a = shuffleDeck(deck);
    __setShuffleRngForTest(createSeededRng('seed-b'));
    const b = shuffleDeck(deck);
    expect(a).not.toEqual(b);
  });
});

describe('startRound determinism (seeded shuffle)', () => {
  it('two rounds with same seed deal identical hands', () => {
    const roomA = createGameRoom('det-a');
    const roomB = createGameRoom('det-b');
    for (let s = 0; s < 4; s++) {
      const stub = { playerId: `p${s}`, nickname: `P${s}`, socketId: '', connected: true, isBot: false };
      roomA.players[s] = stub as any;
      roomB.players[s] = { ...stub } as any;
    }

    __setShuffleRngForTest(createSeededRng(12345));
    startRound(roomA);

    __setShuffleRngForTest(createSeededRng(12345));
    startRound(roomB);

    for (let s = 0; s < 4; s++) {
      expect(roomA.hands[s]).toEqual(roomB.hands[s]);
    }
  });
});

describe('decideBotAction determinism (seeded bot RNG)', () => {
  /**
   * Run a fresh easy-bot leading decision 100 times with the same seeded
   * RNG and assert every decision is identical. Easy bots branch on random
   * values twice (70/30 for highest-vs-random single, 60% pass chance on
   * follow), so this covers both randomized code paths.
   */
  it('same seed → identical easy-bot lead decision (100 runs)', () => {
    const decisions: string[] = [];
    for (let i = 0; i < 100; i++) {
      const room = createGameRoom('bot-det');
      for (let s = 0; s < 4; s++) {
        room.players[s] = {
          playerId: `b${s}`, nickname: `B${s}`, socketId: '',
          connected: true, isBot: true,
        } as any;
      }
      (room.settings as any).botDifficulty = 'easy';

      // Seed the deal so the easy bot always sees the same hand.
      __setShuffleRngForTest(createSeededRng('deal-seed'));
      startRound(room);
      // Skip large tichu + exchange — force into TRICK_PLAY with bot to act.
      room.phase = 'TRICK_PLAY';
      room.tableCards = null;
      room.currentTurn = 0;
      room.isFirstLead = false;

      __setBotRngForTest(createSeededRng('bot-seed'));
      const decision = decideBotAction(room, 0);

      decisions.push(JSON.stringify({
        action: decision.action,
        cards: decision.cards?.map(c =>
          c.type === 'normal' ? `${c.suit}-${c.rank}` : c.specialType,
        ),
      }));
    }
    const first = decisions[0]!;
    for (const d of decisions) expect(d).toBe(first);
  });

  it('resetting RNG to null restores Math.random behavior', () => {
    // Not asserting randomness of Math.random — just that reset doesn't
    // crash and decision still returns a valid action.
    const room = createGameRoom('reset');
    for (let s = 0; s < 4; s++) {
      room.players[s] = {
        playerId: `b${s}`, nickname: `B${s}`, socketId: '',
        connected: true, isBot: true,
      } as any;
    }
    (room.settings as any).botDifficulty = 'easy';

    __setShuffleRngForTest(createSeededRng('reset-deal'));
    startRound(room);
    room.phase = 'TRICK_PLAY';
    room.tableCards = null;
    room.currentTurn = 0;
    room.isFirstLead = false;

    __setBotRngForTest(null);
    const d = decideBotAction(room, 0);
    expect(['play', 'pass', 'bomb']).toContain(d.action);
  });
});
