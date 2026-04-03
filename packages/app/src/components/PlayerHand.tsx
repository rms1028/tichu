import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { isMobile, mob } from '../utils/responsive';
import type { Card, PlayedHand } from '@tichu/shared';
import { isNormalCard, getAvailableBombs, validateHand, isBomb } from '@tichu/shared';
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

/** 핸드에서 폭탄 그룹을 찾는다 */
function findBombGroups(hand: Card[]): BombGroupInfo[] {
  const groups: BombGroupInfo[] = [];
  const normals = hand.filter(isNormalCard);

  // 포카드
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

  // SF: 같은 문양 연속 5장+
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

interface PlayerHandProps {
  onSubmitBombCards?: (cards: Card[]) => void;
}

export function PlayerHand({ onSubmitBombCards }: PlayerHandProps) {
  const myHand = useGameStore((s) => s.myHand);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const toggleCard = useGameStore((s) => s.toggleCardSelection);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const bombWindow = useGameStore((s) => s.bombWindow);
  const tableCards = useGameStore((s) => s.tableCards);
  const phase = useGameStore((s) => s.phase);

  const sorted = sortHand(myHand);

  const bombGroups = useMemo(() => findBombGroups(myHand), [myHand]);

  // 폭탄 그룹에 속하는 카드 키
  const bombCardKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const g of bombGroups) {
      for (const k of g.keys) keys.add(k);
    }
    return keys;
  }, [bombGroups]);

  // 폭탄 분리 모드 토글 (false = 합침, true = 분리)
  const [bombSplit, setBombSplit] = useState(true);

  // 리드 시(테이블 비어있음)에는 폭탄 분리 안 함
  const isLead = tableCards === null;

  // 실제 분리 여부: 리드 시 또는 토글 OFF면 합침
  const effectiveSplit = !isLead && bombSplit && bombGroups.length > 0;

  // 폭탄을 낼 수 있는 상태: 트릭 진행 중 + 테이블에 카드가 있으면 언제든
  const canBomb = phase === 'TRICK_PLAY' && !isLead && bombGroups.length > 0;

  // 일반 카드 선택은 내 턴이거나 폭탄 윈도우일 때만
  const canSelectNormal = isMyTurn || (bombWindow !== null && bombWindow.canSubmitBomb);

  const normalCards = effectiveSplit ? sorted.filter(c => !bombCardKeys.has(cardKey(c))) : sorted;
  const showBombGroups = effectiveSplit;

  // 폭탄 카드 탭 → 즉시 제출
  const handleBombGroupPress = (group: BombGroupInfo) => {
    if (!canBomb || !onSubmitBombCards) return;
    onSubmitBombCards(group.cards);
  };

  const handleCardPress = (card: Card) => {
    if (!canSelectNormal) return;
    toggleCard(card);
  };

  const cardOverlap = isMobile ? -22 : -28;
  const bombCardOverlap = isMobile ? -20 : -22;

  const normalCount = normalCards.length;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scroll}
    >
      {/* 일반 카드 */}
      {normalCards.map((card, i) => {
        const isSelected = selectedCards.some(c => cardEquals(c, card));
        const isBombMember = bombCardKeys.has(cardKey(card));
        const centerIdx = (normalCount - 1) / 2;
        const signedOffset = i - centerIdx;
        const absOffset = Math.abs(signedOffset);
        const archDrop = absOffset * 0.7;
        const rotation = signedOffset * 0.6;

        return (
          <View
            key={`${card.type}-${card.type === 'normal' ? `${card.suit}-${card.rank}` : card.specialType}-${i}`}
            style={[
              styles.cardSlot,
              {
                marginLeft: i === 0 ? 0 : cardOverlap,
                marginTop: archDrop,
                zIndex: i,
                transform: [{ rotate: `${rotation}deg` }],
              },
            ]}
          >
            <CardView
              card={card}
              selected={isSelected}
              isBombCard={isBombMember}
              onPress={() => handleCardPress(card)}
              disabled={!canSelectNormal}
            />
          </View>
        );
      })}

      {/* 폭탄 토글 버튼 (폭탄이 있고 팔로우 시) */}
      {canBomb && (
        <TouchableOpacity style={styles.splitToggle} onPress={() => setBombSplit(!bombSplit)} activeOpacity={0.7}>
          <Text style={styles.splitToggleIcon}>{bombSplit ? '🔓' : '🔗'}</Text>
          <Text style={styles.splitToggleText}>{bombSplit ? '합침' : '분리'}</Text>
        </TouchableOpacity>
      )}

      {/* 폭탄 그룹 (분리 모드일 때만) */}
      {showBombGroups && (
        <>

          {bombGroups.map((group, gi) => (
            <TouchableOpacity
              key={`bomb-${gi}`}
              onPress={() => handleBombGroupPress(group)}
              activeOpacity={0.7}
              disabled={!canBomb}
              style={[styles.bombGroup, gi > 0 && { marginLeft: 8 }]}
            >
              {/* 폭탄 라벨 */}
              <View style={[styles.bombLabel, canBomb && styles.bombLabelActive]}>
                <Text style={styles.bombLabelIcon}>{'💣'}</Text>
                <Text style={[styles.bombLabelText, canBomb && styles.bombLabelTextActive]}>{group.label}</Text>
              </View>

              {/* 폭탄 카드들 */}
              <View style={styles.bombCards}>
                {group.cards.map((card, ci) => (
                  <View
                    key={cardKey(card)}
                    style={[
                      styles.cardSlot,
                      { marginLeft: ci === 0 ? 0 : bombCardOverlap, zIndex: ci },
                    ]}
                  >
                    <CardView
                      card={card}
                      isBombCard={true}
                      disabled={!canBomb}
                      onPress={() => handleBombGroupPress(group)}
                    />
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
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
    paddingHorizontal: 12,
    paddingVertical: mob(4, 4),
    minWidth: '100%',
  },
  cardSlot: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
  splitToggle: {
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
    paddingBottom: 6,
    paddingHorizontal: 6,
    minWidth: 36,
    minHeight: 44,
    gap: 2,
  },
  splitToggleIcon: {
    fontSize: 16,
  },
  splitToggleText: {
    color: 'rgba(155,89,182,0.6)',
    fontSize: 11,
    fontWeight: '700',
  },
  bombGroup: {
    alignItems: 'center',
  },
  bombLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(155,89,182,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(155,89,182,0.2)',
  },
  bombLabelActive: {
    backgroundColor: 'rgba(155,89,182,0.35)',
    borderColor: '#9b59b6',
  },
  bombLabelIcon: {
    fontSize: 10,
  },
  bombLabelText: {
    color: 'rgba(155,89,182,0.5)',
    fontSize: 10,
    fontWeight: '800',
  },
  bombLabelTextActive: {
    color: '#D4A5E5',
  },
  bombCards: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
});
