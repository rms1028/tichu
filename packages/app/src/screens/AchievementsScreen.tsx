import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Platform, StatusBar } from 'react-native';

const ANDROID_TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
import { useAchievementStore, Achievement } from '../stores/achievementStore';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';
import { mob } from '../utils/responsive';

interface Props { onBack: () => void; }

const CATEGORIES = [
  { key: 'all', label: '전체', icon: '📋' },
  { key: 'game', label: '게임', icon: '🎮' },
  { key: 'tichu', label: '티츄', icon: '🎯' },
  { key: 'bomb', label: '폭탄', icon: '💣' },
  { key: 'special', label: '특별', icon: '⭐' },
];

/** 업적 난이도별 등급 색상 */
function getTier(a: Achievement): { label: string; color: string; bgColor: string; icon: string } {
  const ratio = a.requirement;
  if (ratio >= 50) return { label: '레전드', color: '#FF6B6B', bgColor: 'rgba(255,107,107,0.15)', icon: '💎' };
  if (ratio >= 20) return { label: '골드', color: '#FFD700', bgColor: 'rgba(255,215,0,0.12)', icon: '🥇' };
  if (ratio >= 5)  return { label: '실버', color: '#C0C0C0', bgColor: 'rgba(192,192,192,0.12)', icon: '🥈' };
  return { label: '브론즈', color: '#CD7F32', bgColor: 'rgba(205,127,50,0.12)', icon: '🥉' };
}

