import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, Modal, TextInput } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { isMobile, isTablet, responsiveCols } from '../utils/responsive';
import { useGameStore } from '../stores/gameStore';
import { useUserStore, getTier, TIERS, SHOP_AVATARS, getUnlockedTitles, ALL_TITLES, TIER_FRAME_COLORS } from '../stores/userStore';
import { useAchievementStore } from '../stores/achievementStore';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

// ── 색상 토큰 ──────────────────────────────────────────────
const C = {
  bg: '#1a2e1a',
  card: 'rgba(42,63,42,0.7)',
  cardBright: 'rgba(48,72,48,0.8)',
  accent: '#f5a623',
  accentDim: 'rgba(245,166,35,0.15)',
  mint: '#4ecdc4',
  text: '#ffffff',
  textSub: '#a8b5a8',
  textDim: 'rgba(255,255,255,0.35)',
  border: 'rgba(255,255,255,0.06)',
  win: '#4CAF50',
  lose: '#F44336',
};

interface Props {
  onBack: () => void;
  onEdit: () => void;
  onStartGame: () => void;
  onAchievements: () => void;
  showNickEdit: boolean;
  setShowNickEdit: (v: boolean) => void;
  nick: string;
  setNick: (v: string) => void;
  onSaveNick: () => void;
}

