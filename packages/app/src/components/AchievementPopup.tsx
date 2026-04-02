import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useAchievementStore } from '../stores/achievementStore';
import { SFX } from '../utils/sound';
import { COLORS } from '../utils/theme';

export function AchievementPopup() {
  const recentUnlock = useAchievementStore((s) => s.recentUnlock);
  const clearRecent = useAchievementStore((s) => s.clearRecent);

  useEffect(() => {
    if (recentUnlock) {
      try { SFX.achievement(); } catch {}
      const t = setTimeout(clearRecent, 4000);
      return () => clearTimeout(t);
    }
  }, [recentUnlock]);

  if (!recentUnlock) return null;

  return (
    <Animated.View entering={SlideInUp.duration(400).springify()} exiting={SlideOutUp.duration(300)} style={S.container}>
      <View style={S.inner}>
        <Text style={S.icon}>{recentUnlock.icon}</Text>
        <View style={S.textWrap}>
          <Text style={S.label}>{'업적 달성!'}</Text>
          <Text style={S.name}>{recentUnlock.name}</Text>
          <Text style={S.reward}>{'🪙 +'}{recentUnlock.reward.coins}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const S = StyleSheet.create({
  container: {
    position: 'absolute', top: 12, left: 16, right: 16, zIndex: 200,
  },
  inner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(10,20,14,0.95)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.4)',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10,
  },
  icon: { fontSize: 32 },
  textWrap: { flex: 1 },
  label: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  name: { color: '#FFD700', fontSize: 16, fontWeight: '900' },
  reward: { color: '#F59E0B', fontSize: 12, fontWeight: '700', marginTop: 2 },
});
