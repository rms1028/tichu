import { describe, it, expect } from 'vitest';
import { sumPoints, calculateRoundScore } from './scoring.js';
import { normalCard, DRAGON, PHOENIX, DOG, MAHJONG, createDeck } from './constants.js';
import type { Card } from './types.js';

const S = (r: Parameters<typeof normalCard>[1]) => normalCard('sword', r);
const T = (r: Parameters<typeof normalCard>[1]) => normalCard('star', r);

describe('sumPoints', () => {
  it('5 → 5점', () => {
    expect(sumPoints([S('5')])).toBe(5);
  });

  it('10 → 10점', () => {
    expect(sumPoints([S('10')])).toBe(10);
  });

  it('K → 10점', () => {
    expect(sumPoints([S('K')])).toBe(10);
  });

  it('용 → 25점', () => {
    expect(sumPoints([DRAGON])).toBe(25);
  });

  it('봉황 → -25점', () => {
    expect(sumPoints([PHOENIX])).toBe(-25);
  });

  it('그 외 → 0점', () => {
    expect(sumPoints([S('2'), S('3'), S('7'), S('J'), S('A')])).toBe(0);
  });

  it('전체 덱 합계 100점', () => {
    expect(sumPoints(createDeck())).toBe(100);
  });
});

describe('calculateRoundScore', () => {
  const teams = { team1: [0, 2] as [number, number], team2: [1, 3] as [number, number] };

  // Edge #36: 원투 피니시
  it('원투 피니시 → 200:0', () => {
    const result = calculateRoundScore({
      wonTricks: { 0: [], 1: [], 2: [], 3: [] },
      finishOrder: [0, 2, 1, 3], // team1이 1등+2등
      tichuDeclarations: { 0: null, 1: null, 2: null, 3: null },
      lastPlayerHand: [],
      teams,
    });
    expect(result.team1).toBe(200);
    expect(result.team2).toBe(0);
    expect(result.details.oneTwoFinish).toBe(true);
  });

  it('상대팀 원투 피니시', () => {
    const result = calculateRoundScore({
      wonTricks: { 0: [], 1: [], 2: [], 3: [] },
      finishOrder: [1, 3, 0, 2],
      tichuDeclarations: { 0: null, 1: null, 2: null, 3: null },
      lastPlayerHand: [],
      teams,
    });
    expect(result.team1).toBe(0);
    expect(result.team2).toBe(200);
  });

  // Edge #41: 4등 정산
  it('일반 종료: 4등 남은패→상대, 획득트릭→1등', () => {
    const result = calculateRoundScore({
      wonTricks: {
        0: [S('5'), S('10')],     // 1등: 15점
        1: [S('K')],               // 10점
        2: [T('5')],               // 5점
        3: [DRAGON, PHOENIX],      // 4등: 25-25=0
      },
      finishOrder: [0, 1, 2, 3],
      tichuDeclarations: { 0: null, 1: null, 2: null, 3: null },
      lastPlayerHand: [T('10'), T('K')], // 4등 남은 패: 20점
      teams,
    });
    // 4등(seat3, team2) 트릭 → 1등(seat0, team1)
    // team1: 15(seat0) + 0(4등 트릭→1등) + 5(seat2) + 20(4등 남은패→team1, 아니 team2의 상대)
    // 4등은 team2 → 남은패는 team1에
    // team1 = seat0(15) + seat2(5) + 4등트릭(0, 이미 team2→1등으로) + 4등남은패(20) = 40
    // team2 = seat1(10)
    // 아 잠깐, 4등 트릭을 1등에게 양도
    // seat3(team2) 트릭(0점) → seat0(team1)으로
    // seat3 남은패(20점) → 상대팀(team1)으로
    // team1 = 15 + 5 + 0(4등트릭) + 20(4등남은패) = 40
    // team2 = 10
    // 총합은 50... 아니, 점수 계산이 정확한지 확인
    expect(result.team1).toBe(40);
    expect(result.team2).toBe(10);
  });

  // 티츄 보너스 테스트
  it('스몰 티츄 성공 → +100', () => {
    const result = calculateRoundScore({
      wonTricks: { 0: [], 1: [], 2: [], 3: [] },
      finishOrder: [0, 2, 1, 3], // 원투
      tichuDeclarations: { 0: 'small', 1: null, 2: null, 3: null },
      lastPlayerHand: [],
      teams,
    });
    expect(result.team1).toBe(200 + 100); // 원투 200 + 스몰 성공 100
    expect(result.team2).toBe(0);
  });

  it('라지 티츄 실패 → -200', () => {
    const result = calculateRoundScore({
      wonTricks: { 0: [], 1: [], 2: [], 3: [] },
      finishOrder: [1, 3, 0, 2], // team2 원투, seat0 라지 실패
      tichuDeclarations: { 0: 'large', 1: null, 2: null, 3: null },
      lastPlayerHand: [],
      teams,
    });
    expect(result.team1).toBe(0 - 200); // 원투 0 + 라지 실패 -200
    expect(result.team2).toBe(200);
  });
});
