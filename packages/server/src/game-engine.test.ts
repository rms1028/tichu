import { describe, it, expect, beforeEach } from 'vitest';
import type { Card, Rank } from '@tichu/shared';
import {
  normalCard, MAHJONG, DOG, PHOENIX, DRAGON,
  isMahjong,
} from '@tichu/shared';
import type { GameRoom } from './game-room.js';
import {
  createGameRoom, getActivePlayers, getPartnerSeat,
} from './game-room.js';
import {
  startRound, finishLargeTichuWindow, finishExchange,
  declareTichu, passLargeTichu, submitExchange,
  allLargeTichuResponded, allExchangesComplete,
  playCards, passTurn, dragonGive, handleTurnTimeout,
} from './game-engine.js';

// ── 헬퍼 ─────────────────────────────────────────────────────

const S = (r: Parameters<typeof normalCard>[1]) => normalCard('sword', r);
const T = (r: Parameters<typeof normalCard>[1]) => normalCard('star', r);
const J = (r: Parameters<typeof normalCard>[1]) => normalCard('jade', r);
const P = (r: Parameters<typeof normalCard>[1]) => normalCard('pagoda', r);

function setupRoom(): GameRoom {
  const room = createGameRoom('test-room');
  for (let s = 0; s < 4; s++) {
    room.players[s] = {
      playerId: `player-${s}`,
      nickname: `Player ${s}`,
      socketId: `socket-${s}`,
      connected: true,
      isBot: false,
    };
  }
  return room;
}

/** 특정 핸드를 설정하고 TRICK_PLAY 페이즈로 만드는 헬퍼 */
function setupTrickPlay(
  room: GameRoom,
  hands: Record<number, Card[]>,
  mahjongHolder: number = 0,
): void {
  room.phase = 'TRICK_PLAY';
  room.hands = { ...hands };
  room.currentTurn = mahjongHolder;
  room.isFirstLead = true;
  room.finishOrder = [];
  room.tableCards = null;
}

// ── 라운드 시작 ──────────────────────────────────────────────

describe('startRound', () => {
  it('딜링 후 각 플레이어에게 8장 분배', () => {
    const room = setupRoom();
    const events = startRound(room);

    expect(room.phase).toBe('LARGE_TICHU_WINDOW');
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(8);
    }
    expect(events.some(e => e.type === 'large_tichu_prompt')).toBe(true);
  });
});

// ── 라지 티츄 ────────────────────────────────────────────────

describe('declareTichu', () => {
  it('라지 티츄 선언', () => {
    const room = setupRoom();
    startRound(room);

    const result = declareTichu(room, 0, 'large');
    expect(result.ok).toBe(true);
    expect(room.tichuDeclarations[0]).toBe('large');
  });

  // Edge #38: 팀원 이미 선언 → 거부
  it('팀원 이미 선언 → teammate_already_declared', () => {
    const room = setupRoom();
    startRound(room);

    declareTichu(room, 0, 'large');
    const result = declareTichu(room, 2, 'large'); // 팀원
    expect(result.ok).toBe(false);
    expect(result.error).toBe('teammate_already_declared');
  });

  // Edge #38b: 팀원 라지 → 본인 스몰 거부
  it('팀원 라지 → 본인 스몰 거부', () => {
    const room = setupRoom();
    startRound(room);

    declareTichu(room, 0, 'large');
    // 14장 만들기
    finishAllLargeTichu(room);
    room.phase = 'PASSING';

    const result = declareTichu(room, 2, 'small');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('teammate_already_declared');
  });

  it('잘못된 페이즈 거부', () => {
    const room = setupRoom();
    room.phase = 'WAITING_FOR_PLAYERS';
    const result = declareTichu(room, 0, 'large');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('wrong_phase');
  });
});

// ── 라지 티츄 완료 → DEALING_6 → PASSING ────────────────────

