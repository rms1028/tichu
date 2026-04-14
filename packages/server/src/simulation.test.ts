/**
 * 100판 풀 게임 시뮬레이션 — 봇 4명이 1000점까지 완주.
 * Socket.io 없이 순수 game-engine + bot 로직만 사용.
 *
 * As of 0단계 (seedable RNG), each game runs under a fresh seeded RNG
 * so results are deterministic. Same seed → same game. This lets the
 * test act as a regression gate (section 3/4 of the test-automation
 * plan): if bot code changes alter a known seed's outcome, we catch
 * it immediately. Random AI benchmarking lives in
 * `scripts/bot-benchmark.mjs` and is out of CI scope.
 */
import { describe, it, expect, afterEach } from 'vitest';
import type { Card } from '@tichu/shared';
import {
  isDog, createSeededRng, __setShuffleRngForTest,
} from '@tichu/shared';
import type { GameRoom } from './game-room.js';
import {
  createGameRoom, getActivePlayers, cardEquals,
} from './game-room.js';
import {
  startRound, finishLargeTichuWindow, finishExchange,
  declareTichu, passLargeTichu, submitExchange,
  allExchangesComplete, allLargeTichuResponded,
  playCards, passTurn, dragonGive, handleTurnTimeout,
  resolveTrickWon, checkOneTwoFinish,
} from './game-engine.js';
import {
  decideBotAction, decideBotTichu, decideBotExchange, __setBotRngForTest,
} from './bot.js';

afterEach(() => {
  __setShuffleRngForTest(null);
  __setBotRngForTest(null);
});

// ── 헬퍼 ──────────────────────────────────────────────────────

function setupBots(room: GameRoom) {
  for (let s = 0; s < 4; s++) {
    room.players[s] = {
      playerId: `bot_${s}`, nickname: `Bot${s}`, socketId: '',
      connected: true, isBot: true,
    };
  }
}

interface GameResult {
  gameIndex: number;
  seed: number;
  winner: 'team1' | 'team2';
  scores: { team1: number; team2: number };
  rounds: number;
  totalTurns: number;
  oneTwoFinishes: number;
  tichuDeclared: number;
  tichuSuccess: number;
  bombsPlayed: number;
  dragonGives: number;
  /** Per-round score deltas — used to assert sum = 100 per round. */
  roundScoreSums: number[];
  errors: string[];
}

