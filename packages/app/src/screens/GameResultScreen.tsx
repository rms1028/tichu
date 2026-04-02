import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { ParticleEffect } from '../components/ParticleEffect';
import { SFX } from '../utils/sound';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSpring,
  FadeIn, ZoomIn,
} from 'react-native-reanimated';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

interface PlayerResult {
  seat: number; name: string; avatar: string; tier: string;
  cardsPlayed: number; tichu: 'large' | 'small' | null; tichuSuccess: boolean; isMvp: boolean;
}

interface Props {
  winner: string; myTeam: string;
  scores: { team1: number; team2: number };
  players: PlayerResult[];
  rewards: { coins: number; xp: number; bonusCoins: number; tichuBonus: number };
  xpBefore: number; xpAfter: number; xpMax: number; tierUp: boolean;
  onRematch: () => void; onLobby: () => void;
}

export function GameResultScreen({
  winner, myTeam, scores, players, rewards, xpBefore, xpAfter, xpMax, tierUp, onRematch, onLobby,
}: Props) {
  const isWin = winner === myTeam;
  const team1Players = players.filter(p => p.seat === 0 || p.seat === 2);
  const team2Players = players.filter(p => p.seat === 1 || p.seat === 3);

  // XP 바 애니메이션
  const xpW = useSharedValue((xpBefore / xpMax) * 100);
  useEffect(() => {
    xpW.value = withDelay(1000, withTiming((xpAfter / xpMax) * 100, { duration: 1500 }));
    try { isWin ? SFX.victory() : SFX.defeat(); } catch {}
  }, []);
  const xpStyle = useAnimatedStyle(() => ({ width: `${xpW.value}%` }));

  // 배너 스케일
  const bannerScale = useSharedValue(0.5);
  useEffect(() => { bannerScale.value = withSpring(1, { damping: 8, stiffness: 120 }); }, []);
  const bannerStyle = useAnimatedStyle(() => ({ transform: [{ scale: bannerScale.value }] }));

  const renderPlayer = (p: PlayerResult, idx: number) => {
    const isT1 = p.seat === 0 || p.seat === 2;
    return (
      <Animated.View key={p.seat} entering={FadeIn.delay(500 + idx * 150).duration(400)} style={[S.pCard, p.isMvp && S.pCardMvp, { borderColor: isT1 ? 'rgba(59,130,246,0.25)' : 'rgba(239,68,68,0.25)' }]}>
        {p.isMvp && <Text style={S.mvpIcon}>{'\uD83D\uDC51'}</Text>}
        <Text style={S.pAvatar}>{p.avatar}</Text>
        <Text style={S.pName} numberOfLines={1}>{p.name}</Text>
        <Text style={S.pTier}>{p.tier}</Text>
        <View style={S.pStatsRow}>
          <Text style={S.pStat}>{'\uD83C\uDCCF'}{p.cardsPlayed}</Text>
          {p.tichu && <Text style={[S.pStat, p.tichuSuccess ? S.pGood : S.pBad]}>{p.tichu === 'large' ? 'L' : 'S'}{p.tichuSuccess ? '\u2705' : '\u274C'}</Text>}
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      {isWin && <ParticleEffect type="victory" count={25} />}
      <View style={S.content}>
        {/* 승패 배너 */}
        <Animated.View style={[S.bannerWrap, bannerStyle]}>
          <Text style={[S.banner, isWin ? S.bannerWin : S.bannerLose]}>
            {isWin ? '\uD83C\uDF89 \uC2B9\uB9AC!' : '\uD83D\uDE22 \uD328\uBC30'}
          </Text>
          <View style={S.scoreRow}>
            <View style={S.scoreTeam}>
              <Text style={[S.scoreLabel, { color: '#3B82F6' }]}>Team 1</Text>
              <Text style={[S.scoreNum, winner === 'team1' ? S.scoreWin : S.scoreLose]}>{scores.team1}</Text>
            </View>
            <Text style={S.vs}>VS</Text>
            <View style={S.scoreTeam}>
              <Text style={[S.scoreLabel, { color: '#EF4444' }]}>Team 2</Text>
              <Text style={[S.scoreNum, winner === 'team2' ? S.scoreWin : S.scoreLose]}>{scores.team2}</Text>
            </View>
          </View>
        </Animated.View>

        {/* 플레이어 카드 */}
        <View style={S.playersWrap}>
          <View style={S.teamGroup}>{team1Players.map((p, i) => renderPlayer(p, i))}</View>
          <View style={S.divider} />
          <View style={S.teamGroup}>{team2Players.map((p, i) => renderPlayer(p, i + 2))}</View>
        </View>

        {/* 보상 */}
        <Animated.View entering={FadeIn.delay(1200).duration(500)} style={S.rewardWrap}>
          <View style={S.rewardRow}>
            <View style={S.rewardItem}><Text style={S.rIcon}>{'\uD83E\uDE99'}</Text><Text style={S.rText}>+{rewards.coins}</Text></View>
            <View style={S.rewardItem}><Text style={S.rIcon}>{'\u2B50'}</Text><Text style={S.rText}>+{rewards.xp} XP</Text></View>
            {rewards.bonusCoins > 0 && <View style={S.rewardItem}><Text style={S.rIcon}>{'\uD83C\uDFC6'}</Text><Text style={S.rText}>+{rewards.bonusCoins}</Text></View>}
            {rewards.tichuBonus > 0 && <View style={S.rewardItem}><Text style={S.rIcon}>{'\uD83C\uDFAF'}</Text><Text style={S.rText}>+{rewards.tichuBonus}</Text></View>}
          </View>
          <View style={S.xpWrap}>
            <View style={S.xpBg}><Animated.View style={[S.xpFill, xpStyle]} /></View>
            <Text style={S.xpText}>{xpAfter} / {xpMax} XP</Text>
          </View>
          {tierUp && (
            <Animated.View entering={ZoomIn.delay(2500).duration(400).springify()} style={S.tierUp}>
              <Text style={S.tierUpText}>{'\uD83C\uDF8A \uACE8\uB4DC \uC2B9\uAE09!'}</Text>
            </Animated.View>
          )}
        </Animated.View>

        {/* 버튼 */}
        <Animated.View entering={FadeIn.delay(1600).duration(400)} style={S.buttons}>
          <TouchableOpacity style={S.rematchBtn} onPress={onRematch} activeOpacity={0.85}>
            <Text style={S.rematchText}>{'\uB2E4\uC2DC\uD558\uAE30'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.lobbyBtn} onPress={onLobby}>
            <Text style={S.lobbyText}>{'\uB85C\uBE44\uB85C'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, zIndex: 5 },

  // 배너
  bannerWrap: { alignItems: 'center', gap: 10 },
  banner: { fontSize: 40, fontWeight: '900' },
  bannerWin: { color: '#FFD700', textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 16 },
  bannerLose: { color: 'rgba(255,255,255,0.5)' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreTeam: { alignItems: 'center' },
  scoreLabel: { fontSize: 12, fontWeight: '700' },
  scoreNum: { fontSize: 32, fontWeight: '900' },
  scoreWin: { color: '#FFD700' },
  scoreLose: { color: 'rgba(255,255,255,0.4)' },
  vs: { color: 'rgba(255,255,255,0.15)', fontSize: 16, fontWeight: '900' },

  // 플레이어
  playersWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  teamGroup: { flexDirection: 'row', gap: 6 },
  divider: { width: 1, height: 80, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 6 },
  pCard: { width: 100, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, borderWidth: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6, gap: 2, position: 'relative' },
  pCardMvp: { borderColor: '#FFD700 !important' as any, shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  mvpIcon: { position: 'absolute', top: -8, right: -4, fontSize: 16 },
  pAvatar: { fontSize: 28 },
  pName: { color: '#fff', fontSize: 12, fontWeight: '700', maxWidth: 80, textAlign: 'center' },
  pTier: { fontSize: 12 },
  pStatsRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  pStat: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600' },
  pGood: { color: '#10b981' },
  pBad: { color: '#ef4444' },

  // 보상
  rewardWrap: { alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
  rewardRow: { flexDirection: 'row', gap: 14 },
  rewardItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  rIcon: { fontSize: 14 },
  rText: { color: '#F59E0B', fontSize: 13, fontWeight: '800' },
  xpWrap: { alignItems: 'center', gap: 4, width: '80%', maxWidth: 280 },
  xpBg: { width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  xpFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 4 },
  xpText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' },
  tierUp: { backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 6 },
  tierUpText: { color: '#FFD700', fontSize: 16, fontWeight: '900' },

  // 버튼
  buttons: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  rematchBtn: { backgroundColor: '#D97706', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  rematchText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  lobbyBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  lobbyText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '700' },
});
