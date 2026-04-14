/**
 * 봇 난이도별 벤치마크 — 각 난이도 조합 100판 시뮬레이션
 *
 * CI 에서 돌지 않는다. 파일명이 `.bench.ts` 라 vitest 기본 test glob
 * (`**\/*.test.{ts,tsx,js,...}`) 에 안 걸린다. 수동 실행은:
 *   npm run benchmark -w packages/server
 *   node packages/server/scripts/bot-benchmark.mjs
 *
 * 3/4단계 이후로 각 게임이 결정적 시드로 돌아간다. 시드 1..N 결과가
 * 재현 가능해서 봇 코드 변경 시 회귀 감지에 쓰인다. 평균 승률 등은
 * print 로 확인 — 수치 변화를 기록해두고 다음 벤치와 비교하면 된다.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createSeededRng, __setShuffleRngForTest } from '@tichu/shared';
import { createGameRoom, getActivePlayers, getPartnerSeat } from './game-room.js';
import {
  startRound, playCards, passTurn, declareTichu, passLargeTichu,
  submitExchange, allExchangesComplete, finishExchange,
  allLargeTichuResponded, finishLargeTichuWindow,
  handleTurnTimeout, dragonGive,
} from './game-engine.js';
import {
  decideBotAction, decideBotExchange, decideBotTichu, __setBotRngForTest,
} from './bot.js';
import type { GameRoom } from './game-room.js';
import type { GameEvent } from './game-engine.js';

afterEach(() => {
  __setShuffleRngForTest(null);
  __setBotRngForTest(null);
});

type Difficulty = 'easy' | 'medium' | 'hard';

interface GameStats {
  winner: 'team1' | 'team2';
  rounds: number;
  team1Score: number;
  team2Score: number;
  tichuDeclared: number;
  tichuSuccess: number;
  oneTwoFinishes: number;
  errors: string[];
}

function getDiff(seat: number, t1: Difficulty, t2: Difficulty): Difficulty {
  return (seat === 0 || seat === 2) ? t1 : t2;
}

function hasEvent(events: GameEvent[], type: string): boolean {
  return events.some(e => e.type === type);
}

function simulateGame(t1: Difficulty, t2: Difficulty, seed: number): GameStats {
  // Seed both RNGs so the same (t1, t2, seed) triple always produces the
  // same game. Reset happens in afterEach.
  __setShuffleRngForTest(createSeededRng(seed));
  __setBotRngForTest(createSeededRng(seed ^ 0x9e3779b9));

  const room = createGameRoom('bench');
  for (let s = 0; s < 4; s++) {
    const d = getDiff(s, t1, t2);
    room.players[s] = { playerId: `b${s}`, nickname: `B${s}`, socketId: '', connected: true, isBot: true } as any;
    (room.players[s] as any).botDifficulty = d;
  }

  const stats: GameStats = {
    winner: 'team1', rounds: 0,
    team1Score: 0, team2Score: 0,
    tichuDeclared: 0, tichuSuccess: 0,
    oneTwoFinishes: 0, errors: [],
  };

  for (let round = 0; round < 30; round++) {
    stats.rounds++;

    // 1. 라운드 시작 (8장 분배 + LARGE_TICHU_WINDOW)
    startRound(room);

    // 2. 라지 티츄
    for (let s = 0; s < 4; s++) {
      if (room.largeTichuResponses[s]) continue;
      if (decideBotTichu(room, s, 'large')) {
        if (declareTichu(room, s, 'large').ok) stats.tichuDeclared++;
      }
      passLargeTichu(room, s);
    }

    // 3. 6장 추가 분배 + PASSING 전환
    if (allLargeTichuResponded(room)) {
      finishLargeTichuWindow(room);
    }

    if ((room.phase as string) !== 'PASSING') { stats.errors.push(`R${round}: phase=${room.phase} after largeTichu`); break; }

    // 4. 스몰 티츄
    for (let s = 0; s < 4; s++) {
      if (room.tichuDeclarations[s] !== null) continue;
      if (decideBotTichu(room, s, 'small')) {
        if (declareTichu(room, s, 'small').ok) stats.tichuDeclared++;
      }
    }

    // 5. 교환
    for (let s = 0; s < 4; s++) {
      if (room.pendingExchanges[s] !== null) continue;
      const ex = decideBotExchange(room, s);
      submitExchange(room, s, ex.left, ex.partner, ex.right);
    }
    if (allExchangesComplete(room)) finishExchange(room);

    if ((room.phase as string) !== 'TRICK_PLAY') { stats.errors.push(`R${round}: phase=${room.phase} after exchange`); break; }

    // 6. 트릭 플레이
    let turns = 0;
    while ((room.phase as string) === 'TRICK_PLAY' && turns < 400) {
      turns++;
      const seat = room.currentTurn;
      if (seat < 0 || seat > 3) { stats.errors.push(`bad seat ${seat}`); break; }

      room.settings.botDifficulty = getDiff(seat, t1, t2);
      const d = decideBotAction(room, seat);
      let events: GameEvent[] = [];

      if (d.action === 'play' && d.cards) {
        const r = playCards(room, seat, d.cards, d.phoenixAs, d.wish);
        if (r.ok) events = r.events;
        else {
          const t2r = handleTurnTimeout(room);
          events = t2r.ok ? t2r.events : [];
          if (!t2r.ok) { stats.errors.push(`seat${seat} play+timeout fail: ${r.error}`); break; }
        }
      } else {
        const r = passTurn(room, seat);
        if (r.ok) events = r.events;
        else {
          const t2r = handleTurnTimeout(room);
          events = t2r.ok ? t2r.events : [];
          if (!t2r.ok) { stats.errors.push(`seat${seat} pass+timeout fail`); break; }
        }
      }

      // 용 양도
      if (room.dragonGivePending) {
        const ws = room.dragonGivePending.winningSeat;
        const opps = [0, 1, 2, 3].filter(s => s !== ws && (s + 2) % 4 !== ws);
        const active = getActivePlayers(room);
        const target = opps.filter(s => active.includes(s))[0] ?? opps[0]!;
        const dr = dragonGive(room, ws, target);
        if (dr.ok) events.push(...dr.events);
      }

      // 이벤트에서 원투/게임종료 확인
      if (hasEvent(events, 'one_two_finish')) stats.oneTwoFinishes++;
      if (hasEvent(events, 'game_over') || (room.phase as string) === 'GAME_OVER') break;
      if ((room.phase as string) === 'ROUND_END' || (room.phase as string) === 'SCORING') break;
    }

    if (turns >= 400) { stats.errors.push(`R${round}: 400 turns!`); break; }

    // 라운드 결과
    stats.team1Score = room.scores.team1;
    stats.team2Score = room.scores.team2;

    // 티츄 성공
    for (let s = 0; s < 4; s++) {
      if (room.tichuDeclarations[s] && room.finishOrder[0] === s) stats.tichuSuccess++;
    }

    // 게임 종료
    if ((room.phase as string) === 'GAME_OVER') break;
    if (room.scores.team1 >= 1000 || room.scores.team2 >= 1000) {
      if (room.scores.team1 !== room.scores.team2) break;
    }
  }

  stats.team1Score = room.scores.team1;
  stats.team2Score = room.scores.team2;
  stats.winner = room.scores.team1 >= room.scores.team2 ? 'team1' : 'team2';
  return stats;
}

function benchmark(label: string, t1: Difficulty, t2: Difficulty, n: number) {
  let w1 = 0, w2 = 0, rounds = 0, errors = 0, tichu = 0, tichuOk = 0, otf = 0;
  const scores: string[] = [];

  for (let i = 0; i < n; i++) {
    // Distinct seed per (matchup, game) so results are reproducible but
    // each game has its own RNG stream. Multiply label into seed so
    // different matchups don't share game 1's deck.
    const seed = ((t1.charCodeAt(0) * 31 + t2.charCodeAt(0)) * 1000) + (i + 1);
    const s = simulateGame(t1, t2, seed);
    if (s.winner === 'team1') w1++; else w2++;
    rounds += s.rounds;
    errors += s.errors.length;
    tichu += s.tichuDeclared;
    tichuOk += s.tichuSuccess;
    otf += s.oneTwoFinishes;
    scores.push(`${s.team1Score}:${s.team2Score}`);
    if (s.errors.length) s.errors.forEach(e => console.warn(`  [G${i}] ${e}`));
  }

  console.log(`\n═══ ${label} ═══`);
  console.log(`  ${t1} vs ${t2} | ${n}판`);
  console.log(`  Team1 승: ${w1}(${Math.round(w1/n*100)}%) Team2 승: ${w2}(${Math.round(w2/n*100)}%)`);
  console.log(`  평균라운드: ${(rounds/n).toFixed(1)} | 티츄: ${tichu}(성공${tichuOk}) | 원투: ${otf} | 에러: ${errors}`);
  console.log(`  점수: ${scores.slice(0,5).join(', ')}`);

  return { w1, w2, errors, n };
}

describe('Bot Benchmark (100 games)', () => {
  it('hard vs hard', () => {
    const r = benchmark('Hard vs Hard', 'hard', 'hard', 100);
    expect(r.errors).toBeLessThanOrEqual(20);
  }, 300_000);

  it('hard vs easy', () => {
    const r = benchmark('Hard vs Easy', 'hard', 'easy', 100);
    expect(r.errors).toBeLessThanOrEqual(20);
    console.log(`  → Hard 승률: ${Math.round(r.w1/r.n*100)}%`);
  }, 300_000);

  it('hard vs medium', () => {
    const r = benchmark('Hard vs Medium', 'hard', 'medium', 100);
    expect(r.errors).toBeLessThanOrEqual(20);
    console.log(`  → Hard 승률: ${Math.round(r.w1/r.n*100)}%`);
  }, 300_000);

  it('medium vs easy', () => {
    const r = benchmark('Medium vs Easy', 'medium', 'easy', 100);
    expect(r.errors).toBeLessThanOrEqual(20);
    console.log(`  → Medium 승률: ${Math.round(r.w1/r.n*100)}%`);
  }, 300_000);

  it('easy vs easy', () => {
    const r = benchmark('Easy vs Easy', 'easy', 'easy', 100);
    expect(r.errors).toBeLessThanOrEqual(20);
  }, 300_000);
});
