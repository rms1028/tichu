import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { COLORS } from '../utils/theme';

interface Props { onFinish: () => void; }

export function SplashScreen({ onFinish }: Props) {
  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);
  const subOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) });
    logoScale.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) });
    subOpacity.value = withDelay(600, withTiming(1, { duration: 500 }));
    const t = setTimeout(onFinish, 2000);
    return () => clearTimeout(t);
  }, []);

  const logoStyle = useAnimatedStyle(() => ({ opacity: logoOpacity.value, transform: [{ scale: logoScale.value }] }));
  const subStyle = useAnimatedStyle(() => ({ opacity: subOpacity.value }));

  return (
    <View style={S.root}>
      <Animated.Text style={[S.title, logoStyle]}>TICHU</Animated.Text>
      <Animated.View style={[S.subWrap, subStyle]}>
        <Text style={S.subtitle}>Ultimate Card Battle</Text>
        <ActivityIndicator color="rgba(255,215,0,0.5)" style={S.spinner} />
      </Animated.View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#FFD700', fontSize: 56, fontWeight: '900', letterSpacing: 12, textShadowColor: 'rgba(255,215,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 16 },
  subWrap: { alignItems: 'center', marginTop: 12 },
  subtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '600', letterSpacing: 4 },
  spinner: { marginTop: 20 },
});
