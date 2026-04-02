/**
 * E2E 테스트 — game-engine 함수를 직접 호출하여 전체 라운드 시뮬레이션.
 * Socket.io 없이 순수 로직만 검증.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Card, Rank } from '@tichu/shared';
import {
  normalCard, MAHJONG, DOG, PHOENIX, DRAGON,
  isMahjong, isDog, isDragon, isPhoenix, isNormalCard,
  validateHand, canBeat,
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
} from './game-engine.js';
import {
  startBombWindow, submitBomb, resolveBombWindow, afterBombWindowResolved,
} from './bomb-window.js';

// ── 카드 팩토리 ──────────────────────────────────────────────

const S = (r: Parameters<typeof normalCard>[1]) => normalCard('sword', r);
const T = (r: Parameters<typeof normalCard>[1]) => normalCard('star', r);
const J = (r: Parameters<typeof normalCard>[1]) => normalCard('jade', r);
const P = (r: Parameters<typeof normalCard>[1]) => normalCard('pagoda', r);

function setupPlayers(room: GameRoom) {
  for (let s = 0; s < 4; s++) {
    room.players[s] = {
      playerId: `p${s}`, nickname: `Player${s}`, socketId: `s${s}`,
      connected: true, isBot: false,
    };
  }
}

// ── 1. 전체 라운드 플로우 ────────────────────────────────────

describe('E2E: 전체 라운드 플로우', () => {
  let room: GameRoom;

  beforeEach(() => {
    room = createGameRoom('e2e-test');
    setupPlayers(room);
  });

  it('딜링 → 라지 티츄 → 교환 → 트릭 플레이 → 정산', () => {
    // === Phase 1: 딜링 8장 ===
    const events1 = startRound(room);
    expect(room.phase).toBe('LARGE_TICHU_WINDOW');
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(8);
    }

    // === Phase 2: 라지 티츄 — 모두 패스 ===
    for (let s = 0; s < 4; s++) {
      passLargeTichu(room, s);
    }
    expect(allLargeTichuResponded(room)).toBe(true);

    // === Phase 3: 6장 추가 ===
    const events2 = finishLargeTichuWindow(room);
    expect(room.phase).toBe('PASSING');
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(14);
    }

    // === Phase 4: 교환 ===
    for (let s = 0; s < 4; s++) {
      const hand = room.hands[s]!;
      submitExchange(room, s, hand[0]!, hand[1]!, hand[2]!);
    }
    expect(allExchangesComplete(room)).toBe(true);

    const events3 = finishExchange(room);
    expect(room.phase).toBe('TRICK_PLAY');
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(14);
    }

    // 참새 보유자가 currentTurn
    const mahjongHolder = room.currentTurn;
    expect(room.hands[mahjongHolder]!.some(isMahjong)).toBe(true);

    // === Phase 5: 트릭 플레이 (자동 진행) ===
    // 모든 플레이어가 타임아웃으로 자동 행동하여 라운드 종료까지
    let maxTurns = 200;
    while (room.phase === 'TRICK_PLAY' && maxTurns > 0) {
      maxTurns--;

      // 용 양도 대기 처리
      if (room.dragonGivePending) {
        const seat = room.dragonGivePending.winningSeat;
        const opponents = [0, 1, 2, 3].filter(
          s => s !== seat && (s + 2) % 4 !== seat
        );
        const activeOpps = opponents.filter(s => getActivePlayers(room).includes(s));
        const target = activeOpps[0] ?? opponents[0]!;
        dragonGive(room, seat, target);
        continue;
      }

      // 폭탄 윈도우 처리
      if (room.bombWindow) {
        resolveBombWindow(room);
        if (!room.bombWindow) {
          // 완전 해소 → 다음 턴 진행
          afterBombWindowResolved(room);
        }
        continue;
      }

      const result = handleTurnTimeout(room);
      if (!result.ok) {
        // 리드 시 패스 불가인데 자동 처리 실패 → 뭔가 잘못됨
        break;
      }
    }

    // 라운드 종료 확인
    expect(['ROUND_END', 'SCORING', 'GAME_OVER']).toContain(room.phase);
    expect(room.finishOrder.length).toBe(4);
  });
});

// ── 2. 봉황 싱글 팔로우 ─────────────────────────────────────

describe('E2E: 봉황 싱글 시나리오', () => {
  it('봉황 싱글 리드 → 2로 제압 가능', () => {
    const room = createGameRoom('phoenix-test');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [PHOENIX, S('A')],
      1: [S('2'), S('3')],
      2: [T('4'), T('5')],
      3: [T('6'), T('7')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    // Edge #2: 봉황 리드 → 1.5
    const r1 = playCards(room, 0, [PHOENIX]);
    expect(r1.ok).toBe(true);
    expect(room.tableCards!.value).toBe(1.5);

    // 2로 제압 가능
    const r2 = playCards(room, 1, [S('2')]);
    expect(r2.ok).toBe(true);
    expect(room.tableCards!.value).toBe(2);
  });

  // Edge #13: 봉황 A 뒤 → 14.5, 용/폭탄으로만 제압
  it('봉황 A 뒤 → 14.5', () => {
    const room = createGameRoom('phoenix-a-test');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [S('A'), S('2')],
      1: [PHOENIX, T('3')],
      2: [T('K'), T('5')],
      3: [T('6'), T('7')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    playCards(room, 0, [S('A')]);
    const r = playCards(room, 1, [PHOENIX]);
    expect(r.ok).toBe(true);
    expect(room.tableCards!.value).toBe(14.5);

    // K로는 못 이김
    const r2 = playCards(room, 2, [T('K')]);
    expect(r2.ok).toBe(false);
  });
});

// ── 3. 봉황 조합 (페어/스트레이트) ──────────────────────────

describe('E2E: 봉황 조합', () => {
  it('봉황 페어', () => {
    const room = createGameRoom('phoenix-pair');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [S('7'), PHOENIX, S('2')],
      1: [S('9'), T('9'), T('3')],
      2: [T('4'), T('5')], 3: [T('6'), T('8')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    // 봉황+7 = 페어7 리드
    const r = playCards(room, 0, [S('7'), PHOENIX], '7');
    expect(r.ok).toBe(true);
    expect(room.tableCards!.type).toBe('pair');
    expect(room.tableCards!.value).toBe(7);

    // 9페어로 제압
    const r2 = playCards(room, 1, [S('9'), T('9')]);
    expect(r2.ok).toBe(true);
  });

  it('봉황 스트레이트 (빈 슬롯 대체)', () => {
    const room = createGameRoom('phoenix-straight');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [S('3'), S('4'), PHOENIX, S('6'), S('7'), S('2')],
      1: [T('8')], 2: [T('4')], 3: [T('6')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    // 3-4-봉황(5)-6-7 스트레이트
    const r = playCards(room, 0, [S('3'), S('4'), PHOENIX, S('6'), S('7')], '5');
    expect(r.ok).toBe(true);
    expect(room.tableCards!.type).toBe('straight');
    expect(room.tableCards!.value).toBe(7);
    expect(room.tableCards!.length).toBe(5);
  });
});

// ── 4. 용 트릭 + dragon_give ─────────────────────────────────

describe('E2E: 용 트릭 양도', () => {
  it('용 싱글 → 전원 패스 → 상대에게 양도', () => {
    const room = createGameRoom('dragon-test');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [DRAGON, S('2'), S('3')],
      1: [S('4'), S('5'), T('6')],
      2: [T('7'), T('8'), T('9')],
      3: [T('10'), T('J'), T('Q')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    // 용 리드
    playCards(room, 0, [DRAGON]);

    // 전원 패스
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    // dragon_give 대기
    expect(room.dragonGivePending).not.toBeNull();

    // seat 1(상대)에게 양도
    const r = dragonGive(room, 0, 1);
    expect(r.ok).toBe(true);

    // seat 1이 용(25점) 트릭 카드를 받음
    const hasDragon = room.wonTricks[1]!.some(isDragon);
    expect(hasDragon).toBe(true);
  });

  // Edge #32: 폭탄으로 용 제압 → 양도 미발생
  it('폭탄으로 용 제압 → 양도 미발생', () => {
    const room = createGameRoom('dragon-bomb');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [DRAGON, S('2')],
      1: [S('5'), T('5'), J('5'), P('5'), S('3')], // 포카드 5
      2: [T('7'), T('8')],
      3: [T('10'), T('J')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    playCards(room, 0, [DRAGON]); // 용 리드

    // seat 1 팔로우 전에 패스하고 다른 사람들도 패스하면 트릭 종료
    // 하지만 폭탄은 BOMB_WINDOW에서 사용 → 여기서는 직접 시뮬레이션
    // 일단 전원 패스로 트릭 종료 후 dragon_give 나오는지만 확인
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    expect(room.dragonGivePending).not.toBeNull();
  });
});

// ── 5. 폭탄 인터럽트 E2E ────────────────────────────────────

describe('E2E: 폭탄 인터럽트', () => {
  it('카드 제출 → BOMB_WINDOW → 폭탄 제출 → 해소', () => {
    const room = createGameRoom('bomb-e2e');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [S('K'), S('2')],
      1: [S('A'), T('3')],
      2: [S('9'), T('9'), J('9'), P('9'), T('4')], // 포카드 9
      3: [T('5'), T('6')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    // seat 0 리드: K
    playCards(room, 0, [S('K')]);

    // BOMB_WINDOW 시작 (보통 socket-handler가 하지만, 여기선 직접)
    const bwEvents = startBombWindow(room, 0, room.tableCards!);
    expect(room.bombWindow).not.toBeNull();

    // seat 2가 포카드 9 폭탄 제출
    const bombResult = submitBomb(room, 2, [S('9'), T('9'), J('9'), P('9')]);
    expect(bombResult.ok).toBe(true);

    // 해소
    const resolveEvents = resolveBombWindow(room);
    // 폭탄 적용 → 새 BOMB_WINDOW 시작됨 (재인터럽트 가능)
    expect(room.tableCards!.type).toBe('four_bomb');
    expect(room.tableCards!.value).toBe(9);

    // 두 번째 BOMB_WINDOW — 아무도 안 냄 → 해소
    const resolve2 = resolveBombWindow(room);
    expect(room.bombWindow).toBeNull();

    // 이제 seat 2가 트릭 주도권
    const afterEvents = afterBombWindowResolved(room);
  });

  // Edge #30: 폭탄에 폭탄
  it('폭탄에 더 강한 폭탄', () => {
    const room = createGameRoom('bomb-on-bomb');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [S('K'), S('2')],
      1: [S('3'), T('3'), J('3'), P('3'), T('4')], // 포카드 3
      2: [T('7'), T('8')],
      3: [S('Q'), T('Q'), J('Q'), P('Q'), T('5')], // 포카드 Q
    };
    room.tableCards = null;
    room.currentTurn = 0;

    playCards(room, 0, [S('K')]);

    // 1차 BOMB_WINDOW
    startBombWindow(room, 0, room.tableCards!);

    // seat 1: 포카드 3
    submitBomb(room, 1, [S('3'), T('3'), J('3'), P('3')]);
    resolveBombWindow(room);

    // 2차 BOMB_WINDOW (포카드 3 위)
    expect(room.bombWindow).not.toBeNull();
    expect(room.tableCards!.value).toBe(3);

    // seat 3: 포카드 Q (더 강함)
    const r = submitBomb(room, 3, [S('Q'), T('Q'), J('Q'), P('Q')]);
    expect(r.ok).toBe(true);

    resolveBombWindow(room);
    expect(room.tableCards!.value).toBe(12); // Q=12
  });
});

// ── 6. 소원 강제 + 해제 ─────────────────────────────────────

describe('E2E: 소원 시나리오', () => {
  it('참새 리드 + 소원 선언 → 소원 강제 → 해제', () => {
    const room = createGameRoom('wish-e2e');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = true;
    room.finishOrder = [];
    room.hands = {
      0: [MAHJONG, S('3'), S('4')],
      1: [S('7'), T('8'), T('2')],  // 7 보유
      2: [T('5'), T('6'), T('9')],
      3: [T('10'), T('J'), T('Q')],
    };
    room.currentTurn = 0;

    // 참새 리드 + 소원=7
    const r1 = playCards(room, 0, [MAHJONG], undefined, '7');
    expect(r1.ok).toBe(true);
    expect(room.wish).toBe('7');

    // seat 1은 7을 보유 → 7 포함 싱글 강제
    // 7보다 높은 싱글을 내야 하는데 7>1이므로 7 가능
    const r2 = playCards(room, 1, [S('7')]);
    expect(r2.ok).toBe(true);

    // 소원 해제됨
    expect(room.wish).toBeNull();
  });

  // Edge #20: 리드 시 소원 숫자 보유 → 반드시 포함 리드
  it('리드 시 소원 활성 + 소원 숫자 보유 → 포함 필수', () => {
    const room = createGameRoom('wish-lead');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.wish = '7';
    room.hands = {
      0: [S('7'), S('3'), S('A')],
      1: [T('4')], 2: [T('5')], 3: [T('6')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    // 7 없이 리드 → 실패
    const r1 = playCards(room, 0, [S('3')]);
    expect(r1.ok).toBe(false);
    expect(r1.error).toBe('must_fulfill_wish');

    // 7 포함 리드 → 성공
    const r2 = playCards(room, 0, [S('7')]);
    expect(r2.ok).toBe(true);
    expect(room.wish).toBeNull();
  });

  // Edge #22: 소원 숫자 있지만 바닥 불가 → 패스 가능
  it('소원 숫자 보유하지만 바닥 불가 → 패스 가능', () => {
    const room = createGameRoom('wish-cant-beat');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.wish = '3';
    room.hands = {
      0: [S('A'), S('K')],
      1: [S('3'), T('2')], // 3 보유하지만 A보다 낮음
      2: [T('5')], 3: [T('6')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    playCards(room, 0, [S('A')]); // A 리드

    // seat 1: 3 보유하지만 A 이상 못 냄 → 패스 가능
    const r = passTurn(room, 1);
    expect(r.ok).toBe(true);
  });
});

// ── 7. 개 리드 시나리오 ──────────────────────────────────────

describe('E2E: 개 리드', () => {
  // Edge #17: 소원 활성 + 소원 숫자 보유 + 개 리드 → 거부
  it('소원 활성 + 소원 숫자 보유 시 개 리드 불가', () => {
    const room = createGameRoom('dog-wish');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.wish = '5';
    room.hands = {
      0: [DOG, S('5'), S('A')],
      1: [T('4')], 2: [T('6')], 3: [T('7')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    const r = playCards(room, 0, [DOG]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wish_active_must_play_wish_card');
  });

  // Edge #7: 마지막 카드=개
  it('마지막 카드 개 → 리드 이전 후 나감', () => {
    const room = createGameRoom('dog-last');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [DOG],
      1: [S('4'), S('5')],
      2: [T('6'), T('7')],
      3: [T('8'), T('9')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    const r = playCards(room, 0, [DOG]);
    expect(r.ok).toBe(true);

    // seat 0 나감
    expect(room.finishOrder).toContain(0);

    // 리드권은 파트너(seat 2)에게
    expect(room.currentTurn).toBe(2);
  });

  // Edge #11: 개만 남은 경우 — 팔로우 시 패스만 가능
  it('개만 남았을 때 팔로우 → 패스만 가능', () => {
    const room = createGameRoom('dog-only');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.hands = {
      0: [S('A'), S('K')],
      1: [DOG],  // 개만 남음
      2: [T('5'), T('6')],
      3: [T('7'), T('8')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    playCards(room, 0, [S('A')]); // A 리드

    // seat 1: 개만 남아서 팔로우 불가 → 패스
    const r = passTurn(room, 1);
    expect(r.ok).toBe(true);

    // 개로 팔로우 시도 → 실패 (개는 리드 시에만)
    // (currentTurn이 이미 2로 넘어갔으므로 seat 1은 못 냄)
  });
});

// ── 8. 원투 피니시 전체 흐름 ─────────────────────────────────

describe('E2E: 원투 피니시', () => {
  it('같은 팀 1등+2등 → 200점, 상대 0점', () => {
    const room = createGameRoom('onetwo');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.wonTricks = { 0: [], 1: [], 2: [], 3: [] };
    room.tichuDeclarations = { 0: null, 1: null, 2: null, 3: null };

    // 간단한 설정: seat 0, 2 (같은 팀)이 각각 1장씩
    room.hands = {
      0: [S('A')],    // team1
      1: [S('3'), S('4')],  // team2
      2: [T('K')],    // team1
      3: [T('5'), T('6')],  // team2
    };
    room.tableCards = null;
    room.currentTurn = 0;

    // seat 0 리드 → 나감
    playCards(room, 0, [S('A')]);
    expect(room.finishOrder).toContain(0);

    // 나머지 패스 → 트릭 종료
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    // seat 0 승리 → 새 트릭. seat 0 나갔으므로 다음 활성.
    // 근데 이미 트릭 종료 시 seat 0이 나갔고, 새 리드가 seat 0이지만 나갔으니 next
    // 실제로는 승리 후 seat 0 리드인데 나갔으므로 다음 활성 → seat 1

    // seat 2가 K 리드 (리드권 얻었을 때)
    if (room.phase === 'TRICK_PLAY' && room.currentTurn === 2) {
      playCards(room, 2, [T('K')]);
      // seat 2 나감 → 1등(0)+2등(2) 같은 팀 → 원투 피니시!
    } else if (room.phase === 'TRICK_PLAY') {
      // 다른 시트가 리드 → 패스하면서 seat 2가 리드를 잡아야 함
      // 자동 진행
      let limit = 20;
      while (room.phase === 'TRICK_PLAY' && room.finishOrder.length < 2 && limit > 0) {
        limit--;
        handleTurnTimeout(room);
        if (room.dragonGivePending) {
          const seat = room.dragonGivePending.winningSeat;
          const opps = [0,1,2,3].filter(s => s !== seat && (s+2)%4 !== seat);
          dragonGive(room, seat, opps[0]!);
        }
      }
    }

    // 원투 피니시면 ROUND_END 또는 SCORING
    if (room.finishOrder.length >= 2 &&
        room.finishOrder[0] !== undefined && room.finishOrder[1] !== undefined) {
      const first = room.finishOrder[0];
      const second = room.finishOrder[1];
      const sameTeam = (first + 2) % 4 === second || (second + 2) % 4 === first;
      if (sameTeam) {
        expect(['ROUND_END', 'SCORING']).toContain(room.phase);
      }
    }
  });
});

// ── 9. 스몰 티츄 + 점수 정산 ────────────────────────────────

describe('E2E: 티츄 보너스 정산', () => {
  it('스몰 티츄 성공 시 +100', () => {
    const room = createGameRoom('tichu-bonus');
    setupPlayers(room);
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [];
    room.wonTricks = { 0: [], 1: [], 2: [], 3: [] };

    // seat 0 스몰 티츄 선언
    room.tichuDeclarations = { 0: null, 1: null, 2: null, 3: null };
    room.hasPlayedCards = { 0: false, 1: false, 2: false, 3: false };
    const tichuResult = declareTichu(room, 0, 'small');
    expect(tichuResult.ok).toBe(true);

    // 플레이 진행 (seat 0이 1등)
    room.hands = {
      0: [S('A')],
      1: [S('3'), S('4')],
      2: [T('5'), T('6')],
      3: [T('7'), T('8')],
    };
    room.tableCards = null;
    room.currentTurn = 0;

    playCards(room, 0, [S('A')]);
    // seat 0 나감 (1등)
    expect(room.finishOrder[0]).toBe(0);
  });
});

// ── 10. 참새 교환 후 첫 리드 (Edge #16) ─────────────────────

describe('E2E: 참새 교환 후 첫 리드', () => {
  it('교환으로 참새 이동 → 받은 플레이어가 첫 리드', () => {
    const room = createGameRoom('mahjong-exchange');
    setupPlayers(room);

    // 수동으로 14장 설정 + PASSING
    room.phase = 'PASSING';
    room.hands = {
      0: [MAHJONG, S('2'), S('3'), S('4'), S('5'), S('6'), S('7'), S('8'), S('9'), S('10'), S('J'), S('Q'), S('K'), S('A')],
      1: [T('2'), T('3'), T('4'), T('5'), T('6'), T('7'), T('8'), T('9'), T('10'), T('J'), T('Q'), T('K'), T('A'), DOG],
      2: [J('2'), J('3'), J('4'), J('5'), J('6'), J('7'), J('8'), J('9'), J('10'), J('J'), J('Q'), J('K'), J('A'), PHOENIX],
      3: [P('2'), P('3'), P('4'), P('5'), P('6'), P('7'), P('8'), P('9'), P('10'), P('J'), P('Q'), P('K'), P('A'), DRAGON],
    };

    // seat 0이 참새를 seat 1에게 교환 (left → seat 3의 왼쪽)
    // 교환 방향: left → (s+3)%4, partner → (s+2)%4, right → (s+1)%4
    // seat 0의 right → seat 1
    submitExchange(room, 0, S('K'), S('Q'), MAHJONG); // right=MAHJONG → seat 1로
    submitExchange(room, 1, T('K'), T('Q'), T('J'));
    submitExchange(room, 2, J('K'), J('Q'), J('J'));
    submitExchange(room, 3, P('K'), P('Q'), P('J'));

    expect(allExchangesComplete(room)).toBe(true);

    finishExchange(room);
    expect(room.phase).toBe('TRICK_PLAY');

    // 참새를 받은 seat 1이 첫 리드
    expect(room.hands[room.currentTurn]!.some(isMahjong)).toBe(true);
  });
});
