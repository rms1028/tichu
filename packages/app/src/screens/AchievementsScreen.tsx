import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useAchievementStore, Achievement } from '../stores/achievementStore';
import { useUserStore } from '../stores/userStore';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

interface Props { onBack: () => void; }

const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'game', label: '게임' },
  { key: 'tichu', label: '티츄' },
  { key: 'bomb', label: '폭탄' },
  { key: 'special', label: '특별' },
];

export function AchievementsScreen({ onBack }: Props) {
  const { achievements } = useAchievementStore();
  const { addCoins } = useUserStore();
  const [tab, setTab] = useState('all');

  const filtered = tab === 'all' ? achievements : achievements.filter(a => a.category === tab);
  const unlocked = achievements.filter(a => a.unlocked).length;

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      <View style={S.header}>
        <TouchableOpacity onPress={onBack}><Text style={S.back}>{'← 뒤로'}</Text></TouchableOpacity>
        <Text style={S.title}>{'🏅 업적'}</Text>
        <Text style={S.count}>{unlocked}/{achievements.length}</Text>
      </View>
      {/* 탭 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.tabs}>
        {CATEGORIES.map(c => (
          <TouchableOpacity key={c.key} style={[S.tab, tab === c.key && S.tabActive]} onPress={() => setTab(c.key)}>
            <Text style={[S.tabText, tab === c.key && S.tabTextActive]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView style={S.scroll} contentContainerStyle={S.list}>
        {filtered.map(a => (
          <View key={a.id} style={[S.card, a.unlocked && S.cardUnlocked]}>
            <Text style={[S.cardIcon, !a.unlocked && S.cardIconLocked]}>{a.icon}</Text>
            <View style={S.cardInfo}>
              <Text style={[S.cardName, a.unlocked && S.cardNameUnlocked]}>{a.name}</Text>
              <Text style={S.cardDesc}>{a.desc}</Text>
              {/* 프로그레스 바 */}
              <View style={S.progBg}>
                <View style={[S.progFill, { width: `${Math.min(100, (a.progress / a.requirement) * 100)}%` }, a.unlocked && S.progDone]} />
              </View>
              <Text style={S.progText}>{a.progress}/{a.requirement}</Text>
            </View>
            <View style={S.cardRight}>
              {a.unlocked ? (
                <Text style={S.cardCheck}>{'✅'}</Text>
              ) : (
                <View style={S.rewardBadge}><Text style={S.rewardText}>{'🪙 '}{a.reward.coins}</Text></View>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 10 },
  back: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
  title: { color: '#FFD700', fontSize: 20, fontWeight: '900' },
  count: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '700' },

  tabs: { paddingHorizontal: 12, gap: 6, paddingBottom: 8, zIndex: 5 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.15)' },
  tabActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  tabText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#F59E0B' },

  scroll: { flex: 1, zIndex: 5 },
  list: { paddingHorizontal: 12, gap: 6, paddingBottom: 20 },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 12, gap: 10 },
  cardUnlocked: { backgroundColor: 'rgba(245,158,11,0.06)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)' },
  cardIcon: { fontSize: 28 },
  cardIconLocked: { opacity: 0.4 },
  cardInfo: { flex: 1 },
  cardName: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '800' },
  cardNameUnlocked: { color: '#fff' },
  cardDesc: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 1 },
  progBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  progFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 },
  progDone: { backgroundColor: '#F59E0B' },
  progText: { color: 'rgba(255,255,255,0.25)', fontSize: 9, fontWeight: '600', marginTop: 2 },
  cardRight: { alignItems: 'center' },
  cardCheck: { fontSize: 20 },
  rewardBadge: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  rewardText: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700' },
});
