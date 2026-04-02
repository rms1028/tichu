import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useUserStore, getTier, TIERS, SHOP_AVATARS } from '../stores/userStore';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

interface Props { onBack: () => void; }

// 더미 랭킹 (봇 + 나)
const DUMMY_PLAYERS = [
  { name: 'ProPlayer', xp: 5200, avatar: '🦄', wins: 120 },
  { name: 'TichuKing', xp: 4100, avatar: '🦅', wins: 95 },
  { name: 'CardMaster', xp: 3600, avatar: '🐯', wins: 82 },
  { name: 'Alex', xp: 2800, avatar: '🦁', wins: 65 },
  { name: 'Mina', xp: 2200, avatar: '🐻', wins: 52 },
  { name: 'Sora', xp: 1800, avatar: '🐯', wins: 41 },
  { name: 'Jay', xp: 1200, avatar: '🦊', wins: 30 },
  { name: 'Haru', xp: 800, avatar: '🦉', wins: 22 },
  { name: 'Bot-A', xp: 500, avatar: '🦁', wins: 15 },
  { name: 'Bot-B', xp: 300, avatar: '🐻', wins: 8 },
];

export function RankingScreen({ onBack }: Props) {
  const { xp, wins, totalGames, nickname, equippedAvatar } = useUserStore();
  const tier = getTier(xp);
  const avatarEmoji = SHOP_AVATARS.find(a => a.id === equippedAvatar)?.emoji ?? '🐲';

  // 나를 포함한 랭킹 생성
  const allPlayers = [...DUMMY_PLAYERS, { name: nickname, xp, avatar: avatarEmoji, wins }]
    .sort((a, b) => b.xp - a.xp);
  const myRank = allPlayers.findIndex(p => p.name === nickname) + 1;

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      <View style={S.header}>
        <TouchableOpacity onPress={onBack}><Text style={S.back}>{'← 뒤로'}</Text></TouchableOpacity>
        <Text style={S.title}>{'🏆 랭킹'}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={S.scroll} contentContainerStyle={S.content}>
        {/* 내 랭킹 카드 */}
        <View style={S.myCard}>
          <Text style={S.myRank}>#{myRank}</Text>
          <Text style={S.myAvatar}>{avatarEmoji}</Text>
          <View style={S.myInfo}>
            <Text style={S.myName}>{nickname}</Text>
            <Text style={[S.myTier, { color: tier.color }]}>{tier.icon} {tier.name}</Text>
          </View>
          <View style={S.myStats}>
            <Text style={S.myXp}>{xp} XP</Text>
            <Text style={S.myWins}>{wins}승 / {totalGames}판</Text>
          </View>
        </View>

        {/* 티어 구간 표시 */}
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
        <View style={S.list}>
          {allPlayers.map((p, i) => {
            const pTier = getTier(p.xp);
            const isMe = p.name === nickname;
            return (
              <View key={i} style={[S.row, isMe && S.rowMe]}>
                <Text style={[S.rank, i < 3 && S.rankTop]}>{i + 1}</Text>
                <Text style={S.avatar}>{p.avatar}</Text>
                <View style={S.info}>
                  <Text style={[S.name, isMe && S.nameMe]}>{p.name}{isMe ? ' (나)' : ''}</Text>
                  <Text style={[S.tierLabel, { color: pTier.color }]}>{pTier.icon} {pTier.name}</Text>
                </View>
                <View style={S.right}>
                  <Text style={S.xp}>{p.xp} XP</Text>
                  <Text style={S.winsText}>{p.wins}승</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 10 },
  back: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
  title: { color: '#FFD700', fontSize: 20, fontWeight: '900' },
  scroll: { flex: 1, zIndex: 5 },
  content: { paddingHorizontal: 16, paddingBottom: 20 },

  myCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 16, padding: 16, marginBottom: 16, gap: 12 },
  myRank: { color: '#FFD700', fontSize: 24, fontWeight: '900', minWidth: 40 },
  myAvatar: { fontSize: 32 },
  myInfo: { flex: 1 },
  myName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  myTier: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  myStats: { alignItems: 'flex-end' },
  myXp: { color: '#F59E0B', fontSize: 16, fontWeight: '900' },
  myWins: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },

  tierBar: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, paddingVertical: 8 },
  tierItem: { alignItems: 'center', opacity: 0.4 },
  tierIcon: { fontSize: 18 },
  tierName: { fontSize: 10, fontWeight: '700' },
  tierRange: { color: 'rgba(255,255,255,0.3)', fontSize: 9 },

  list: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  rowMe: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  rank: { color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: '800', minWidth: 28, textAlign: 'center' },
  rankTop: { color: '#FFD700' },
  avatar: { fontSize: 24 },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: 14, fontWeight: '700' },
  nameMe: { color: '#F59E0B' },
  tierLabel: { fontSize: 10, fontWeight: '600' },
  right: { alignItems: 'flex-end' },
  xp: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700' },
  winsText: { color: 'rgba(255,255,255,0.3)', fontSize: 10 },
});
