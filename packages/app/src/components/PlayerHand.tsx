import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { isMobile, mob } from '../utils/responsive';
import type { Card } from '@tichu/shared';
import { isNormalCard } from '@tichu/shared';
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

interface BombGroup {
  cards: Card[];
  keys: Set<string>;
}

/** 핸드에서 폭탄 그룹을 찾는다 */
function findBombGroups(hand: Card[]): BombGroup[] {
  const groups: BombGroup[] = [];
  const normals = hand.filter(isNormalCard);

  // 포카드
  const byValue = new Map<number, Card[]>();
  for (const c of normals) {
    const group = byValue.get(c.value) ?? [];
    group.push(c);
    byValue.set(c.value, group);
  }
  for (const [, group] of byValue) {
    if (group.length === 4) {
      groups.push({ cards: group, keys: new Set(group.map(cardKey)) });
    }
  }

  // SF: 같은 문양 연속 5장+
  const bySuit = new Map<string, Card[]>();
  for (const c of normals) {
    const group = bySuit.get(c.suit) ?? [];
    group.push(c);
    bySuit.set(c.suit, group);
  }
  for (const [, group] of bySuit) {
    if (group.length < 5) continue;
    const sorted = [...group].sort((a, b) => a.value - b.value);
    let run: Card[] = [sorted[0]!];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.value === sorted[i - 1]!.value + 1) {
        run.push(sorted[i]!);
      } else {
        if (run.length >= 5) {
          groups.push({ cards: [...run], keys: new Set(run.map(cardKey)) });
        }
        run = [sorted[i]!];
      }
    }
    if (run.length >= 5) {
      groups.push({ cards: [...run], keys: new Set(run.map(cardKey)) });
    }
  }

  return groups;
}

export function PlayerHand() {
  const myHand = useGameStore((s) => s.myHand);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const toggleCard = useGameStore((s) => s.toggleCardSelection);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const bombWindow = useGameStore((s) => s.bombWindow);

  const sorted = sortHand(myHand);

  const bombGroups = useMemo(() => findBombGroups(myHand), [myHand]);
  const bombCardKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const g of bombGroups) {
      for (const k of g.keys) keys.add(k);
    }
    return keys;
  }, [bombGroups]);

  const canInteract = isMyTurn || (bombWindow !== null && bombWindow.canSubmitBomb);

  /** 폭탄 카드 탭 시 해당 폭탄 그룹 전체를 토글 */
  const handleCardPress = (card: Card) => {
    const key = cardKey(card);
    const bombGroup = bombGroups.find(g => g.keys.has(key));

    if (bombGroup) {
      const allSelected = bombGroup.cards.every(c =>
        selectedCards.some(sc => cardEquals(sc, c))
      );
      if (allSelected) {
        for (const c of bombGroup.cards) {
          if (selectedCards.some(sc => cardEquals(sc, c))) {
            toggleCard(c);
          }
        }
      } else {
        const store = useGameStore.getState();
        store.clearSelection();
        for (const c of bombGroup.cards) {
          store.toggleCardSelection(c);
        }
      }
    } else {
      toggleCard(card);
    }
  };

  const cardCount = sorted.length;
  const cardOverlap = isMobile ? -26 : -28;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      style={styles.scroll}
    >
      {sorted.map((card, i) => {
        const isSelected = selectedCards.some(c => cardEquals(c, card));
        const key = cardKey(card);
        const isBombCard = bombCardKeys.has(key);

        // 미세한 부채꼴: 중앙이 높고, 양쪽이 살짝 내려감 + 미세 회전
        const centerIdx = (cardCount - 1) / 2;
        const signedOffset = i - centerIdx;
        const absOffset = Math.abs(signedOffset);
        const archDrop = absOffset * 0.7;
        const rotation = signedOffset * 0.6; // 카드당 0.6도

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
              isBombCard={isBombCard}
              onPress={() => handleCardPress(card)}
              disabled={!canInteract}
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
    paddingHorizontal: 16,
    paddingVertical: mob(6, 4),
    flexGrow: 1,
  },
  cardSlot: {
    // 그림자
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
  },
});