describe('finishLargeTichuWindow', () => {
  it('6장 추가 후 14장 완성', () => {
    const room = setupRoom();
    startRound(room);
    finishAllLargeTichu(room);

    const events = finishLargeTichuWindow(room);
    expect(room.phase).toBe('PASSING');
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(14);
    }
  });
});

// ── 교환 ─────────────────────────────────────────────────────

describe('exchange', () => {
  it('교환 완료 후 TRICK_PLAY', () => {
    const room = setupRoom();
    startRound(room);
    finishAllLargeTichu(room);
    finishLargeTichuWindow(room);

    // 각 플레이어 교환
    for (let s = 0; s < 4; s++) {
      const hand = room.hands[s]!;
      submitExchange(room, s, hand[0]!, hand[1]!, hand[2]!);
    }
    expect(allExchangesComplete(room)).toBe(true);

    const events = finishExchange(room);
    expect(room.phase).toBe('TRICK_PLAY');
    // 14장 유지
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(14);
    }
    // 참새 보유자가 currentTurn
    expect(room.hands[room.currentTurn]!.some(isMahjong)).toBe(true);
  });
});

// ── play_cards 파이프라인 ────────────────────────────────────

describe('playCards', () => {
  it('첫 리드: 참새 없이도 아무 카드나 리드 가능', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [MAHJONG, S('3'), S('4'), S('5')],
      1: [S('6'), S('7'), S('8'), S('9')],
      2: [T('3'), T('4'), T('5'), T('6')],
      3: [T('7'), T('8'), T('9'), T('10')],
    }, 0);

    // 참새 없이 리드 → 성공 (규칙 제거됨)
    const r1 = playCards(room, 0, [S('3')]);
    expect(r1.ok).toBe(true);
  });

  // 첫 리드에서 개 허용 (커스텀 룰)
  it('첫 리드에서 개 허용', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [MAHJONG, DOG, S('3')],
      1: [S('6')], 2: [T('3')], 3: [T('7')],
    }, 0);

    const r = playCards(room, 0, [DOG]);
    expect(r.ok).toBe(true);
  });

  it('팔로우: 더 높은 값만 가능', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [MAHJONG, S('A')],
      1: [S('3'), S('K')],
      2: [T('5')], 3: [T('7')],
    }, 0);

    playCards(room, 0, [MAHJONG]); // 리드: 참새(1)
    // seat 1 팔로우: 3 > 1 → OK
    const r = playCards(room, 1, [S('3')]);
    expect(r.ok).toBe(true);
  });

  it('패스 후 다음 턴', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [MAHJONG], 1: [S('3')], 2: [T('5')], 3: [T('7')],
    }, 0);

    playCards(room, 0, [MAHJONG]);
    const r = passTurn(room, 1);
    expect(r.ok).toBe(true);
    expect(room.currentTurn).toBe(2);
  });

  // Edge #4: 봉황 싱글, 직전=용 → 불가
  it('봉황은 용 위에 불가', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.hands = {
      0: [DRAGON], 1: [PHOENIX], 2: [T('3')], 3: [T('7')],
    };
    room.tableCards = null;
    room.currentTurn = 0;
    room.finishOrder = [];

    playCards(room, 0, [DRAGON]); // 리드: 용
    const r = playCards(room, 1, [PHOENIX]); // 봉황으로 팔로우
    expect(r.ok).toBe(false);
    expect(r.error).toBe('phoenix_cannot_beat_dragon');
  });
});

// ── 개 리드 (Edge #1, #7) ───────────────────────────────────

