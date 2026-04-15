import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { isMobile, mob } from '../utils/responsive';
import type { Card, PlayedHand } from '@tichu/shared';
import { isNormalCard, validateHand } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { sortHand } from '../hooks/useGame';
import { CardView } from './CardView';

function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') return a.specialType === b.specialType;
  if (a.type === 'normal' && b.type === 'normal') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

function cardKey(card: Card): string {
  if (card.type === 'special') return card.specialType;
  return `${card.suit}-${card.rank}`;
}

interface BombGroupInfo {
  cards: Card[];
  keys: Set<string>;
  label: string;
  playedHand: PlayedHand | null;
}

function findBombGroups(hand: Card[]): BombGroupInfo[] {
  const groups: BombGroupInfo[] = [];
  const normals = hand.filter(isNormalCard);
  const byValue = new Map<number, Card[]>();
  for (const c of normals) {
    const arr = byValue.get((c as any).value) ?? [];
    arr.push(c);
    byValue.set((c as any).value, arr);
  }
  for (const [, group] of byValue) {
    if (group.length === 4) {
      const ph = validateHand([...group]);
      const rank = (group[0] as any).rank;
      groups.push({ cards: group, keys: new Set(group.map(cardKey)), label: `${rank}×4`, playedHand: ph });
    }
  }
  const bySuit = new Map<string, Card[]>();
  for (const c of normals) {
    const arr = bySuit.get((c as any).suit) ?? [];
    arr.push(c);
    bySuit.set((c as any).suit, arr);
  }
  for (const [, group] of bySuit) {
    if (group.length < 5) continue;
    const sorted = [...group].sort((a, b) => (a as any).value - (b as any).value);
    let run: Card[] = [sorted[0]!];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] as any).value === (sorted[i - 1] as any).value + 1) {
        run.push(sorted[i]!);
      } else {
        if (run.length >= 5) {
          const ph = validateHand([...run]);
          const suitSymbols: Record<string, string> = { sword: '⚔', star: '★', jade: '●', pagoda: '▲' };
          const suit = (run[0] as any).suit as string;
          const sym = suitSymbols[suit] ?? '♠';
          groups.push({ cards: [...run], keys: new Set(run.map(cardKey)), label: `${sym}${(run[0] as any).rank}-${(run[run.length - 1] as any).rank}`, playedHand: ph });
        }
        run = [sorted[i]!];
      }
    }
    if (run.length >= 5) {
      const ph = validateHand([...run]);
      const suitSymbols: Record<string, string> = { sword: '⚔', star: '★', jade: '●', pagoda: '▲' };
      const suit = (run[0] as any).suit as string;
      const sym = suitSymbols[suit] ?? '♠';
      groups.push({ cards: [...run], keys: new Set(run.map(cardKey)), label: `${sym}${(run[0] as any).rank}-${(run[run.length - 1] as any).rank}`, playedHand: ph });
    }
  }
  return groups;
}