export function ProfilePage({ onBack, onEdit, onStartGame, onAchievements, showNickEdit, setShowNickEdit, nick, setNick, onSaveNick }: Props) {
  const us = useUserStore.getState();
  const equippedAvatar = useUserStore((s) => s.equippedAvatar);
  const avatarEmoji = SHOP_AVATARS.find(a => a.id === equippedAvatar)?.emoji ?? '🐲';
  const hasData = us.totalGames > 0;
  const winRate = hasData ? Math.round(us.wins / us.totalGames * 100) : 0;
  const myTier = getTier(us.xp);
  const myTierIdx = TIERS.indexOf(myTier);
  const nextTier = myTierIdx < TIERS.length - 1 ? TIERS[myTierIdx + 1]! : myTier;
  const isMaxTier = myTier === nextTier;
  const xpPct = Math.min(100, Math.round(((us.xp - myTier.min) / (myTier.max - myTier.min + 1)) * 100));
  const level = Math.max(1, Math.floor(us.xp / 100) + 1);
  const frame = TIER_FRAME_COLORS[myTier.key] ?? TIER_FRAME_COLORS['iron']!;
  const tichuTotal = us.tichuSuccess + us.tichuFail;
  const tichuRate = tichuTotal > 0 ? Math.round(us.tichuSuccess / tichuTotal * 100) : 0;
  const largeTichuTotal = us.largeTichuSuccess + us.largeTichuFail;
  const largeTichuRate = largeTichuTotal > 0 ? Math.round(us.largeTichuSuccess / largeTichuTotal * 100) : 0;
  const name = us.nickname || 'Guest';

  // 전적 데이터
  const serverHistory = useGameStore.getState().gameHistory ?? [];
  const recentGames = serverHistory.length > 0
    ? serverHistory.map(g => ({ won: g.won, myScore: g.myScore, opScore: g.opScore, date: g.date, rp: 0, rank: g.rank }))
    : (us.recentGames ?? []).map(g => ({ ...g, rank: 0 }));

  // RP 그래프
  const graphData = recentGames.slice(0, 20).reverse();
  const graphMin = graphData.length > 0 ? Math.min(...graphData.map(g => g.rp)) - 20 : 0;
  const graphMax = graphData.length > 0 ? Math.max(...graphData.map(g => g.rp)) + 20 : 100;
  const graphRange = Math.max(1, graphMax - graphMin);
  const graphWins = graphData.filter(g => g.won).length;

  // 업적
  const achievements = useAchievementStore.getState().achievements;
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  // 리더보드
  const leaderboard = useGameStore.getState().leaderboard ?? [];
  const seasonInfo = useGameStore.getState().seasonInfo;
  const [lbTab, setLbTab] = React.useState<'all' | 'friends' | 'weekly'>('all');
  const [showTitlePicker, setShowTitlePicker] = React.useState(false);
  const unlockedTitles = getUnlockedTitles(us);
  const activeTitle = unlockedTitles.find(t => t.id === us.selectedTitle) ?? unlockedTitles[0] ?? null;

  // ── 렌더 헬퍼 ──────────────────────────────────────────────

  const StatItem = ({ icon, value, label, color }: { icon: string; value: string; label: string; color?: string }) => (
    <View style={S.statItem}>
      <Text style={S.statIcon}>{icon}</Text>
      <Text style={[S.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={S.statLabel}>{label}</Text>
    </View>
  );

  // ── 섹션 렌더 ──────────────────────────────────────────────

  const HeaderCard = () => (
    <Animated.View entering={FadeInUp.duration(400)} style={S.headerCard}>
      {/* 편집 버튼 우상단 */}
      <TouchableOpacity style={S.editBtn} onPress={onEdit} activeOpacity={0.7}>
        <Text style={S.editBtnText}>{'✏️'}</Text>
      </TouchableOpacity>
      {/* 뒤로가기 좌상단 */}
      <TouchableOpacity style={S.backBtn} onPress={onBack} activeOpacity={0.7}>
        <Text style={S.backBtnText}>{'←'}</Text>
      </TouchableOpacity>
      <View style={S.headerCenter}>
        <View style={[S.avatarRing, { borderColor: frame.border, shadowColor: frame.shadow }]}>
          <Text style={S.avatarEmoji}>{avatarEmoji}</Text>
          <View style={[S.lvBadge, { backgroundColor: myTier.color }]}><Text style={S.lvText}>{level}</Text></View>
        </View>
        <Text style={S.nickname}>{name}</Text>
        {activeTitle ? (
          <TouchableOpacity onPress={() => setShowTitlePicker(true)}><Text style={S.titleText}>{activeTitle.icon} {activeTitle.name}</Text></TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setShowTitlePicker(true)}><Text style={S.titleEmpty}>{'칭호를 선택해보세요 ›'}</Text></TouchableOpacity>
        )}
        <View style={[S.tierChip, { borderColor: myTier.color, backgroundColor: `${myTier.color}18` }]}>
          <Text style={[S.tierChipText, { color: myTier.color }]}>{myTier.icon} {myTier.name}</Text>
        </View>
      </View>
      {/* XP 바 */}
      <View style={S.xpSection}>
        <View style={S.xpBar}><View style={[S.xpFill, { width: `${xpPct}%`, backgroundColor: myTier.color }]} /></View>
        <View style={S.xpLabels}>
          <Text style={S.xpLeft}>{myTier.icon} {us.xp} RP</Text>
          <Text style={S.xpRight}>{isMaxTier ? 'MAX' : `${nextTier.icon} ${nextTier.name}까지 ${myTier.max - us.xp}`}</Text>
        </View>
      </View>
    </Animated.View>
  );

  const StatsRow = () => (
    <Animated.View entering={FadeInUp.delay(100).duration(400)} style={S.statsCard}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.statsScroll}>
        <StatItem icon="🎮" value={`${us.totalGames}`} label="총 게임" />
        <StatItem icon="📊" value={`${winRate}%`} label="승률" color={hasData ? (winRate >= 50 ? C.win : C.lose) : C.textSub} />
        <StatItem icon="🎯" value={`${tichuRate}%`} label="티츄 성공률" />
        <StatItem icon="🔥" value={`${us.winStreak}`} label="최고 연승" />
        <StatItem icon="👑" value={largeTichuTotal > 0 ? `${largeTichuRate}%` : '0%'} label="라지 티츄" />
        <StatItem icon="🤝" value={`${us.oneTwoFinish}`} label="원투 성공" />
      </ScrollView>
    </Animated.View>
  );

  const RecentCard = () => (
    <Animated.View entering={FadeInUp.delay(200).duration(400)} style={S.card}>
      <Text style={S.cardTitle}>{'최근 전적'}</Text>
      {recentGames.length === 0 ? (
        <View style={S.emptyCompact}>
          <Text style={{ fontSize: 40, marginBottom: 8 }}>{'🃏'}</Text>
          <Text style={S.emptyMsg}>{'첫 게임을 시작해보세요!'}</Text>
          <TouchableOpacity style={S.ctaBtn} onPress={onStartGame} activeOpacity={0.8}>
            <Text style={S.ctaBtnText}>{'▶ 첫 게임 시작하기'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* 승패 도트 시각화 */}
          <View style={S.dotsRow}>
            {recentGames.slice(0, 10).map((g, i) => (
              <View key={i} style={[S.dot, { backgroundColor: g.won ? C.win : C.lose }]} />
            ))}
          </View>
          {/* 리스트 */}
          {recentGames.slice(0, 10).map((g, i) => (
            <View key={i} style={S.recentRow}>
              <View style={[S.recentBadge, { backgroundColor: g.won ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.12)' }]}>
                <Text style={[S.recentBadgeText, { color: g.won ? C.win : C.lose }]}>{g.won ? '승' : '패'}</Text>
              </View>
              {g.myScore > 0 && <Text style={S.recentScore}>{g.myScore}{':'}{g.opScore}</Text>}
              {g.rank > 0 && <Text style={S.recentRank}>{g.rank}{'등'}</Text>}
              <View style={{ flex: 1 }} />
              <Text style={S.recentDate}>{g.date}</Text>
            </View>
          ))}
        </>
      )}
    </Animated.View>
  );

  const GraphCard = () => (
    <Animated.View entering={FadeInUp.delay(250).duration(400)} style={S.card}>
      <Text style={S.cardTitle}>{'RP 변화'}</Text>
      {graphData.length < 2 ? (
        <View style={S.emptyMini}><Text style={S.emptyMiniText}>{'게임을 플레이하면 그래프가 표시됩니다'}</Text></View>
      ) : (
        <>
          <View style={S.graphWrap}>
            {graphData.map((g, i) => {
              const pct = ((g.rp - graphMin) / graphRange) * 100;
              return (
                <View key={i} style={S.graphCol}>
                  <View style={[S.graphDot, { bottom: `${pct}%`, backgroundColor: g.won ? C.win : C.lose }]} />
                  <View style={[S.graphBar, { height: `${pct}%`, backgroundColor: g.won ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.12)' }]} />
                </View>
              );
            })}
          </View>
          <Text style={S.graphSum}>{'최근 '}{graphData.length}{'게임: '}{graphWins}{'승 '}{graphData.length - graphWins}{'패'}</Text>
        </>
      )}
    </Animated.View>
  );

  const LeaderboardCard = () => (
    <Animated.View entering={FadeInUp.delay(300).duration(400)} style={S.card}>
      <Text style={S.cardTitle}>{'리더보드'}</Text>
      <View style={S.lbTabs}>
        {(['all', 'friends', 'weekly'] as const).map(t => (
          <TouchableOpacity key={t} style={[S.lbTab, lbTab === t && S.lbTabActive]} onPress={() => setLbTab(t)}>
            <Text style={[S.lbTabText, lbTab === t && S.lbTabTextActive]}>{t === 'all' ? '전체' : t === 'friends' ? '친구' : '주간'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {lbTab === 'all' && leaderboard.length > 0 ? (
        leaderboard.slice(0, 10).map((entry, i) => {
          const isMe = entry.id === useGameStore.getState().dbUserId;
          const et = getTier(entry.xp);
          return (
            <View key={i} style={[S.lbRow, isMe && S.lbRowMe]}>
              <Text style={S.lbRank}>{i + 1}</Text>
              <Text style={{ fontSize: 14 }}>{et.icon}</Text>
              <Text style={[S.lbName, isMe && S.lbNameMe]} numberOfLines={1}>{entry.nickname}</Text>
              <Text style={S.lbXp}>{entry.xp} RP</Text>
            </View>
          );
        })
      ) : (
        <View style={S.emptyMini}><Text style={S.emptyMiniText}>{'시즌 데이터를 수집 중입니다'}</Text></View>
      )}
    </Animated.View>
  );

  const AchievementsCard = () => (
    <Animated.View entering={FadeInUp.delay(350).duration(400)} style={S.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Text style={S.cardTitle}>{'업적'}</Text>
        <Text style={{ color: C.accent, fontSize: 12, fontWeight: '700' }}>{unlockedCount}{' / '}{achievements.length}</Text>
      </View>
      {/* 달성률 바 */}
      <View style={S.achBar}><View style={[S.achBarFill, { width: `${Math.round(unlockedCount / achievements.length * 100)}%` }]} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.achScroll}>
        {achievements.slice(0, 12).map((a, i) => (
          <View key={i} style={[S.achSlot, !a.unlocked && S.achLocked]}>
            <Text style={[S.achIcon, !a.unlocked && { opacity: 0.2 }]}>{a.icon}</Text>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity onPress={onAchievements}><Text style={S.achMore}>{'더보기 ›'}</Text></TouchableOpacity>
    </Animated.View>
  );

  const SeasonCard = () => (
    <Animated.View entering={FadeInUp.delay(400).duration(400)} style={S.cardCompact}>
      <Text style={S.cardTitle}>{'시즌 보상'}</Text>
      {seasonInfo ? (
        <Text style={S.seasonLine}>{seasonInfo.seasonName}{' · 레이팅 '}{seasonInfo.myRating}{' RP · #'}{seasonInfo.myRank}{' · 남은 '}{seasonInfo.remainingDays}{'일'}</Text>
      ) : (
        <Text style={S.seasonLine}>{'시즌 종료 시 티어에 따라 보상이 지급됩니다'}</Text>
      )}
    </Animated.View>
  );

  const PartnerCard = () => (
    <Animated.View entering={FadeInUp.delay(450).duration(400)} style={S.cardCompact}>
      <Text style={S.cardTitle}>{'파트너 케미'}</Text>
      <Text style={{ color: C.textSub, fontSize: 12 }}>{'데이터 수집 중 — 더 많은 게임을 플레이해주세요'}</Text>
    </Animated.View>
  );

  // ── 레이아웃 ──────────────────────────────────────────────

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      <ScrollView style={{ flex: 1, zIndex: 5 }} contentContainerStyle={S.scrollContent}>
        {/* 1. 풀 와이드 헤더 */}
        <HeaderCard />

        {/* 2. 핵심 전적 가로 배치 */}
        <StatsRow />

        {/* 3~8. 반응형 그리드 */}
        {responsiveCols === 1 ? (
          <>
            <RecentCard />
            <GraphCard />
            <LeaderboardCard />
            <AchievementsCard />
            <SeasonCard />
            <PartnerCard />
          </>
        ) : responsiveCols === 2 ? (
          <View style={S.grid2}>
            <View style={S.gridCol}><RecentCard /><GraphCard /><SeasonCard /></View>
            <View style={S.gridCol}><LeaderboardCard /><AchievementsCard /><PartnerCard /></View>
          </View>
        ) : (
          <View style={S.grid3}>
            <View style={S.gridCol}><RecentCard /><PartnerCard /></View>
            <View style={S.gridCol}><GraphCard /><AchievementsCard /></View>
            <View style={S.gridCol}><LeaderboardCard /><SeasonCard /></View>
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* 닉네임 편집 모달 */}
      <Modal visible={showNickEdit} transparent animationType="fade">
        <View style={S.modalOvl}><View style={S.modalBox}>
          <Text style={S.modalTitle}>{'✏️ 닉네임 변경'}</Text>
          <TextInput style={S.modalInput} value={nick} onChangeText={setNick} placeholder="닉네임 입력" placeholderTextColor="rgba(255,255,255,0.3)" maxLength={12} />
          <TouchableOpacity style={[S.ctaBtn, !nick.trim() && { opacity: 0.4 }]} onPress={onSaveNick} disabled={!nick.trim()}><Text style={S.ctaBtnText}>{'확인'}</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* 칭호 선택 모달 */}
      <Modal visible={showTitlePicker} transparent animationType="fade">
        <View style={S.modalOvl}><View style={[S.modalBox, { maxWidth: 380 }]}>
          <Text style={S.modalTitle}>{'🏅 칭호 선택'}</Text>
          <View style={{ gap: 6 }}>
            {ALL_TITLES.map(t => {
              const ok = unlockedTitles.some(u => u.id === t.id);
              const sel = us.selectedTitle === t.id;
              return (
                <TouchableOpacity key={t.id} style={[S.titleRow, sel && S.titleRowSel, !ok && { opacity: 0.5 }]}
                  onPress={() => { if (ok) { useUserStore.getState().setTitle(t.id); setShowTitlePicker(false); } }} disabled={!ok}>
                  <Text style={{ fontSize: 18, opacity: ok ? 1 : 0.3 }}>{t.icon}</Text>
                  <View style={{ flex: 1 }}><Text style={{ color: ok ? '#fff' : C.textSub, fontSize: 13, fontWeight: '700' }}>{t.name}</Text><Text style={{ color: C.textSub, fontSize: 11 }}>{t.desc}</Text></View>
                  {sel && <Text style={{ color: C.mint }}>{'✓'}</Text>}
                  {!ok && <Text>{'🔒'}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={[S.ctaBtn, { marginTop: 12 }]} onPress={() => setShowTitlePicker(false)}><Text style={S.ctaBtnText}>{'닫기'}</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

// ── 스타일 ──────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingHorizontal: isMobile ? 12 : 24, paddingBottom: 30, maxWidth: 1200, alignSelf: 'center', width: '100%' },

  // 헤더 카드 (풀 와이드)
  headerCard: { backgroundColor: C.cardBright, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: C.border, position: 'relative' },
  headerCenter: { alignItems: 'center', marginBottom: 12 },
  backBtn: { position: 'absolute', top: 14, left: 14, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  backBtnText: { color: C.text, fontSize: 18, fontWeight: '700' },
  editBtn: { position: 'absolute', top: 14, right: 14, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  editBtnText: { fontSize: 16 },
  avatarRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 10, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8 },
  avatarEmoji: { fontSize: 38 },
  lvBadge: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)' },
  lvText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  nickname: { color: C.text, fontSize: 20, fontWeight: '900', marginBottom: 2 },
  titleText: { color: C.accent, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  titleEmpty: { color: C.textDim, fontSize: 11, marginBottom: 6 },
  tierChip: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3, marginBottom: 4 },
  tierChipText: { fontSize: 12, fontWeight: '800' },

  // XP 바
  xpSection: { marginTop: 4 },
  xpBar: { height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  xpFill: { height: '100%', borderRadius: 4 },
  xpLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  xpLeft: { color: C.textSub, fontSize: 11, fontWeight: '700' },
  xpRight: { color: C.textDim, fontSize: 11, fontWeight: '600' },

  // 전적 요약 가로
  statsCard: { backgroundColor: C.cardBright, borderRadius: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  statsScroll: { paddingHorizontal: 8, paddingVertical: 12, gap: 4 },
  statItem: { alignItems: 'center', minWidth: 80, paddingHorizontal: 8 },
  statIcon: { fontSize: 16, marginBottom: 2 },
  statValue: { color: C.text, fontSize: 24, fontWeight: '900' },
  statLabel: { color: C.textSub, fontSize: 11, fontWeight: '600', marginTop: 2 },

  // 카드 공통
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  cardCompact: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800', marginBottom: 10 },

  // 그리드
  grid2: { flexDirection: 'row', gap: 16 },
  grid3: { flexDirection: 'row', gap: 16 },
  gridCol: { flex: 1 },

  // 빈 상태
  emptyCompact: { alignItems: 'center', paddingVertical: 16 },
  emptyMsg: { color: C.textSub, fontSize: 14, fontWeight: '600', marginBottom: 14 },
  emptyMini: { paddingVertical: 12, alignItems: 'center' },
  emptyMiniText: { color: C.textDim, fontSize: 12, fontWeight: '600' },

  // CTA 버튼
  ctaBtn: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12, shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  ctaBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },

  // 승패 도트
  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: 10, justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },

  // 최근 전적 리스트
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  recentBadge: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  recentBadgeText: { fontSize: 12, fontWeight: '800' },
  recentScore: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  recentRank: { color: C.textDim, fontSize: 11, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  recentDate: { color: C.textDim, fontSize: 11 },

  // RP 그래프
  graphWrap: { flexDirection: 'row', height: 80, alignItems: 'flex-end', gap: 2, marginBottom: 6 },
  graphCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', position: 'relative' },
  graphDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, zIndex: 2 },
  graphBar: { width: '70%', borderRadius: 2, minHeight: 2 },
  graphSum: { color: C.textSub, fontSize: 11, fontWeight: '700', textAlign: 'center' },

  // 리더보드
  lbTabs: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  lbTab: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
  lbTabActive: { backgroundColor: 'rgba(78,205,196,0.12)', borderWidth: 1, borderColor: 'rgba(78,205,196,0.25)' },
  lbTabText: { color: C.textDim, fontSize: 12, fontWeight: '700' },
  lbTabTextActive: { color: C.mint },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 6 },
  lbRowMe: { backgroundColor: 'rgba(78,205,196,0.1)', borderWidth: 1, borderColor: 'rgba(78,205,196,0.2)' },
  lbRank: { color: C.textSub, fontSize: 13, fontWeight: '800', width: 22, textAlign: 'center' },
  lbName: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  lbNameMe: { color: C.mint, fontWeight: '800' },
  lbXp: { color: C.textDim, fontSize: 12, fontWeight: '700' },

  // 업적
  achBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' },
  achBarFill: { height: '100%', backgroundColor: C.mint, borderRadius: 2 },
  achScroll: { gap: 8, paddingVertical: 4 },
  achSlot: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  achLocked: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.08)' },
  achIcon: { fontSize: 20 },
  achMore: { color: C.mint, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 6 },

  // 시즌
  seasonLine: { color: C.textSub, fontSize: 12, fontWeight: '600' },

  // 모달
  modalOvl: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalBox: { backgroundColor: '#1e321e', borderRadius: 16, padding: 24, width: 340, maxWidth: '90%' as any, borderWidth: 1, borderColor: C.border },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  modalInput: { backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', textAlign: 'center', marginBottom: 14 },

  // 칭호
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.border },
  titleRowSel: { borderColor: 'rgba(78,205,196,0.3)', backgroundColor: 'rgba(78,205,196,0.06)' },
});
