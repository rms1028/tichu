import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming,
  FadeIn, FadeOut,
} from 'react-native-reanimated';
import { useGameStore } from '../stores/gameStore';

export function BombTimer() {
  const bombWindow = useGameStore((s) => s.bombWindow);
  const [remainingMs, setRemainingMs] = useState(0);

  // 깜빡임
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!bombWindow) {
      setRemainingMs(0);
      return;
    }
    setRemainingMs(bombWindow.remainingMs);
    pulse.value = withRepeat(
      withSequence(withTiming(0.4, { duration: 300 }), withTiming(1, { duration: 300 })),
      -1, false,
    );
    const iv = setInterval(() => {
      setRemainingMs(prev => {
        const next = prev - 100;
        if (next <= 0) { clearInterval(iv); return 0; }
        return next;
      });
    }, 100);
    return () => clearInterval(iv);
  }, [bombWindow]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!bombWindow) return null;

  const sec = (remainingMs / 1000).toFixed(1);

  return (
    <View style={S.container}>
      <View style={[S.inner, pulseStyle]}>
        <Text style={S.icon}>{'💣'}</Text>
        <Text style={S.timer}>{sec}{'s'}</Text>
      </View>
      <Text style={S.label}>{'폭탄 가능'}</Text>
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 30,
    alignItems: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(155,89,182,0.25)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: '#9b59b6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  icon: { fontSize: 16 },
  timer: { color: '#c084fc', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  label: { color: 'rgba(192,132,252,0.5)', fontSize: 9, fontWeight: '600', marginTop: 1 },
});
