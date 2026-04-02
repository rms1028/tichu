import type { Card } from './types.js';
import { getCardPoints } from './constants.js';

/**
 * 카드 배열의 총 점수 계산.
 */
export function sumPoints(cards: Card[]): number {
  return cards.reduce((sum, card) => sum + getCardPoints(card), 0);
}

export interface RoundScoreInput {
  /** 각 seat의 획득 트릭 카드 */
  wonTricks: Record<number, Card[]>;
  /** 나간 순서 (seat 번호 배열, [1등, 2등, 3등, 4등]) */
  finishOrder: number[];
  /** 티츄 선언: seat → 'large' | 'small' | null */
  tichuDeclarations: Record<number, 'large' | 'small' | null>;
  /** 4등의 남은 핸드 */
  lastPlayerHand: Card[];
  /** 팀 구성 */
  teams: { team1: [number, number]; team2: [number, number] };
}

export interface RoundScoreResult {
  team1: number;
  team2: number;
  details: {
    team1CardPoints: number;
    team2CardPoints: number;
    tichuBonuses: Record<number, number>;
    oneTwoFinish: boolean;
  };
}

/**
 * 라운드 종료 시 점수 정산.
 *
 * 원투 피니시: 해당 팀 200점, 상대 0점 (카드 점수 무시).
 * 일반 종료:
 *   - 4등 남은 핸드 → 상대팀 점수에 합산
 *   - 4등 획득 트릭 → 1등에게 양도
 *   - 나머지는 자기 획득 트릭 점수
 * 티츄 보너스는 별도 가산.
 */
export function calculateRoundScore(input: RoundScoreInput): RoundScoreResult {
  const { wonTricks, finishOrder, tichuDeclarations, lastPlayerHand, teams } = input;
  const [t1a, t1b] = teams.team1;
  const [t2a, t2b] = teams.team2;

  const isTeam1 = (seat: number) => seat === t1a || seat === t1b;

  // 티츄 보너스 계산
  const tichuBonuses: Record<number, number> = {};
  for (const [seatStr, decl] of Object.entries(tichuDeclarations)) {
    const seat = Number(seatStr);
    if (!decl) continue;
    const bonus = decl === 'large' ? 200 : 100;
    const isFirst = finishOrder[0] === seat;
    tichuBonuses[seat] = isFirst ? bonus : -bonus;
  }

  let team1Tichu = 0;
  let team2Tichu = 0;
  for (const [seatStr, bonus] of Object.entries(tichuBonuses)) {
    if (isTeam1(Number(seatStr))) team1Tichu += bonus;
    else team2Tichu += bonus;
  }

  // 원투 피니시 체크
  const first = finishOrder[0]!;
  const second = finishOrder[1]!;
  const oneTwoFinish = isTeam1(first) === isTeam1(second);

  if (oneTwoFinish) {
    const winTeamIs1 = isTeam1(first);
    return {
      team1: (winTeamIs1 ? 200 : 0) + team1Tichu,
      team2: (winTeamIs1 ? 0 : 200) + team2Tichu,
      details: {
        team1CardPoints: winTeamIs1 ? 200 : 0,
        team2CardPoints: winTeamIs1 ? 0 : 200,
        tichuBonuses,
        oneTwoFinish: true,
      },
    };
  }

  // 일반 종료
  const fourth = finishOrder[3]!;
  const fourthIsTeam1 = isTeam1(fourth);

  // 4등 획득 트릭 → 1등에게 양도
  const fourthTricks = wonTricks[fourth] ?? [];
  const mergedWonTricks: Record<number, Card[]> = {};
  for (const [seatStr, cards] of Object.entries(wonTricks)) {
    const seat = Number(seatStr);
    mergedWonTricks[seat] = [...cards];
  }
  // 4등 트릭 → 1등
  if (!mergedWonTricks[first]) mergedWonTricks[first] = [];
  mergedWonTricks[first]!.push(...fourthTricks);
  mergedWonTricks[fourth] = [];

  // 4등 남은 핸드 → 상대팀 점수
  const lastHandPoints = sumPoints(lastPlayerHand);

  // 각 팀 카드 점수 합산
  let team1CardPoints = 0;
  let team2CardPoints = 0;

  for (const [seatStr, cards] of Object.entries(mergedWonTricks)) {
    const seat = Number(seatStr);
    const pts = sumPoints(cards);
    if (isTeam1(seat)) team1CardPoints += pts;
    else team2CardPoints += pts;
  }

  // 4등 남은 핸드 → 상대팀
  if (fourthIsTeam1) team2CardPoints += lastHandPoints;
  else team1CardPoints += lastHandPoints;

  return {
    team1: team1CardPoints + team1Tichu,
    team2: team2CardPoints + team2Tichu,
    details: {
      team1CardPoints,
      team2CardPoints,
      tichuBonuses,
      oneTwoFinish: false,
    },
  };
}