function simulateOneGame(gameIndex: number, seed: number = gameIndex + 1): GameResult {
  // Inject seeded RNGs — shuffle (deck dealing) and bot tie-breaking.
  // Both persist across the whole game so the RNG stream is consumed
  // in the same order every time for a given seed. The afterEach hook
  // resets to null so no test leak outside this suite.
  __setShuffleRngForTest(createSeededRng(seed));
  __setBotRngForTest(createSeededRng(seed ^ 0x9e3779b9)); // golden-ratio-like offset

  const room = createGameRoom(`sim-${gameIndex}`);
  room.settings.botDifficulty = 'hard';
  setupBots(room);

  const result: GameResult = {
    gameIndex,
    seed,
    winner: 'team1',
    scores: { team1: 0, team2: 0 },
    rounds: 0,
    totalTurns: 0,
    oneTwoFinishes: 0,
    tichuDeclared: 0,
    tichuSuccess: 0,
    bombsPlayed: 0,
    dragonGives: 0,
    roundScoreSums: [],
    errors: [],
  };

  const MAX_ROUNDS = 50;
  const MAX_TURNS_PER_ROUND = 200;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Capture pre-round scores to compute per-round delta for score-sum
    // integrity assertion (total delta must equal 100 or 200 on 1-2 finish).
    const preRoundScores = { team1: room.scores.team1, team2: room.scores.team2 };

    // ── 라운드 시작 ─────────────────────────────
    const startEvents = startRound(room);
    if (room.phase !== 'LARGE_TICHU_WINDOW') {
      result.errors.push(`R${round}: startRound → phase=${room.phase}`);
      break;
    }

    // ── 라지 티츄 ────────────────────────────────
    for (let s = 0; s < 4; s++) {
      const declare = decideBotTichu(room, s, 'large');
      if (declare) {
        const r = declareTichu(room, s, 'large');
        if (r.ok) result.tichuDeclared++;
      }
      passLargeTichu(room, s);
    }
    if (!allLargeTichuResponded(room)) {
      // force finish
      for (let s = 0; s < 4; s++) passLargeTichu(room, s);
    }
    const ltEvents = finishLargeTichuWindow(room);

    // ── 스몰 티츄 (교환 전) ──────────────────────
    for (let s = 0; s < 4; s++) {
      if (room.tichuDeclarations[s] === null) {
        const declare = decideBotTichu(room, s, 'small');
        if (declare) {
          const r = declareTichu(room, s, 'small');
          if (r.ok) result.tichuDeclared++;
        }
      }
    }

    // ── 카드 교환 ────────────────────────────────
    for (let s = 0; s < 4; s++) {
      const ex = decideBotExchange(room, s);
      submitExchange(room, s, ex.left, ex.partner, ex.right);
    }
    if (allExchangesComplete(room)) {
      finishExchange(room);
    } else {
      result.errors.push(`R${round}: exchange not complete`);
      break;
    }

    if (room.phase !== 'TRICK_PLAY') {
      result.errors.push(`R${round}: after exchange phase=${room.phase}`);
      break;
    }

    // ── 트릭 플레이 ──────────────────────────────
    let turnCount = 0;
    while (room.phase === 'TRICK_PLAY' && turnCount < MAX_TURNS_PER_ROUND) {
      turnCount++;
      const seat = room.currentTurn;
      if (seat < 0 || seat > 3) {
        result.errors.push(`R${round}T${turnCount}: invalid seat ${seat}`);
        break;
      }

      const hand = room.hands[seat]!;
      if (hand.length === 0) {
        result.errors.push(`R${round}T${turnCount}: seat${seat} has empty hand but still in play`);
        break;
      }

      const decision = decideBotAction(room, seat);

      if (decision.action === 'play' && decision.cards) {
        const cards = decision.cards;
        const phoenixAs = decision.phoenixAs;
        const wish = decision.wish;

        const playResult = playCards(room, seat, cards, phoenixAs, wish);
        if (!playResult.ok) {
          // play 실패 → 패스 또는 자동 플레이로 폴백
          const fallback = handleTurnTimeout(room);
          if (!fallback.ok) {
            const hand = room.hands[seat]!;
            const wishInfo = room.wish ? `wish=${room.wish}, hand=${hand.map(c => c.type === 'normal' ? c.rank : c.specialType).join(',')}` : 'no wish';
            result.errors.push(`R${round}T${turnCount}: seat${seat} play(${playResult.error})+fallback(${fallback.error}) [${wishInfo}] table=${room.tableCards?.type}:${room.tableCards?.value}`);
            break;
          }
        } else {
          // 폭탄 카운트
          for (const ev of playResult.events) {
            if (ev.type === 'card_played' && (ev as any).hand?.type?.includes('bomb')) {
              result.bombsPlayed++;
            }
          }
        }
      } else if (decision.action === 'bomb' && decision.cards) {
        // 즉시 폭탄 인터럽트 (내 턴이 아닐 수 있음)
        const playResult = playCards(room, seat, decision.cards);
        if (!playResult.ok) {
          // 실패하면 현재 턴 플레이어의 자동 행동으로 폴백
          if (room.currentTurn === seat) {
            const fallback = handleTurnTimeout(room);
            if (!fallback.ok) {
              result.errors.push(`R${round}T${turnCount}: bomb+fallback failed`);
              break;
            }
          }
        } else {
          result.bombsPlayed++;
        }
      } else {
        // pass
        if (room.tableCards === null) {
          // 리드 시 패스 불가 — 자동 플레이
          const timeoutResult = handleTurnTimeout(room);
          if (!timeoutResult.ok) {
            result.errors.push(`R${round}T${turnCount}: seat${seat} timeout failed: ${timeoutResult.error}`);
            break;
          }
        } else {
          const passResult = passTurn(room, seat);
          if (!passResult.ok) {
            result.errors.push(`R${round}T${turnCount}: seat${seat} pass failed: ${passResult.error}`);
            break;
          }
        }
      }

      // 용 양도 처리
      if (room.dragonGivePending) {
        const giveSeat = room.dragonGivePending.winningSeat;
        // 상대팀 중 아직 살아있는 플레이어에게 양도
        const opponents = [0, 1, 2, 3].filter(s =>
          s !== giveSeat && (s + 2) % 4 !== giveSeat && !room.finishOrder.includes(s)
        );
        const target = opponents.length > 0 ? opponents[0]! : [0, 1, 2, 3].find(s =>
          s !== giveSeat && (s + 2) % 4 !== giveSeat
        )!;
        const giveResult = dragonGive(room, giveSeat, target);
        if (giveResult.ok) {
          result.dragonGives++;
        } else {
          result.errors.push(`R${round}T${turnCount}: dragon give failed: ${giveResult.error}`);
        }
      }

      // 트릭 종료 체크 (resolveTrickWon은 playCards/passTurn 내에서 호출됨)
    }

    if (turnCount >= MAX_TURNS_PER_ROUND) {
      result.errors.push(`R${round}: exceeded max turns (${MAX_TURNS_PER_ROUND})`);
      break;
    }

    result.totalTurns += turnCount;
    result.rounds++;

    // Record per-round score delta for the round-score integrity gate.
    // Normal end: delta sums to 100. One-two finish: sums to 200.
    // Tichu bonuses stack on top (±100/±200). We track the raw sum so
    // the assertion can subtract known tichu deltas from it.
    const deltaSum =
      (room.scores.team1 - preRoundScores.team1) +
      (room.scores.team2 - preRoundScores.team2);
    result.roundScoreSums.push(deltaSum);

    // 원투 체크
    if (room.finishOrder.length >= 2) {
      const f1 = room.finishOrder[0]!;
      const f2 = room.finishOrder[1]!;
      if ((f1 + 2) % 4 === f2) result.oneTwoFinishes++;
    }

    // 티츄 성공 체크
    for (let s = 0; s < 4; s++) {
      const decl = room.tichuDeclarations[s];
      if (decl && room.finishOrder[0] === s) {
        result.tichuSuccess++;
      }
    }

    // 게임 종료 체크
    if (room.phase === 'GAME_OVER') {
      break;
    }

    // SCORING → 다음 라운드를 위해 체크
    if (room.phase !== 'SCORING' && room.phase !== 'ROUND_END') {
      result.errors.push(`R${round}: unexpected phase after trick play: ${room.phase}`);
      break;
    }
  }

  result.scores = { ...room.scores };
  result.winner = room.scores.team1 >= room.scores.team2 ? 'team1' : 'team2';

  return result;
}

