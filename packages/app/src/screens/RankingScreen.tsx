import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useUserStore, getTier, getSubTier, getNextTier, TIERS } from '../stores/userStore';
import { useGameStore } from '../stores/gameStore';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';
import { mob } from '../utils/responsive';

interface Props {
  onBack: () => void;
  onRefresh?: () => void;
}

type Tab = 'global' | 'season';

export function RankingScreen({ onBack, onRefresh }: Props) {
  const { xp, wins, totalGames, nickname } = useUserStore();
  const tier = getTier(xp);
  const subTier = getSubTier(xp);
  const nextTier = getNextTier(xp);
  const leaderboard = useGameStore((s) => s.leaderboard);
  const seasonLeaderboard = useGameStore((s) => s.seasonLeaderboard);
  const [tab, setTab] = useState<Tab>('global');

  useEffect(() => { onRefresh?.(); }, []);

  // 리더보드 데이터
  const serverPlayers = leaderboard.map(p => ({
    name: p.nickname, xp: p.xp, wins: p.wins, totalGames: p.totalGames,
    isMe: p.nickname === nickname,
  }));
  const meInList = serverPlayers.some(p => p.isMe);
  const allPlayers = meInList
    ? serverPlayers
    : [...serverPlayers, { name: nickname, xp, wins, totalGames, isMe: true }];
  allPlayers.sort((a, b) => b.xp - a.xp);
  const myRank = allPlayers.findIndex(p => p.isMe) + 1;

  // XP 진행률
  const progressPct = nextTier
    ? Math.min(100, Math.round(((xp - tier.min) / (nextTier.min - tier.min)) * 100))
    : 100;

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      <View style={S.header}>
        <TouchableOpacity onPress={onBack}><Text style={S.back}>{'<- 뒤로'}</Text></TouchableOpacity>
        <Text style={S.title}>{'🏆 랭킹'}</Text>
        <TouchableOpacity onPress={onRefresh}><Text style={S.refresh}>{'🔄'}</Text></TouchableOpacity>
      </View>

      <ScrollView style={S.scroll} contentContainerStyle={S.content}>
        {/* 내 랭킹 카드 */}
        <View style={[S.myCard, { borderColor: tier.color + '40' }]}>
          <View style={S.myTop}>
            <Text style={S.myRank}>#{myRank}</Text>
            <View style={[S.tierPill, { backgroundColor: tier.color + '20', borderColor: tier.color + '50' }]}>
              <Text style={{ fontSize: mob(16, 20) }}>{tier.icon}</Text>
              <Text style={[S.tierPillText, { color: tier.color }]}>
                {tier.name}{subTier ? ` ${subTier}` : ''}
              </Text>
            </View>
          </View>
          <Text style={S.myName}>{nickname}</Text>
          <View style={S.myStatsRow}>
            <Text style={[S.myXp, { color: tier.color }]}>{xp} XP</Text>
            <Text style={S.myStat}>{wins}승 / {totalGames}판</Text>
            <Text style={S.myStat}>승률 {totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0}%</Text>
          </View>
          {/* XP 프로그레스 바 */}
          <View style={S.progBg}>
            <View style={[S.progFill, { width: `${progressPct}%`, backgroundColor: tier.color }]} />
          </View>
          <Text style={S.progLabel}>
            {nextTier ? `다음 등급 (${nextTier.name})까지 ${nextTier.min - xp} XP` : '최고 등급 달성!'}
          </Text>
        </View>

        {/* 티어 로드맵 */}
        <View style={S.tierRoadmap}>
          {TIERS.map((t, i) => {
            const isActive = xp >= t.min;
            const isCurrent = tier.key === t.key;
            return (
              <View key={i} style={[S.tierDot, isCurrent && { borderColor: t.color, borderWidth: 2 }]}>
                <Text style={[S.tierDotIcon, !isActive && { opacity: 0.3 }]}>{t.icon}</Text>
                <Text style={[S.tierDotName, { color: isActive ? t.color : 'rgba(255,255,255,0.25)' }]}>{t.name}</Text>
              </View>
            );
          })}
        </View>

        {/* 탭 */}
        <View style={S.tabRow}>
          {(['global', 'season'] as Tab[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[S.tab, tab === t && S.tabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[S.tabText, tab === t && S.tabTextActive]}>
                {t === 'global' ? '전체 랭킹' : '시즌 랭킹'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 리더보드 */}
        {allPlayers.length === 0 ? (
          <View style={S.empty}>
            <Text style={S.emptyText}>아직 랭킹 데이터가 없습니다</Text>
          </View>
        ) : (
          <View style={S.list}>
            {allPlayers.map((p, i) => {
              const pTier = getTier(p.xp);
              const pSub = getSubTier(p.xp);
              const isTop3 = i < 3;
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <View key={i} style={[S.row, p.isMe && S.rowMe, isTop3 && { borderLeftWidth: 3, borderLeftColor: pTier.color }]}>
                  <Text style={[S.rank, isTop3 && { color: pTier.color }]}>
                    {isTop3 ? medals[i] : String(i + 1)}
                  </Text>
                  <View style={S.info}>
                    <Text style={[S.name, p.isMe && S.nameMe]} numberOfLines={1}>
                      {p.name}{p.isMe ? ' (나)' : ''}
                    </Text>
                    <View style={S.tierLabelRow}>
                      <Text style={{ fontSize: mob(10, 12) }}>{pTier.icon}</Text>
                      <Text style={[S.tierLabel, { color: pTier.color }]}>
                        {pTier.name}{pSub ? ` ${pSub}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={S.right}>
                    <Text style={[S.xpVal, { color: pTier.color }]}>{p.xp}</Text>
                    <Text style={S.xpUnit}>XP</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 10 },
  back: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
  title: { color: '#FFD700', fontSize: mob(18, 22), fontWeight: '900' },
  refresh: { fontSize: 18 },
  scroll: { flex: 1, zIndex: 5 },
  content: { paddingHorizontal: mob(12, 20), paddingBottom: 24, gap: mob(12, 16) },

  // 내 랭킹 카드
  myCard: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 16, padding: mob(14, 20), borderWidth: 1, gap: mob(6, 8) },
  myTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  myRank: { color: '#FFD700', fontSize: mob(24, 32), fontWeight: '900' },
  tierPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: mob(10, 14), paddingVertical: mob(4, 6), borderRadius: 20, borderWidth: 1 },
  tierPillText: { fontSize: mob(13, 16), fontWeight: '800' },
  myName: { color: '#fff', fontSize: mob(16, 20), fontWeight: '800' },
  myStatsRow: { flexDirection: 'row', gap: mob(12, 20) },
  myXp: { fontSize: mob(15, 18), fontWeight: '900' },
  myStat: { color: 'rgba(255,255,255,0.4)', fontSize: mob(11, 13), fontWeight: '600' },
  progBg: { height: mob(8, 10), backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 5 },
  progLabel: { color: 'rgba(255,255,255,0.35)', fontSize: mob(10, 12), fontWeight: '600' },

  // 티어 로드맵
  tierRoadmap: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 12, paddingVertical: mob(8, 10) },
  tierDot: { alignItems: 'center', gap: 2, padding: 4, borderRadius: 8, borderWidth: 0, borderColor: 'transparent' },
  tierDotIcon: { fontSize: mob(16, 20) },
  tierDotName: { fontSize: mob(8, 10), fontWeight: '700' },

  // 탭
  tabRow: { flexDirection: 'row', gap: mob(6, 10) },
  tab: { flex: 1, alignItems: 'center', paddingVertical: mob(8, 10), borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.15)', borderWidth: 1.5, borderColor: 'transparent' },
  tabActive: { backgroundColor: 'rgba(255,215,0,0.12)', borderColor: '#FFD700' },
  tabText: { color: 'rgba(255,255,255,0.35)', fontSize: mob(13, 15), fontWeight: '700' },
  tabTextActive: { color: '#FFD700' },

  // 리더보드
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700' },
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, paddingHorizontal: mob(10, 14), paddingVertical: mob(8, 10), gap: mob(8, 12) },
  rowMe: { backgroundColor: 'rgba(255,215,0,0.06)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.15)' },
  rank: { color: 'rgba(255,255,255,0.35)', fontSize: mob(14, 18), fontWeight: '900', minWidth: 28, textAlign: 'center' },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: mob(13, 15), fontWeight: '700' },
  nameMe: { color: '#FFD700' },
  tierLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tierLabel: { fontSize: mob(10, 12), fontWeight: '600' },
  right: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  xpVal: { fontSize: mob(14, 18), fontWeight: '900' },
  xpUnit: { color: 'rgba(255,255,255,0.3)', fontSize: mob(9, 11), fontWeight: '600' },
});
