import { useMemo } from 'react';
import type { Card, Rank } from '@tichu/shared';
import { getValidPlays, isNormalCard, isPhoenix, RANK_VALUES } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';

/** 현재 턴에서 낼 수 있는 플레이 목록 */
export function useValidPlays() {
  const myHand = useGameStore((s) => s.myHand);
  const tableCards = useGameStore((s) => s.tableCards);
  const wish = useGameStore((s) => s.wish);
  const isMyTurn = useGameStore((s) => s.isMyTurn);

  return useMemo(() => {
    if (!isMyTurn) return [];
    return getValidPlays(myHand, tableCards, wish);
  }, [myHand, tableCards, wish, isMyTurn]);
}

/** 내 팀과 상대팀 정보 */
export function useTeamInfo() {
  const mySeat = useGameStore((s) => s.mySeat);
  const scores = useGameStore((s) => s.scores);
  const players = useGameStore((s) => s.players);

  return useMemo(() => {
    const partnerSeat = (mySeat + 2) % 4;
    const leftOpponent = (mySeat + 1) % 4;
    const rightOpponent = (mySeat + 3) % 4;

    const myTeam = mySeat === 0 || mySeat === 2 ? 'team1' : 'team2';
    const opponentTeam = myTeam === 'team1' ? 'team2' : 'team1';

    return {
      mySeat,
      partnerSeat,
      leftOpponent,
      rightOpponent,
      myTeam,
      opponentTeam,
      myScore: scores[myTeam],
      opponentScore: scores[opponentTeam],
      partner: players[partnerSeat],
      left: players[leftOpponent],
      right: players[rightOpponent],
    };
  }, [mySeat, scores, players]);
}

/** 카드 정렬 (핸드 표시용) */
export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const va = cardSortValue(a);
    const vb = cardSortValue(b);
    if (va !== vb) return va - vb;
    // 같은 값이면 문양 순서
    if (isNormalCard(a) && isNormalCard(b)) {
      const suitOrder = { sword: 0, star: 1, jade: 2, pagoda: 3 };
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return 0;
  });
}

function cardSortValue(card: Card): number {
  if (card.type === 'special') {
    switch (card.specialType) {
      case 'dog': return 0;
      case 'mahjong': return 1;
      case 'phoenix': return 15;
      case 'dragon': return 16;
    }
  }
  return card.value;
}

/** 카드의 표시명 */
export function getCardDisplayName(card: Card): string {
  if (card.type === 'special') {
    switch (card.specialType) {
      case 'mahjong': return '참새';
      case 'dog': return '개';
      case 'phoenix': return '봉황';
      case 'dragon': return '용';
    }
  }
  return card.rank;
}

/** 문양 심볼 — `\uFE0E` (text variation selector) 로 이모지 렌더링 강제 억제.
 * Android/Samsung 시스템 폰트가 ♠♥♦♣ 를 컬러 이모지로 그리면 `color` 스타일이
 * 무시되고 ♠♣ 는 검정, ♥♦ 는 빨강으로 고정됨 → jade(초록)/pagoda(파랑) 가 사라짐.
 * `\uFE0E` 는 "이 문자는 일반 텍스트로 그려" 라는 유니코드 표준 힌트.
 */
export function getSuitSymbol(card: Card): string {
  if (card.type !== 'normal') return '';
  switch (card.suit) {
    case 'sword': return '\u2660\uFE0E'; // ♠
    case 'star': return '\u2665\uFE0E';  // ♥
    case 'jade': return '\u2666\uFE0E';  // ♦
    case 'pagoda': return '\u2663\uFE0E'; // ♣
  }
}

/** 카드 텍스트 색상 — 검/파/초/빨 */
export function getCardColor(card: Card): string {
  if (card.type === 'special') {
    switch (card.specialType) {
      case 'mahjong': return '#8b6914';  // 짙은 금색
      case 'dog': return '#37474f';      // 짙은 회색
      case 'phoenix': return '#e65100';  // 주황
      case 'dragon': return '#b71c1c';   // 짙은 빨강
    }
  }
  switch (card.suit) {
    case 'sword': return '#000000';  // 검정
    case 'star': return '#d50000';   // 빨강
    case 'jade': return '#2e7d32';   // 초록
    case 'pagoda': return '#1565c0'; // 파랑
  }
}

/** 카드 배경 색상 */
export function getSuitBgColor(card: Card): string {
  if (card.type === 'special') return '#f5f0e8';
  switch (card.suit) {
    case 'sword': return '#f5f5f5';  // 밝은 회색
    case 'star': return '#ffebee';   // 연분홍
    case 'jade': return '#e8f5e9';   // 연초록
    case 'pagoda': return '#e3f2fd'; // 연파랑
  }
}

/** 특수카드 이모지 */
export function getSpecialIcon(card: Card): string {
  if (card.type !== 'special') return '';
  switch (card.specialType) {
    case 'mahjong': return '\uD83D\uDC26';  // 🐦
    case 'dog': return '\uD83D\uDC15';      // 🐕
    case 'phoenix': return '\uD83E\uDD85';  // 🦅
    case 'dragon': return '\uD83D\uDC09';   // 🐉
  }
}