export function AchievementsScreen({ onBack }: Props) {
  const { achievements } = useAchievementStore();
  const [tab, setTab] = useState('all');

  const filtered = tab === 'all' ? achievements : achievements.filter(a => a.category === tab);
  const unlocked = achievements.filter(a => a.unlocked).length;
  const locked = achievements.length - unlocked;
  const totalCoins = achievements.filter(a => a.unlocked).reduce((s, a) => s + a.reward.coins, 0);
  const progressPct = achievements.length > 0 ? Math.round((unlocked / achievements.length) * 100) : 0;

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />

      {/* 헤더 */}
      <View style={S.header}>
        <TouchableOpacity onPress={onBack} style={S.backBtn}>
          <Text style={S.backText}>{'← 뒤로'}</Text>
        </TouchableOpacity>
        <Text style={S.title}>{'🏅 업적'}</Text>
        <View style={S.headerSpacer} />
      </View>

      {/* 요약 카드 */}
      <View style={S.summaryRow}>
        <View style={[S.summaryCard, { borderColor: '#4ADE80' }]}>
          <Text style={[S.summaryValue, { color: '#4ADE80' }]}>{unlocked}</Text>
          <Text style={S.summaryLabel}>달성</Text>
        </View>
        <View style={[S.summaryCard, { borderColor: '#94A3B8' }]}>
          <Text style={[S.summaryValue, { color: '#94A3B8' }]}>{locked}</Text>
          <Text style={S.summaryLabel}>미달성</Text>
        </View>
        <View style={[S.summaryCard, { borderColor: '#FFD700' }]}>
          <Text style={[S.summaryValue, { color: '#FFD700' }]}>{totalCoins}</Text>
          <Text style={S.summaryLabel}>획득 코인</Text>
        </View>
        <View style={[S.summaryCard, { borderColor: '#60A5FA' }]}>
          <Text style={[S.summaryValue, { color: '#60A5FA' }]}>{progressPct}%</Text>
          <Text style={S.summaryLabel}>진행률</Text>
          <View style={S.miniProgBg}>
            <View style={[S.miniProgFill, { width: `${progressPct}%` }]} />
          </View>
        </View>
      </View>

      {/* 탭 필터 — 가로 균등 배치 */}
      <View style={S.tabs}>
        {CATEGORIES.map(c => {
          const isActive = tab === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[S.tab, isActive && S.tabActive]}
              onPress={() => setTab(c.key)}
              activeOpacity={0.7}
            >
              <Text style={S.tabIcon}>{c.icon}</Text>
              <Text style={[S.tabText, isActive && S.tabTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 업적 목록 */}
      <ScrollView style={S.scroll} contentContainerStyle={S.list}>
        {filtered.map(a => {
          const tier = getTier(a);
          const pct = Math.min(100, (a.progress / a.requirement) * 100);

          return (
            <View key={a.id} style={[S.card, a.unlocked ? S.cardUnlocked : S.cardLocked]}>
              {/* 등급 아이콘 */}
              <View style={[S.iconWrap, { backgroundColor: a.unlocked ? tier.bgColor : 'rgba(0,0,0,0.2)' }]}>
                <Text style={S.iconEmoji}>{a.unlocked ? tier.icon : a.icon}</Text>
                {a.unlocked && <View style={[S.checkBadge]}><Text style={S.checkText}>{'✓'}</Text></View>}
              </View>

              {/* 정보 */}
              <View style={S.cardInfo}>
                <View style={S.nameRow}>
                  <Text style={[S.cardName, a.unlocked && S.cardNameDone]} numberOfLines={1}>{a.name}</Text>
                  <View style={[S.tierBadge, { backgroundColor: tier.bgColor, borderColor: tier.color }]}>
                    <Text style={[S.tierText, { color: tier.color }]}>{tier.label}</Text>
                  </View>
                </View>
                <Text style={[S.cardDesc, a.unlocked && S.cardDescDone]}>{a.desc}</Text>
                {/* 프로그레스 바 */}
                <View style={S.progRow}>
                  <View style={S.progBg}>
                    <View style={[
                      S.progFill,
                      { width: `${pct}%` },
                      a.unlocked
                        ? { backgroundColor: tier.color }
                        : pct > 50
                          ? { backgroundColor: 'rgba(96,165,250,0.6)' }
                          : {},
                    ]} />
                  </View>
                  <Text style={[S.progText, a.unlocked && { color: tier.color }]}>
                    {a.progress}/{a.requirement}
                  </Text>
                </View>
              </View>

              {/* 보상 */}
              <View style={S.rewardWrap}>
                {a.unlocked ? (
                  <View style={S.completedBadge}>
                    <Text style={S.completedText}>완료</Text>
                  </View>
                ) : (
                  <View style={S.rewardBadge}>
                    <Text style={S.rewardCoin}>{'🪙'}</Text>
                    <Text style={S.rewardAmount}>{a.reward.coins}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, paddingTop: ANDROID_TOP_INSET },

  // 헤더
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: mob(12, 20), paddingVertical: mob(8, 12), zIndex: 10,
  },
  backBtn: { minWidth: 60 },
  backText: { color: 'rgba(255,255,255,0.6)', fontSize: mob(13, 15), fontWeight: '700' },
  title: { color: '#FFD700', fontSize: mob(20, 24), fontWeight: '900' },
  headerSpacer: { minWidth: 60 },

  // 요약 카드
  summaryRow: {
    flexDirection: 'row', paddingHorizontal: mob(10, 16), gap: mob(6, 10),
    marginBottom: mob(8, 12), zIndex: 5,
  },
  summaryCard: {
    flex: 1, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: mob(10, 12), paddingVertical: mob(8, 12), borderWidth: 1,
  },
  summaryValue: { fontSize: mob(18, 24), fontWeight: '900' },
  summaryLabel: { color: 'rgba(255,255,255,0.45)', fontSize: mob(9, 11), fontWeight: '600', marginTop: 2 },
  miniProgBg: {
    width: '80%', height: 3, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2, marginTop: 4, overflow: 'hidden',
  },
  miniProgFill: { height: '100%', backgroundColor: '#60A5FA', borderRadius: 2 },

  // 탭 필터
  tabs: {
    flexDirection: 'row', paddingHorizontal: mob(10, 16), gap: mob(4, 8),
    marginBottom: mob(8, 12), zIndex: 5,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingVertical: mob(6, 8),
    borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  tabActive: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderColor: '#F59E0B',
  },
  tabIcon: { fontSize: mob(13, 15) },
  tabText: { color: 'rgba(255,255,255,0.4)', fontSize: mob(12, 14), fontWeight: '700' },
  tabTextActive: { color: '#F59E0B' },

  // 목록
  scroll: { flex: 1, zIndex: 5 },
  list: { paddingHorizontal: mob(10, 16), gap: mob(6, 8), paddingBottom: 24 },

  // 카드 공통
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: mob(12, 14), padding: mob(10, 14), gap: mob(10, 14),
    borderWidth: 1,
  },
  cardUnlocked: {
    backgroundColor: 'rgba(255,215,0,0.05)',
    borderColor: 'rgba(255,215,0,0.2)',
  },
  cardLocked: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderColor: 'rgba(255,255,255,0.04)',
  },

  // 아이콘
  iconWrap: {
    width: mob(44, 52), height: mob(44, 52), borderRadius: mob(12, 14),
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  iconEmoji: { fontSize: mob(22, 26) },
  checkBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#4ADE80', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.bg,
  },
  checkText: { color: '#fff', fontSize: 9, fontWeight: '900' },

  // 정보
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardName: { color: 'rgba(255,255,255,0.45)', fontSize: mob(13, 15), fontWeight: '800' },
  cardNameDone: { color: '#fff' },
  cardDesc: { color: 'rgba(255,255,255,0.2)', fontSize: mob(10, 12), marginTop: 1 },
  cardDescDone: { color: 'rgba(255,255,255,0.45)' },

  // 등급 배지
  tierBadge: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
    borderWidth: 1,
  },
  tierText: { fontSize: mob(8, 10), fontWeight: '800' },

  // 프로그레스
  progRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: mob(6, 8) },
  progBg: {
    flex: 1, height: mob(6, 7), backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4, overflow: 'hidden',
  },
  progFill: {
    height: '100%', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4,
  },
  progText: {
    color: 'rgba(255,255,255,0.25)', fontSize: mob(10, 12), fontWeight: '700',
    minWidth: mob(36, 44), textAlign: 'right',
  },

  // 보상
  rewardWrap: { alignItems: 'center', minWidth: mob(50, 60) },
  rewardBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 8,
    paddingHorizontal: mob(8, 10), paddingVertical: mob(4, 6),
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.2)',
  },
  rewardCoin: { fontSize: mob(14, 16) },
  rewardAmount: { color: '#FFD700', fontSize: mob(13, 15), fontWeight: '900' },
  completedBadge: {
    backgroundColor: 'rgba(74,222,128,0.15)', borderRadius: 8,
    paddingHorizontal: mob(10, 12), paddingVertical: mob(4, 6),
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)',
  },
  completedText: { color: '#4ADE80', fontSize: mob(11, 13), fontWeight: '800' },
});
