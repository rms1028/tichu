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

const SEAT_COLORS = [
  '#22d3ee', '#f472b6', '#a78bfa', '#fb923c',
];

interface CircleTimerProps {
  remainingSec: number;
  totalSec: number;
  playerName: string;
  isMyTurn: boolean;
  seatColor?: string;
}

function getTimerColor(ratio: number): string {
  if (ratio > 0.6) return '#22d3ee';
  if (ratio > 0.35) return '#fbbf24';
  if (ratio > 0.17) return '#f97316';
  return '#ef4444';
}

export { SEAT_COLORS };

export function CircleTimer({ remainingSec, totalSec, playerName, isMyTurn, seatColor }: CircleTimerProps) {
  const ratio = totalSec > 0 ? remainingSec / totalSec : 0;
  const color = getTimerColor(ratio);
  const urgent = remainingSec <= 5 && remainingSec > 0;
  const warning = remainingSec <= 10 && remainingSec > 0;

  // 흔들림 애니메이션
  const shakeRotate = useSharedValue(0);
  const bellScale = useSharedValue(1);

  useEffect(() => {
    if (urgent) {
      shakeRotate.value = withRepeat(
        withSequence(
          withTiming(-8, { duration: 50 }),
          withTiming(8, { duration: 50 }),
          withTiming(-6, { duration: 50 }),
          withTiming(6, { duration: 50 }),
          withTiming(0, { duration: 50 }),
        ), -1, false,
      );
      bellScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 150 }),
          withTiming(0.95, { duration: 150 }),
        ), -1, false,
      );
    } else if (warning) {
      shakeRotate.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 100 }),
          withTiming(3, { duration: 100 }),
          withTiming(0, { duration: 100 }),
        ), -1, false,
      );
      bellScale.value = withTiming(1, { duration: 200 });
    } else {
      shakeRotate.value = withTiming(0, { duration: 200 });
      bellScale.value = withTiming(1, { duration: 200 });
    }
  }, [urgent, warning]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${shakeRotate.value}deg` },
      { scale: bellScale.value },
    ],
  }));

  const size = mob(52, 72);
  const bellSize = mob(14, 18);
  const legH = mob(6, 8);

  return (
    <View style={S.container}>
      <Animated.View style={[S.alarmWrap, shakeStyle]}>
        {/* 상단 종 2개 */}
        <View style={S.bellRow}>
          <View style={[S.bell, { width: bellSize, height: bellSize, borderRadius: bellSize / 2, borderColor: color }]} />
          <View style={[S.bellBar, { backgroundColor: color }]} />
          <View style={[S.bell, { width: bellSize, height: bellSize, borderRadius: bellSize / 2, borderColor: color }]} />
        </View>
        {/* 시계 본체 */}
        <View style={[S.clockBody, { width: size, height: size, borderRadius: size / 2, borderColor: color, shadowColor: color }]}>
          <View style={[S.clockFace, { width: size - mob(8, 10), height: size - mob(8, 10), borderRadius: (size - mob(8, 10)) / 2 }]}>
            <Text style={[S.number, { color: urgent ? '#ef4444' : '#fff' }]}>
              {remainingSec}
            </Text>
          </View>
        </View>
        {/* 하단 다리 2개 */}
        <View style={S.legRow}>
          <View style={[S.leg, { height: legH, backgroundColor: color }]} />
          <View style={{ width: mob(20, 30) }} />
          <View style={[S.leg, { height: legH, backgroundColor: color }]} />
        </View>
      </Animated.View>
      {/* 진행률 바 */}
      <View style={S.barBg}>
        <View style={[S.barFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: mob(2, 4),
  },
  alarmWrap: {
    alignItems: 'center',
  },
  // 종
  bellRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: mob(-4, -5),
    zIndex: 1,
  },
  bell: {
    borderWidth: mob(2, 3),
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  bellBar: {
    width: mob(16, 22),
    height: mob(3, 4),
    borderRadius: 2,
    marginHorizontal: mob(-2, -3),
    marginBottom: mob(2, 3),
  },
  // 시계 본체
  clockBody: {
    borderWidth: mob(3, 4),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  clockFace: {
    backgroundColor: 'rgba(8,20,12,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  number: {
    fontSize: mob(20, 28),
    fontWeight: '900',
    textShadowColor: 'rgba(255,255,255,0.2)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  // 다리
  legRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: mob(-3, -4),
  },
  leg: {
    width: mob(3, 4),
    borderRadius: mob(1, 2),
    transform: [{ rotate: '20deg' }],
  },
  // 진행률 바
  barBg: {
    width: mob(50, 70),
    height: mob(3, 4),
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