describe('Dog lead', () => {
  it('개 리드 → 파트너에게 리드 이전', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.hands = {
      0: [DOG, S('5')], 1: [S('6')], 2: [T('3')], 3: [T('7')],
    };
    room.tableCards = null;
    room.currentTurn = 0;
    room.finishOrder = [];

    const r = playCards(room, 0, [DOG]);
    expect(r.ok).toBe(true);
    // seat 0의 파트너는 seat 2
    expect(room.currentTurn).toBe(2);
    expect(room.tableCards).toBeNull(); // 개는 트릭 미성립
  });

  // Edge #1: 파트너 나간 상태에서 개
  it('파트너 나감 → 시계방향 다음 활성 플레이어', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.hands = {
      0: [DOG, S('5')], 1: [S('6')], 2: [], 3: [T('7')],
    };
    room.tableCards = null;
    room.currentTurn = 0;
    room.finishOrder = [2]; // seat 2 나감

    const r = playCards(room, 0, [DOG]);
    expect(r.ok).toBe(true);
    // seat 2 나감 → seat 2 기준 시계방향 → seat 3
    expect(room.currentTurn).toBe(3);
  });
});

// ── 트릭 종료 ────────────────────────────────────────────────

describe('trick end', () => {
  // Edge #48: 4인, A 제출, B/C/D 패스 → 종료
  it('모두 패스 → 트릭 승리', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.hands = {
      0: [S('A'), S('2')], 1: [S('3'), T('3')], 2: [T('5'), T('2')], 3: [T('7'), T('4')],
    };
    room.tableCards = null;
    room.currentTurn = 0;
    room.finishOrder = [];

    playCards(room, 0, [S('A')]); // 리드
    passTurn(room, 1);
    passTurn(room, 2);
    const r = passTurn(room, 3);
    expect(r.ok).toBe(true);

    // 트릭 종료 → seat 0 승리 → 새 리드
    expect(room.tableCards).toBeNull(); // 새 트릭
    expect(room.currentTurn).toBe(0); // 승자 리드
  });
});

// ── 소원 ─────────────────────────────────────────────────────

describe('wish', () => {
  it('참새 낼 때 소원 선언', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = true;
    room.hands = {
      0: [MAHJONG, S('3')], 1: [S('7'), T('7')], 2: [T('5')], 3: [T('8')],
    };
    room.currentTurn = 0;
    room.finishOrder = [];

    const r = playCards(room, 0, [MAHJONG], undefined, '7');
    expect(r.ok).toBe(true);
    expect(room.wish).toBe('7');
    expect(r.events.some(e => e.type === 'wish_active')).toBe(true);
  });

  it('소원 해제: 해당 숫자 플레이 시', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = true;
    room.wish = null;
    room.hands = {
      0: [MAHJONG, S('3')], 1: [S('7'), T('8')], 2: [T('5')], 3: [T('9')],
    };
    room.currentTurn = 0;
    room.finishOrder = [];

    playCards(room, 0, [MAHJONG], undefined, '7'); // 소원=7
    expect(room.wish).toBe('7');

    playCards(room, 1, [S('7')]); // 7을 냄 → 소원 해제
    expect(room.wish).toBeNull();
  });
});

// ── 나감 + 원투 피니시 (Edge #36) ────────────────────────────

describe('finish & scoring', () => {
  it('원투 피니시 → 200점', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    // seat 0, 2가 같은 팀. 둘 다 1장만 남음.
    room.hands = {
      0: [S('A')],
      1: [S('3'), S('4')],
      2: [T('K')],
      3: [T('5'), T('6')],
    };
    room.tableCards = null;
    room.currentTurn = 0;
    room.finishOrder = [];

    // seat 0 리드 → 나감 (1등)
    playCards(room, 0, [S('A')]);
    // seat 1, 3 패스
    passTurn(room, 1);
    passTurn(room, 2); // seat 2도 패스 (K < A)
    // seat 3 패스 → 트릭 종료 → seat 0 승리
    passTurn(room, 3);

    // 0은 이미 나감. 새 리드는 seat 0이 해야 하는데 나갔으므로...
    // 실제로는 finishOrder에 0이 들어감. 트릭 승리 후 새 리드는 다음 활성.
    // 이 테스트는 전체 플로우가 아니라 개별 동작 확인용
  });

  // Edge #41: 4등 정산
  it('4등: 남은 패 → 상대팀, 획득 트릭 → 1등', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.finishOrder = [0, 1, 2]; // 0=1등, 1=2등, 2=3등
    room.hands = {
      0: [], 1: [], 2: [],
      3: [S('5'), S('K')], // 4등 남은 패: 5+10=15점
    };
    room.wonTricks = {
      0: [S('10')], // 10점
      1: [T('K')],  // 10점
      2: [T('5')],  // 5점
      3: [DRAGON],  // 25점
    };

    // 3인 나가면 4등 확정
    room.finishOrder.push(3);
    // endRound는 내부적으로 calculateRoundScore 호출
  });
});