export function PlayerHand() {
  const myHand = useGameStore((s) => s.myHand);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const toggleCard = useGameStore((s) => s.toggleCardSelection);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const tableCards = useGameStore((s) => s.tableCards);
  const phase = useGameStore((s) => s.phase);
  const mySeat = useGameStore((s) => s.mySeat);
  const tichuDeclarations = useGameStore((s) => s.tichuDeclarations);
  const myTichu = tichuDeclarations[mySeat] ?? null;

  const sorted = sortHand(myHand);
  const bombGroups = useMemo(() => findBombGroups(myHand), [myHand]);
  const bombCardKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const g of bombGroups) {
      for (const k of g.keys) keys.add(k);
    }
    return keys;
  }, [bombGroups]);

  const canSelectNormal = isMyTurn;
  const hasBombs = bombGroups.length > 0;

  const normalCards = sorted;
  const normalCount = normalCards.length;

  const handleCardPress = (card: Card) => {
    // 내 턴이면 모든 카드 선택 가능
    if (canSelectNormal) { toggleCard(card); return; }
    // 내 턴이 아니어도 폭탄 카드는 선택 가능 (TRICK_PLAY 중)
    if (phase === 'TRICK_PLAY' && hasBombs && bombCardKeys.has(cardKey(card))) {
      toggleCard(card);
      return;
    }
  };

  // 모바일 2줄 모드: 9장 이상이면 2줄
  const useTwoRows = isMobile && normalCount >= 9;

  // 폭탄 카드는 TRICK_PLAY 중 언제든 선택 가능
  const canPressBomb = phase === 'TRICK_PLAY' && hasBombs;

  // 1줄 렌더링
  const renderSingleRow = (cards: Card[], overlapPx: number) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowContainer}>
      {cards.map((card, i) => {
        const isSelected = selectedCards.some(c => cardEquals(c, card));
        const isBombMember = bombCardKeys.has(cardKey(card));
        const cardDisabled = !canSelectNormal && !(canPressBomb && isBombMember);
        return (
          <View
            key={`${cardKey(card)}-${i}`}
            style={[styles.cardSlot, { marginLeft: i === 0 ? 0 : overlapPx, zIndex: i }]}
          >
            <CardView
              card={card}
              selected={isSelected}
              isBombCard={isBombMember}
              onPress={() => handleCardPress(card)}
              disabled={cardDisabled}
            />
          </View>
        );
      })}
    </ScrollView>
  );

  if (useTwoRows) {
    // 2줄: 윗줄 = 낮은 카드, 아랫줄 = 높은 카드
    const half = Math.ceil(normalCount / 2);
    const topRow = normalCards.slice(0, half);   // 낮은 카드
    const botRow = normalCards.slice(half);       // 높은 카드
    // 오버랩 계산: 카드폭 50, 화면 380
    const calcOverlap = (count: number) => count > 1 ? -Math.max(14, 56 - (370 - 56) / (count - 1)) : 0;

    return (
      <View style={[styles.twoRowWrap, myTichu && styles.tichuGlowWrap, myTichu === 'large' && styles.tichuGlowLarge]}>
        <View key="row-top">{renderSingleRow(topRow, calcOverlap(topRow.length))}</View>
        <View key="row-bot">{renderSingleRow(botRow, calcOverlap(botRow.length))}</View>
      </View>
    );
  }

  // PC / 모바일 8장 이하: 기존 1줄 아치형
  const cardWidth = isMobile ? 56 : 72;
  const screenWidth = isMobile ? 380 : 900;
  const autoOverlap = normalCount > 1 ? -Math.max(20, cardWidth - (screenWidth - cardWidth) / (normalCount - 1)) : 0;
  const cardOverlap = isMobile ? autoOverlap : -28;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={[styles.scroll, myTichu && styles.tichuGlowWrap, myTichu === 'large' && styles.tichuGlowLarge]}
    >
      {normalCards.map((card, i) => {
        const isSelected = selectedCards.some(c => cardEquals(c, card));
        const isBombMember = bombCardKeys.has(cardKey(card));
        const cardDisabled = !canSelectNormal && !(canPressBomb && isBombMember);
        const centerIdx = (normalCount - 1) / 2;
        const signedOffset = i - centerIdx;
        const absOffset = Math.abs(signedOffset);
        const archDrop = absOffset * 0.7;
        const rotation = signedOffset * 0.6;
        return (
          <View
            key={`${cardKey(card)}-${i}`}
            style={[styles.cardSlot, {
              marginLeft: i === 0 ? 0 : cardOverlap,
              marginTop: archDrop,
              zIndex: i,
              transform: [{ rotate: `${rotation}deg` }],
            }]}
          >
            <CardView
              card={card}
              selected={isSelected}
              isBombCard={isBombMember}
              onPress={() => handleCardPress(card)}
              disabled={cardDisabled}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
    ...(isMobile ? {} : { maxWidth: 900, alignSelf: 'center' as const, width: '100%' }),
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: mob(2, 4),
    minWidth: '100%',
  },
  // 2줄 모드
  twoRowWrap: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  // 내가 티츄 선언 중일 때 핸드에 글로우 테두리
  tichuGlowWrap: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#f39c12',
    shadowColor: '#f39c12',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 12,
  },
  tichuGlowLarge: {
    borderColor: '#e74c3c',
    shadowColor: '#e74c3c',
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: '100%',
  },
  cardSlot: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
});