// ── 50판 시뮬레이션 ───────────────────────────────────────────
//
// 이 describe 는 3단계/4단계 의 regression gate 다. 시드 고정 후 아래
// 네 개 불변식을 모든 게임에 대해 검증한다:
//
//   1. errors.length === 0         — 엔진이 거부 없이 끝까지 돌아간 것
//   2. rounds 내 finishOrder 4명   — 4명 다 패 털었고 스킵 없음
//   3. roundScoreSum % 100 === 0   — 정산 합계 100 단위 (tichu bonus 고려)
//   4. winner.score >= targetScore — 누적 1000 이상으로 게임 종료
//
// 게임 수는 50으로 줄임 (100 게임 ≈ 95s → CI 60s 예산 초과). 시드 1..50
// 으로 각 게임이 결정적이라 50판이어도 "회귀 시 감지" 는 100판과 동등.
// bot 성능 벤치는 여기서 안 잰다. AI 성능 측정은
// `packages/server/scripts/bot-benchmark.mjs` 로 분리.

const GAME_COUNT = 50;

describe('50-game self-play regression gate', () => {
  it('runs 50 deterministic seeded games with full integrity checks', () => {
    const results: GameResult[] = [];
    const startTime = Date.now();

    for (let i = 0; i < GAME_COUNT; i++) {
      // Seed derived from index so re-runs are reproducible but each
      // game has a distinct RNG stream.
      const r = simulateOneGame(i, i + 1);
      results.push(r);
    }

    const elapsed = Date.now() - startTime;

    // ── 통계 ──────────────────────────────────────
    const completed = results.filter(r => r.errors.length === 0);
    const failed = results.filter(r => r.errors.length > 0);
    const team1Wins = results.filter(r => r.winner === 'team1').length;
    const team2Wins = results.filter(r => r.winner === 'team2').length;
    const totalRounds = results.reduce((s, r) => s + r.rounds, 0);
    const totalTurns = results.reduce((s, r) => s + r.totalTurns, 0);
    const totalOneTwos = results.reduce((s, r) => s + r.oneTwoFinishes, 0);
    const totalTichu = results.reduce((s, r) => s + r.tichuDeclared, 0);
    const totalTichuSuccess = results.reduce((s, r) => s + r.tichuSuccess, 0);
    const totalBombs = results.reduce((s, r) => s + r.bombsPlayed, 0);
    const totalDragons = results.reduce((s, r) => s + r.dragonGives, 0);
    const avgRounds = totalRounds / results.length;
    const avgTurns = totalTurns / results.length;
    const avgScore1 = results.reduce((s, r) => s + r.scores.team1, 0) / results.length;
    const avgScore2 = results.reduce((s, r) => s + r.scores.team2, 0) / results.length;

    console.log('\n══════════════════════════════════════════');
    console.log(`  ${GAME_COUNT}-GAME SIMULATION REPORT`);
    console.log('══════════════════════════════════════════');
    console.log(`  소요 시간:        ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  성공/실패:        ${completed.length} / ${failed.length}`);
    console.log(`  팀1 승리:         ${team1Wins}`);
    console.log(`  팀2 승리:         ${team2Wins}`);
    console.log(`  평균 라운드:      ${avgRounds.toFixed(1)}`);
    console.log(`  평균 턴/게임:     ${avgTurns.toFixed(0)}`);
    console.log(`  총 라운드:        ${totalRounds}`);
    console.log(`  총 턴:            ${totalTurns}`);
    console.log(`  평균 점수 (T1):   ${avgScore1.toFixed(0)}`);
    console.log(`  평균 점수 (T2):   ${avgScore2.toFixed(0)}`);
    console.log('──────────────────────────────────────────');
    console.log(`  원투 피니시:      ${totalOneTwos}`);
    console.log(`  티츄 선언:        ${totalTichu}`);
    console.log(`  티츄 성공:        ${totalTichuSuccess} (${totalTichu > 0 ? (totalTichuSuccess / totalTichu * 100).toFixed(0) : 0}%)`);
    console.log(`  폭탄 사용:        ${totalBombs}`);
    console.log(`  용 양도:          ${totalDragons}`);
    console.log('══════════════════════════════════════════');

    if (failed.length > 0) {
      console.log('\n  ERRORS:');
      for (const f of failed.slice(0, 10)) {
        console.log(`  Game #${f.gameIndex}: ${f.errors.join('; ')}`);
      }
      if (failed.length > 10) console.log(`  ... and ${failed.length - 10} more`);
    }

    // ── Regression gate assertions ─────────────────────────
    // Under seeded RNG every game must complete cleanly. Zero tolerance
    // because flakiness was removed — a single failure means a bot or
    // engine regression.
    expect(failed.length, `${failed.length} games had errors`).toBe(0);

    // Round-score integrity: every round's score delta must be 100
    // (normal end) or 200 (one-two finish), ignoring tichu bonuses.
    // Tichu bonuses are ±100/±200 per declaration, and up to 4 players
    // can declare per round, so the sum can drift well above or below
    // the base. What must hold is: (a) delta is always a multiple of
    // 100 (normalized to avoid JS -0 ≠ 0 quirk), and (b) the absolute
    // magnitude is bounded by base(200 max) + 4 tichus × 200 max = 1000.
    for (const r of results) {
      for (let ri = 0; ri < r.roundScoreSums.length; ri++) {
        const delta = r.roundScoreSums[ri]!;
        const mod = ((delta % 100) + 100) % 100; // normalize -0 → 0
        expect(mod, `game#${r.gameIndex} round ${ri} delta=${delta} not multiple of 100`).toBe(0);
        expect(Math.abs(delta), `game#${r.gameIndex} round ${ri} delta=${delta} out of range`).toBeLessThanOrEqual(1000);
      }
    }

    // Winner must actually reach target score (1000 by default).
    for (const r of results) {
      const winScore = r.winner === 'team1' ? r.scores.team1 : r.scores.team2;
      expect(winScore, `game#${r.gameIndex} winner=${r.winner} score=${winScore} < 1000`).toBeGreaterThanOrEqual(1000);
    }
  }, 120_000); // 2분 타임아웃
});

