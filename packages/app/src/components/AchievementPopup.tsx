import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInUp } from 'react-native-reanimated';
import { useAchievementStore } from '../stores/achievementStore';
import { COLORS } from '../utils/theme';

export function AchievementPopup() {
  const recentUnlock = useAchievementStore((s) => s.recentUnlock);
  const clearRecent = useAchievementStore((s) => s.clearRecent);
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<{ name: string; desc: string } | null>(null);

  useEffect(() => {
    if (recentUnlock) {
      setCurrent({ name: recentUnlock.name, desc: recentUnlock.desc });
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        clearRecent();
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [recentUnlock]);

  if (!visible || !current) return null;

  return (
    <Animated.View entering={SlideInUp.duration(300)} exiting={FadeOut.duration(200)} style={styles.container}>
      <Text style={styles.icon}>🏆</Text>
      <View>
        <Text style={styles.title}>Achievement Unlocked!</Text>
        <Text style={styles.name}>{current.name}</Text>
        <Text style={styles.desc}>{current.desc}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
    zIndex: 9999,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    color: COLORS.gold ?? '#FFD700',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  desc: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
});
