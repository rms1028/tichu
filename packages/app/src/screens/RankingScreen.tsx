import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useUserStore, getTier, TIERS } from '../stores/userStore';
import { useGameStore } from '../stores/gameStore';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';
import { mob } from '../utils/responsive';

interface Props {
  onBack: () => void;
  onRefresh?: () => void;
}

export function RankingScreen({ onBack, onRefresh }: Props) {
  const { xp, wins, totalGames, nickname } = useUserStore();
  const tier = getTier(xp);
  const leaderboard = useGameStore((s) => s.leaderboard);

  // 화면 진입 시 리더보드 요청
  useEffect(() => {
    onRefresh?.();
  }, []);

  // 서버 리더보드 + 내 정보 합치기
  const serverPlayers = leaderboard.map(p => ({
    name: p.nickname,
    xp: p.xp,
    wins: p.wins,
    totalGames: p.totalGames,
    isMe: p.nickname === nickname,
  }));

  // 내가 리더보드에 없으면 추가
  const meInList = serverPlayers.some(p => p.isMe);
  const allPlayers = meInList
    ? serverPlayers
    : [...serverPlayers, { name: nickname, xp, wins, totalGames, isMe: true }];

  // XP 내림차순 정렬
  allPlayers.sort((a, b) => b.xp - a.xp);
  const myRank = allPlayers.findIndex(p => p.isMe) + 1;

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      <View style={S.header}>
        <TouchableOpacity onPress={onBack}><Text style={S.back}>{'← 뒤로'}</Text></TouchableOpacity>
        <Text style={S.title}>{'🏆 랭킹'}</Text>
        <TouchableOpacity onPress={onRefresh}><Text style={S.refresh}>{'🔄'}</Text></TouchableOpacity>
      </View>
      <ScrollView style={S.scroll} contentContainerStyle={S.content}>
        {/* 내 랭킹 카드 */}
        <View style={S.myCard}>
          <Text style={S.myRank}>#{myRank}</Text>
          <View style={S.myInfo}>
            <Text style={S.myName}>{nickname}</Text>
            <Text style={[S.myTier, { color: tier.color }]}>{tier.icon} {tier.name}</Text>
          </View>
          <View style={S.myStats}>
            <Text style={S.myXp}>{xp} XP</Text>
            <Text style={S.myWins}>{wins}승 / {totalGames}판</Text>
          </View>
        </View>
        {/* 티어 구간 */}
        <View style={S.tierBar}>
          {TIERS.map((t, i) => (
            <View key={i} style={[S.tierItem, xp >= t.min && { opacity: 1 }]}>
              <Text style={S.tierIcon}>{t.icon}</Text>
              <Text style={[S.tierName, { color: t.color }]}>{t.name}</Text>
              <Text style={S.tierRange}>{t.min}+</Text>
            </View>
          ))}
        </View>
        {/* 랭킹 리스트 */}
        {allPlayers.length === 0 ? (
          <View style={S.empty}>
            <Text style={S.emptyText}>아직 랭킹 데이터가 없습니다</Text>
            <Text style={S.emptySubText}>게임을 플레이하면 랭킹에 등록됩니다!</Text>
          </View>
        ) : (
          <View style={S.list}>
            {allPlayers.map((p, i) => {
              const pTier = getTier(p.xp);
              return (
                <View key={i} style={[S.row, p.isMe && S.rowMe]}>
                  <Text style={[S.rank, i < 3 && S.rankTop]}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1)}
                  </Text>
                  <View style={S.info}>
                    <Text style={[S.name, p.isMe && S.nameMe]}>{p.name}{p.isMe ? ' (나)' : ''}</Text>
                    <Text style={[S.tierLabel, { color: pTier.color }]}>{pTier.icon} {pTier.name}</Text>
                  </View>
                  <View style={S.right}>
                    <Text style={S.xp}>{p.xp} XP</Text>
                    <Text style={S.winsText}>{p.wins}승 / {p.totalGames}판</Text>
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
  content: { paddingHorizontal: 16, paddingBottom: 20 },
  myCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 16, padding: mob(12, 16), marginBottom: 16, gap: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  myRank: { color: '#FFD700', fontSize: mob(22, 28), fontWeight: '900', minWidth: 40 },
  myInfo: { flex: 1 },
  myName: { color: '#fff', fontSize: mob(15, 18), fontWeight: '800' },
  myTier: { fontSize: mob(12, 14), fontWeight: '700', marginTop: 2 },
  myStats: { alignItems: 'flex-end' },
  myXp: { color: '#F59E0B', fontSize: mob(15, 18), fontWeight: '900' },
  myWins: { color: 'rgba(255,255,255,0.4)', fontSize: mob(10, 12) },
  tierBar: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, paddingVertical: 8 },
  tierItem: { alignItems: 'center', opacity: 0.4 },
  tierIcon: { fontSize: mob(16, 20) },
  tierName: { fontSize: mob(9, 11), fontWeight: '700' },
  tierRange: { color: 'rgba(255,255,255,0.3)', fontSize: mob(8, 10) },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700' },
  emptySubText: { color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 6 },
  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: mob(8, 10), gap: 10 },
  rowMe: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  rank: { color: 'rgba(255,255,255,0.4)', fontSize: mob(14, 18), fontWeight: '800', minWidth: 28, textAlign: 'center' },
  rankTop: { color: '#FFD700', fontSize: mob(16, 20) },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: mob(13, 15), fontWeight: '700' },
  nameMe: { color: '#F59E0B' },
  tierLabel: { fontSize: mob(9, 11), fontWeight: '600' },
  right: { alignItems: 'flex-end' },
  xp: { color: 'rgba(255,255,255,0.6)', fontSize: mob(12, 14), fontWeight: '700' },
  winsText: { color: 'rgba(255,255,255,0.3)', fontSize: mob(9, 11) },
});
