import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  SlideInRight,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import type { PlayedHand, Card } from '@tichu/shared';
import { getAvailableBombs, isNormalCard } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { COLORS, FONT } from '../utils/theme';
import { haptics } from '../utils/haptics';

interface BombOverlayProps {
  onSubmitBombCards: (cards: Card[]) => void;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function bombLabel(bomb: PlayedHand): string {
  if (bomb.type === 'four_bomb') {
    const card = bomb.cards.find(c => c.type === 'normal');
    if (card && card.type === 'normal') return `${card.rank}×4`;
    return '4bomb';
  }
  // straight flush
  const sorted = bomb.cards
    .filter(isNormalCard)
    .sort((a, b) => (a as any).value - (b as any).value);
  if (sorted.length === 0) return 'SF';
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const suitSymbols: Record<string, string> = { sword: '⚔', star: '⭐', jade: '🟢', pagoda: '🏯' };
  const suit = (first as any).suit as string;
  const symbol = suitSymbols[suit] ?? '♠';
  return `${symbol}${(first as any).rank}-${(last as any).rank}`;
}

export function BombOverlay({ onSubmitBombCards }: BombOverlayProps) {
  const bombWindow = useGameStore((s) => s.bombWindow);
  const myHand = useGameStore((s) => s.myHand);
  const tableCards = useGameStore((s) => s.tableCards);
  const phase = useGameStore((s) => s.phase);
  const [remainingMs, setRemainingMs] = useState(0);

  // 현재 가능한 폭탄 목록 (항상 계산 — 미리 보여주기)
  const availableBombs = useMemo(() => {
    if (phase !== 'TRICK_PLAY' || !tableCards) return [];
    return getAvailableBombs(myHand, tableCards);
  }, [phase, myHand, tableCards]);

  // 폭탄 윈도우 타이머
  useEffect(() => {
    if (!bombWindow) { setRemainingMs(0); return; }
    setRemainingMs(bombWindow.remainingMs);
    const iv = setInterval(() => {
      setRemainingMs(prev => {
        const next = prev - 100;
        if (next <= 0) { clearInterval(iv); return 0; }
        return next;
      });
    }, 100);
    return () => clearInterval(iv);
  }, [bombWindow]);

  // 펄스 애니메이션 (폭탄 윈도우 활성 시)
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (bombWindow && availableBombs.length > 0) {
      haptics.heavyTap();
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 300 }),
          withTiming(1.0, { duration: 300 }),
        ),
        -1,
        true,
      );
    } else {
      pulse.value = 1;
    }
  }, [bombWindow, availableBombs.length]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const handleBomb = (bomb: PlayedHand) => {
    haptics.heavyTap();
    onSubmitBombCards(bomb.cards);
  };

  // 폭탄이 없으면 숨김
  if (availableBombs.length === 0) return null;

  const isWindowActive = bombWindow && bombWindow.canSubmitBomb;
  const seconds = bombWindow ? (remainingMs / 1000).toFixed(1) : null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={styles.container}
    >
      {/* 타이머 뱃지 */}
      {isWindowActive && (
        <Animated.View entering={FadeIn.duration(150)} style={styles.timerBadge}>
          <Text style={styles.timerText}>{seconds}s</Text>
        </Animated.View>
      )}

      {/* 폭탄 칩 목록 */}
      <View style={styles.chipList}>
        {availableBombs.map((bomb, i) => (
          <AnimatedTouchable
            key={i}
            style={[
              styles.chip,
              isWindowActive && styles.chipActive,
              isWindowActive && pulseStyle,
            ]}
            onPress={() => handleBomb(bomb)}
            activeOpacity={0.7}
          >
            <Text style={styles.chipIcon}>{'💣'}</Text>
            <Text style={[styles.chipLabel, isWindowActive && styles.chipLabelActive]}>
              {bombLabel(bomb)}
            </Text>
          </AnimatedTouchable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerBadge: {
    backgroundColor: 'rgba(155,89,182,0.3)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timerText: {
    color: '#D4A5E5',
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'] as any,
  },
  chipList: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(155,89,182,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(155,89,182,0.25)',
  },
  chipActive: {
    backgroundColor: 'rgba(155,89,182,0.4)',
    borderColor: '#9b59b6',
    shadowColor: '#9b59b6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  chipIcon: {
    fontSize: 12,
  },
  chipLabel: {
    color: 'rgba(212,165,229,0.6)',
    fontSize: 11,
    fontWeight: '800',
  },
  chipLabelActive: {
    color: '#fff',
  },
});
