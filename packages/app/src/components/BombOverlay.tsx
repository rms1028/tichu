import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  SlideInRight,
} from 'react-native-reanimated';
import { getAvailableBombs } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { COLORS, FONT } from '../utils/theme';
import { haptics } from '../utils/haptics';

interface BombOverlayProps {
  onSubmitBomb: () => void;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function BombOverlay({ onSubmitBomb }: BombOverlayProps) {
  const bombWindow = useGameStore((s) => s.bombWindow);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const myHand = useGameStore((s) => s.myHand);
  const tableCards = useGameStore((s) => s.tableCards);
  const phase = useGameStore((s) => s.phase);
  const [remainingMs, setRemainingMs] = useState(0);

  // 내 차례일 때 폭탄 보유 여부 (bombWindow 없을 때)
  const hasBombOnMyTurn = useMemo(() => {
    if (phase !== 'TRICK_PLAY' || !isMyTurn || bombWindow) return false;
    if (!tableCards) return false; // 리드 시에는 일반 플레이로
    const bombs = getAvailableBombs(myHand, tableCards);
    return bombs.length > 0;
  }, [phase, isMyTurn, bombWindow, myHand, tableCards]);

  // Shake 효과
  const shakeX = useSharedValue(0);
  // 버튼 pulse
  const btnScale = useSharedValue(1);

  useEffect(() => {
    if (!bombWindow) {
      setRemainingMs(0);
      return;
    }

    haptics.heavyTap();
    setRemainingMs(bombWindow.remainingMs);

    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        const next = prev - 100;
        if (next <= 0) {
          clearInterval(interval);
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [bombWindow]);

  // 진입 시 shake (bombWindow일 때만)
  useEffect(() => {
    if (bombWindow) {
      shakeX.value = withSequence(
        withTiming(-4, { duration: 50 }),
        withTiming(4, { duration: 50 }),
        withTiming(-3, { duration: 50 }),
        withTiming(3, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
      btnScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 400 }),
          withTiming(1.0, { duration: 400 }),
        ),
        -1,
        true,
      );
    } else {
      shakeX.value = 0;
      btnScale.value = 1;
    }
  }, [bombWindow]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const btnPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  const handlePress = () => {
    haptics.heavyTap();
    onSubmitBomb();
  };

  // bombWindow 중 canSubmitBomb이면 표시
  const showForBombWindow = bombWindow && bombWindow.canSubmitBomb;
  // 내 차례이고 폭탄 있으면 표시 (bombWindow 없어도)
  const showForMyTurn = hasBombOnMyTurn;

  if (!showForBombWindow && !showForMyTurn) return null;

  const seconds = bombWindow ? (remainingMs / 1000).toFixed(1) : null;

  return (
    <Animated.View
      entering={SlideInRight.duration(200).springify()}
      style={[styles.container, bombWindow && shakeStyle]}
    >
      {seconds && <Text style={styles.timer}>{seconds}s</Text>}
      <AnimatedTouchable style={[styles.bombBtn, bombWindow && btnPulseStyle]} onPress={handlePress}>
        <Text style={styles.bombText}>폭탄!</Text>
      </AnimatedTouchable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timer: {
    color: COLORS.bomb,
    fontSize: FONT.sm,
    fontWeight: 'bold',
  },
  bombBtn: {
    backgroundColor: COLORS.bomb,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  bombText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: FONT.md,
  },
});