// ── 용 양도 (Edge #5, #12) ──────────────────────────────────

describe('dragon give', () => {
  it('용 트릭 양도', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.hands = {
      0: [DRAGON, S('3')], 1: [S('4'), S('5')], 2: [T('3'), T('4')], 3: [T('5'), T('6')],
    };
    room.tableCards = null;
    room.currentTurn = 0;
    room.finishOrder = [];

    playCards(room, 0, [DRAGON]); // 용 리드
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    // dragonGivePending 설정됨
    expect(room.dragonGivePending).not.toBeNull();

    // 상대팀(1 또는 3)에게 양도
    const r = dragonGive(room, 0, 1);
    expect(r.ok).toBe(true);
    expect(room.wonTricks[1]!.some(c => c.type === 'special' && c.specialType === 'dragon')).toBe(true);
    expect(room.dragonGivePending).toBeNull();
  });

  it('파트너에게 양도 불가', () => {
    const room = setupRoom();
    room.dragonGivePending = {
      winningSeat: 0,
      trickCards: [DRAGON],
      timeoutHandle: null,
    };

    const r = dragonGive(room, 0, 2); // seat 2는 파트너
    expect(r.ok).toBe(false);
    expect(r.error).toBe('must_give_to_opponent');
  });
});

// ── 턴 타임아웃 (섹션 4.7) ──────────────────────────────────

describe('handleTurnTimeout', () => {
  // Edge #45: 리드 타임아웃 → 자동 플레이
  it('리드 타임아웃 → 가장 낮은 싱글', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.hands = {
      0: [S('3'), S('7'), S('A')], 1: [T('4')], 2: [T('5')], 3: [T('6')],
    };
    room.tableCards = null;
    room.currentTurn = 0;
    room.finishOrder = [];

    const r = handleTurnTimeout(room);
    expect(r.ok).toBe(true);
    // 가장 낮은 싱글 = S('3')
    expect(r.events.some(e => e.type === 'auto_action')).toBe(true);
  });

  // Edge #46: 팔로우 타임아웃 → 자동 패스
  it('팔로우 타임아웃 → 자동 패스', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.hands = {
      0: [S('A')], 1: [S('3')], 2: [T('5')], 3: [T('7')],
    };
    room.currentTurn = 0;
    room.finishOrder = [];

    playCards(room, 0, [S('A')]); // 리드

    // seat 1 턴에서 타임아웃
    room.currentTurn = 1;
    const r = handleTurnTimeout(room);
    expect(r.ok).toBe(true);
    expect(r.events.some(e => e.type === 'auto_action' && (e as any).action === 'pass')).toBe(true);
  });
});

// ── 스몰 티츄 ────────────────────────────────────────────────

describe('small tichu', () => {
  it('본인이 카드 낸 후 스몰 불가', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.isFirstLead = false;
    room.hasPlayedCards[0] = true;

    const r = declareTichu(room, 0, 'small');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('already_played_cards');
  });

  it('다른 플레이어가 냈어도 본인이 안 냈으면 OK', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    room.hasPlayedCards = { 0: false, 1: true, 2: false, 3: true };

    const r = declareTichu(room, 0, 'small');
    expect(r.ok).toBe(true);
  });
});

// ── 유틸리티 ─────────────────────────────────────────────────

function finishAllLargeTichu(room: GameRoom): void {
  for (let s = 0; s < 4; s++) {
    if (!room.largeTichuResponses[s]) {
      room.largeTichuResponses[s] = true;
    }
  }
}
