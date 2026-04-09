/**
 * 100판 풀 게임 시뮬레이션 — 봇 4명이 1000점까지 완주.
 * Socket.io 없이 순수 game-engine + bot 로직만 사용.
 */
import { describe, it, expect } from 'vitest';
import type { Card } from '@tichu/shared';
import { isDog } from '@tichu/shared';
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
import { decideBotAction, decideBotTichu, decideBotExchange } from './bot.js';

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
  winner: 'team1' | 'team2';
  scores: { team1: number; team2: number };
  rounds: number;
  totalTurns: number;
  oneTwoFinishes: number;
  tichuDeclared: number;
  tichuSuccess: number;
  bombsPlayed: number;
  dragonGives: number;
  errors: string[];
}

function simulateOneGame(gameIndex: number): GameResult {
  const room = createGameRoom(`sim-${gameIndex}`);
  room.settings.botDifficulty = 'hard';
  setupBots(room);

  const result: GameResult = {
    gameIndex,
    winner: 'team1',
    scores: { team1: 0, team2: 0 },
    rounds: 0,
    totalTurns: 0,
    oneTwoFinishes: 0,
    tichuDeclared: 0,
    tichuSuccess: 0,
    bombsPlayed: 0,
    dragonGives: 0,
    errors: [],
  };

  const MAX_ROUNDS = 50;
  const MAX_TURNS_PER_ROUND = 200;

  for (let round = 0; round < MAX_ROUNDS; round++) {
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

// ── 100판 시뮬레이션 ──────────────────────────────────────────

describe('100-game simulation', () => {
  it('runs 100 full games without crashes', () => {
    const results: GameResult[] = [];
    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      const r = simulateOneGame(i);
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
    console.log('  100-GAME SIMULATION REPORT');
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

    // 90% 이상 성공해야 함
    expect(completed.length).toBeGreaterThanOrEqual(90);
  }, 120_000); // 2분 타임아웃
});
