import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing,
} from 'react-native-reanimated';

const { width: SW, height: SH } = Dimensions.get('window');

interface Particle {
  emoji: string;
  x: number;
  delay: number;
  duration: number;
  size: number;
}

function genParticles(type: 'victory' | 'bomb' | 'tichu' | 'onetwo', count: number): Particle[] {
  const emojis = {
    victory: ['✨', '🎉', '⭐', '🏆', '💫', '🎊'],
    bomb: ['💥', '🔥', '💣', '⚡'],
    tichu: ['🔥', '⭐', '🎯', '💎'],
    onetwo: ['🎉', '👑', '💰', '✨', '🏆', '💫', '🎊', '⭐'],
  };
  const pool = emojis[type];
  return Array.from({ length: count }, (_, i) => ({
    emoji: pool[i % pool.length]!,
    x: Math.random() * (SW - 30),
    delay: Math.random() * 800,
    duration: 1500 + Math.random() * 1500,
    size: 16 + Math.random() * 16,
  }));
}

function SingleParticle({ emoji, x, delay, duration, size }: Particle) {
  const ty = useSharedValue(SH + 20);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    ty.value = withDelay(delay, withTiming(-60, { duration, easing: Easing.out(Easing.quad) }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    rotate.value = withDelay(delay, withTiming(360 * (Math.random() > 0.5 ? 1 : -1), { duration }));
    // 끝에서 페이드아웃
    setTimeout(() => { opacity.value = withTiming(0, { duration: 400 }); }, delay + duration - 400);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }, { rotate: `${rotate.value}deg` }],
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={[{ position: 'absolute', left: x, fontSize: size }, style]}>
      {emoji}
    </Animated.Text>
  );
}

interface Props {
  type: 'victory' | 'bomb' | 'tichu' | 'onetwo';
  count?: number;
}

export function ParticleEffect({ type, count = 20 }: Props) {
  const particles = React.useMemo(() => genParticles(type, count), [type, count]);

  return (
    <View style={S.container} pointerEvents="none">
      {particles.map((p, i) => <SingleParticle key={i} {...p} />)}
    </View>
  );
}
// 화면 흔들림 효과
export function ScreenShake({ children, active }: { children: React.ReactNode; active: boolean }) {
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);

  useEffect(() => {
    if (!active) return;
    const seq = async () => {
      for (let i = 0; i < 6; i++) {
        shakeX.value = withTiming((Math.random() - 0.5) * 12, { duration: 50 });
        shakeY.value = withTiming((Math.random() - 0.5) * 8, { duration: 50 });
        await new Promise(r => setTimeout(r, 50));
      }
      shakeX.value = withTiming(0, { duration: 100 });
      shakeY.value = withTiming(0, { duration: 100 });
    };
    seq();
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { translateY: shakeY.value }],
  }));

  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

const S = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100, overflow: 'hidden',
  },
});
