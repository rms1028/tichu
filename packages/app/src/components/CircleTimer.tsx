import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mob } from '../utils/responsive';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

interface CircleTimerProps {
  remainingSec: number;
  totalSec: number;
  playerName: string;
  isMyTurn: boolean;
}

// 시간 비율에 따라 색상을 연속적으로 변화
function getTimerColor(ratio: number): string {
  if (ratio > 0.6) return '#22d3ee';  // 형광 시안 (여유 — 선명하게 빛남)
  if (ratio > 0.35) return '#fbbf24'; // 앰버 (주의)
  if (ratio > 0.17) return '#f97316'; // 오렌지 (경고)
  return '#ef4444';                    // 빨강 (긴급)
}

export function CircleTimer({ remainingSec, totalSec, playerName, isMyTurn }: CircleTimerProps) {
  const ratio = totalSec > 0 ? remainingSec / totalSec : 0;
  const color = getTimerColor(ratio);

  // 글로우/pulse 애니메이션
  const glowOpacity = useSharedValue(0.7);
  const ringScale = useSharedValue(1);
  // 흔들림 (10초 이하부터 시작, 5초 이하에서 강하게)
  const shakeX = useSharedValue(0);

  useEffect(() => {
    if (remainingSec <= 5 && remainingSec > 0) {
      // 5초 이하: 강한 pulse + 빠른 흔들림
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 300, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false,
      );
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 300 }),
          withTiming(0.97, { duration: 300 }),
        ),
        -1, false,
      );
      shakeX.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 60 }),
          withTiming(3, { duration: 60 }),
          withTiming(-2, { duration: 60 }),
          withTiming(2, { duration: 60 }),
          withTiming(0, { duration: 60 }),
        ),
        -1, false,
      );
    } else if (remainingSec <= 10 && remainingSec > 0) {
      // 10초 이하: 부드러운 pulse + 약한 흔들림
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.9, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.5, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false,
      );
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 500 }),
          withTiming(1, { duration: 500 }),
        ),
        -1, false,
      );
      shakeX.value = withRepeat(
        withSequence(
          withTiming(-1.5, { duration: 100 }),
          withTiming(1.5, { duration: 100 }),
          withTiming(0, { duration: 100 }),
        ),
        -1, false,
      );
    } else {
      glowOpacity.value = withTiming(0.7, { duration: 300 });
      ringScale.value = withTiming(1, { duration: 300 });
      shakeX.value = withTiming(0, { duration: 200 });
    }
  }, [remainingSec <= 5, remainingSec <= 10]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [
      { scale: ringScale.value },
      { translateX: shakeX.value },
    ],
  }));

  return (
    <View style={styles.container}>
      <Text style={[styles.playerName, isMyTurn && styles.playerNameMine]}>
        {playerName}
      </Text>

      <Animated.View style={[
        styles.outerRing,
        animStyle,
        {
          borderColor: color,
          shadowColor: color,
        },
      ]}>
        <View style={styles.innerCircle}>
          <Text style={styles.timerNumber}>
            {remainingSec}
          </Text>
          <Text style={styles.timerUnit}>초</Text>
        </View>
      </Animated.View>

      {/* 하단 바 (진행률) */}
      <View style={styles.barBg}>
        <View style={[
          styles.barFill,
          { width: `${ratio * 100}%`, backgroundColor: color },
        ]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 3,
  },
  playerName: {
    color: '#a0c4a0',
    fontSize: 13,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  playerNameMine: {
    color: '#FFD700',
    textShadowColor: 'rgba(255,215,0,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  outerRing: {
    width: mob(48, 68),
    height: mob(48, 68),
    borderRadius: mob(24, 34),
    borderWidth: mob(3, 4),
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  innerCircle: {
    width: mob(38, 54),
    height: mob(38, 54),
    borderRadius: mob(19, 27),
    backgroundColor: 'rgba(8, 20, 12, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  timerNumber: {
    color: '#ffffff',
    fontSize: mob(18, 26),
    fontWeight: '900',
    lineHeight: 28,
    textShadowColor: 'rgba(255,255,255,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  timerUnit: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: -2,
  },
  barBg: {
    width: 60,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