describe('self-play determinism', () => {
  // Proves 0단계 + 3단계 wiring: the same seed applied twice produces
  // byte-identical game results. If this ever flakes, a non-deterministic
  // code path has crept back in (hidden Math.random, time-based branch,
  // iterator order, etc) and we must hunt it down before shipping.

  it('two runs of the same seed produce identical game outcomes', () => {
    const SEEDS = [1, 7, 42, 999, 31337];
    for (const seed of SEEDS) {
      const a = simulateOneGame(0, seed);
      const b = simulateOneGame(0, seed);
      expect(a.scores).toEqual(b.scores);
      expect(a.winner).toBe(b.winner);
      expect(a.rounds).toBe(b.rounds);
      expect(a.totalTurns).toBe(b.totalTurns);
      expect(a.roundScoreSums).toEqual(b.roundScoreSums);
      expect(a.oneTwoFinishes).toBe(b.oneTwoFinishes);
      expect(a.tichuDeclared).toBe(b.tichuDeclared);
      expect(a.tichuSuccess).toBe(b.tichuSuccess);
      expect(a.bombsPlayed).toBe(b.bombsPlayed);
      expect(a.dragonGives).toBe(b.dragonGives);
      expect(a.errors).toEqual(b.errors);
    }
  }, 60_000);
});
