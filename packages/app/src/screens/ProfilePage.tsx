import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, TextInput, Dimensions } from 'react-native';
import Animated, {
  FadeInUp, useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence, Easing,
} from 'react-native-reanimated';
import { useGameStore } from '../stores/gameStore';
import { useUserStore, getTier, TIERS, SHOP_AVATARS, getUnlockedTitles, ALL_TITLES, TIER_FRAME_COLORS } from '../stores/userStore';
import { useAchievementStore } from '../stores/achievementStore';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

const W = Dimensions.get('window').width;
const IS_MOBILE = W < 768;
const IS_DESKTOP = W >= 1200;

// ── 색상 ───────────────────────────────────────────────────
const C = {
  bg: '#1a2e1a',
  card: 'rgba(42,63,42,0.6)',
  cardImportant: 'rgba(42,63,42,0.8)',
  accent: '#f5a623',
  mint: '#4ecdc4',
  text: '#ffffff',
  sub: '#a8b5a8',
  dim: 'rgba(255,255,255,0.35)',
  border: 'rgba(255,255,255,0.08)',
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
  const equippedAvatar = useUserStore(s => s.equippedAvatar);
  const avatarEmoji = SHOP_AVATARS.find(a => a.id === equippedAvatar)?.emoji ?? '🐲';
  const hasData = us.totalGames > 0;
  const winRate = hasData ? Math.round(us.wins / us.totalGames * 100) : 0;
  const myTier = getTier(us.xp);
  const idx = TIERS.indexOf(myTier);
  const nextTier = idx < TIERS.length - 1 ? TIERS[idx + 1]! : myTier;
  const isMax = myTier === nextTier;
  const xpPct = Math.min(100, Math.round(((us.xp - myTier.min) / (myTier.max - myTier.min + 1)) * 100));
  const level = Math.max(1, Math.floor(us.xp / 100) + 1);
  const frame = TIER_FRAME_COLORS[myTier.key] ?? TIER_FRAME_COLORS['iron']!;
  const tichuTotal = us.tichuSuccess + us.tichuFail;
  const tichuRate = tichuTotal > 0 ? Math.round(us.tichuSuccess / tichuTotal * 100) : 0;
  const ltTotal = us.largeTichuSuccess + us.largeTichuFail;
  const ltRate = ltTotal > 0 ? Math.round(us.largeTichuSuccess / ltTotal * 100) : 0;
  const name = us.nickname || 'Guest';

  const serverHistory = useGameStore.getState().gameHistory ?? [];
  const recentGames = serverHistory.length > 0
    ? serverHistory.map(g => ({ won: g.won, myScore: g.myScore, opScore: g.opScore, date: g.date, rp: 0, rank: g.rank }))
    : (us.recentGames ?? []).map(g => ({ ...g, rank: 0 }));
  const graphData = recentGames.slice(0, 20).reverse();
  const graphMin = graphData.length > 0 ? Math.min(...graphData.map(g => g.rp)) - 20 : 0;
  const graphMax = graphData.length > 0 ? Math.max(...graphData.map(g => g.rp)) + 20 : 100;
  const graphRange = Math.max(1, graphMax - graphMin);
  const graphWins = graphData.filter(g => g.won).length;

  const achievements = useAchievementStore.getState().achievements;
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const leaderboard = useGameStore.getState().leaderboard ?? [];
  const seasonInfo = useGameStore.getState().seasonInfo;
  const [lbTab, setLbTab] = React.useState<'all' | 'friends' | 'weekly'>('all');
  const [lbExpanded, setLbExpanded] = React.useState(false);
  const [showTitlePicker, setShowTitlePicker] = React.useState(false);
  const unlockedTitles = getUnlockedTitles(us);
  const activeTitle = unlockedTitles.find(t => t.id === us.selectedTitle) ?? unlockedTitles[0] ?? null;

  // ── XP 바 애니메이션 ──────────────────────────────────────
  const xpAnim = useSharedValue(0);
  useEffect(() => { xpAnim.value = withTiming(xpPct, { duration: 800, easing: Easing.out(Easing.cubic) }); }, []);
  const xpAnimStyle = useAnimatedStyle(() => ({ width: `${xpAnim.value}%` as any }));

  // ── CTA 펄스 ──────────────────────────────────────────────
  const pulseScale = useSharedValue(1);
  useEffect(() => {
    pulseScale.value = withRepeat(withSequence(
      withTiming(1.04, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
    ), -1, false);
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));

  // ── 카드 딜레이 헬퍼 ──────────────────────────────────────
  const D = (i: number) => FadeInUp.delay(i * 50).duration(350);

  // ── 전적 요약 아이템 ──────────────────────────────────────
  const Stat = ({ icon, val, label, color }: { icon: string; val: string; label: string; color?: string }) => (
    <View style={IS_MOBILE ? $.statItemMob : $.statItem}>
      <Text style={IS_MOBILE ? $.statIconMob : $.statIcon}>{icon}</Text>
      <Text style={[IS_MOBILE ? $.statValMob : $.statVal, color ? { color } : null]}>{val}</Text>
      <Text style={IS_MOBILE ? $.statLabelMob : $.statLabel}>{label}</Text>
    </View>
  );

  // ── 리더보드 데이터 ──────────────────────────────────────
  const lbData = lbTab === 'all' ? leaderboard : [];
  const lbShow = IS_MOBILE && !lbExpanded ? lbData.slice(0, 3) : lbData.slice(0, 10);

  // ── 메인/사이드 분리 (데스크톱) ──────────────────────────
  const MainContent = () => (
    <>
      {/* 전적 요약 */}
      <Animated.View entering={D(1)} style={IS_MOBILE ? $.statsCardMob : $.statsCard}>
        {IS_MOBILE ? (
          <View style={$.statsGridMob}>
            <Stat icon="🎮" val={`${us.totalGames}`} label="총 게임" />
            <Stat icon="📊" val={`${winRate}%`} label="승률" color={hasData ? (winRate >= 50 ? C.win : C.lose) : C.sub} />
            <Stat icon="🎯" val={`${tichuRate}%`} label="티츄 성공률" />
            <Stat icon="🔥" val={`${us.winStreak}`} label="최고 연승" />
            <Stat icon="👑" val={`${ltRate}%`} label="라지 티츄" />
            <Stat icon="🤝" val={`${us.oneTwoFinish}`} label="원투 성공" />
          </View>
        ) : (
          <View style={$.statsRow}>
            <Stat icon="🎮" val={`${us.totalGames}`} label="총 게임" />
            <Stat icon="📊" val={`${winRate}%`} label="승률" color={hasData ? (winRate >= 50 ? C.win : C.lose) : C.sub} />
            <Stat icon="🎯" val={`${tichuRate}%`} label="티츄 성공률" />
            <Stat icon="🔥" val={`${us.winStreak}`} label="최고 연승" />
            <Stat icon="👑" val={`${ltRate}%`} label="라지 티츄" />
            <Stat icon="🤝" val={`${us.oneTwoFinish}`} label="원투 성공" />
          </View>
        )}
        {!hasData && <Text style={$.statsHint}>{'게임을 플레이하면 통계가 쌓여요'}</Text>}
      </Animated.View>

      {/* 최근 전적 */}
      <Animated.View entering={D(2)} style={IS_MOBILE ? $.cardMob : $.cardImportant}>
        <Text style={IS_MOBILE ? $.cardTitleMob : $.cardTitle}>{'최근 전적'}</Text>
        {recentGames.length === 0 ? (
          <View style={IS_MOBILE ? $.emptyCtaMob : $.emptyCta}>
            <Text style={{ fontSize: IS_MOBILE ? 48 : 80, marginBottom: IS_MOBILE ? 6 : 12, opacity: 0.7 }}>{'🃏'}</Text>
            <Text style={IS_MOBILE ? $.emptyCtaMsgMob : $.emptyCtaMsg}>{'첫 게임을 시작해보세요!'}</Text>
            <Animated.View style={pulseStyle}>
              <TouchableOpacity style={IS_MOBILE ? $.ctaBtnMob : $.ctaBtn} onPress={onStartGame} activeOpacity={0.8}>
                <Text style={IS_MOBILE ? $.ctaBtnTextMob : $.ctaBtnText}>{'▶  첫 게임 시작하기'}</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        ) : (
          <>
            <View style={$.dotsRow}>
              {recentGames.slice(0, 10).map((g, i) => (
                <View key={i} style={[$.dot, { backgroundColor: g.won ? C.win : C.lose }]} />
              ))}
            </View>
            {recentGames.slice(0, 10).map((g, i) => (
              <View key={i} style={$.recentRow}>
                <View style={[$.recentBadge, { backgroundColor: g.won ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.12)' }]}>
                  <Text style={[$.recentBadgeT, { color: g.won ? C.win : C.lose }]}>{g.won ? '승' : '패'}</Text>
                </View>
                {g.myScore > 0 && <Text style={$.recentScore}>{g.myScore}{':'}{g.opScore}</Text>}
                {g.rank > 0 && <Text style={$.recentRank}>{g.rank}{'등'}</Text>}
                <View style={{ flex: 1 }} />
                <Text style={$.recentDate}>{g.date}</Text>
              </View>
            ))}
          </>
        )}
      </Animated.View>

      {/* RP 변화 */}
      <Animated.View entering={D(3)} style={IS_MOBILE ? $.cardMob : $.card}>
        <Text style={IS_MOBILE ? $.cardTitleMob : $.cardTitle}>{'RP 변화'}</Text>
        {graphData.length < 2 ? (
          <View style={$.graphEmpty}>
            {/* 더미 점선 배경 */}
            {[30, 50, 70].map(h => (
              <View key={h} style={[$.graphDummy, { bottom: `${h}%` }]} />
            ))}
            <Text style={$.graphEmptyText}>{'게임을 플레이하면 그래프가 표시됩니다'}</Text>
          </View>
        ) : (
          <>
            <View style={$.graphWrap}>
              {graphData.map((g, i) => {
                const pct = ((g.rp - graphMin) / graphRange) * 100;
                return (
                  <View key={i} style={$.graphCol}>
                    <View style={[$.graphDot, { bottom: `${pct}%`, backgroundColor: g.won ? C.win : C.lose }]} />
                    <View style={[$.graphBar, { height: `${pct}%`, backgroundColor: g.won ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.12)' }]} />
                  </View>
                );
              })}
            </View>
            <Text style={$.graphSum}>{'최근 '}{graphData.length}{'게임: '}{graphWins}{'승 '}{graphData.length - graphWins}{'패'}</Text>
          </>
        )}
      </Animated.View>

      {/* 업적 */}
      <Animated.View entering={D(4)} style={IS_MOBILE ? $.cardMob : $.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={$.cardTitle}>{'업적'}</Text>
          <Text style={{ color: C.accent, fontSize: 12, fontWeight: '700' }}>{unlockedCount}{' / '}{achievements.length}</Text>
        </View>
        <View style={$.achBar}><View style={[$.achFill, { width: `${Math.round(unlockedCount / Math.max(1, achievements.length) * 100)}%` }]} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={$.achScroll}>
          {achievements.slice(0, 12).map((a, i) => (
            <View key={i} style={[$.achSlot, !a.unlocked && $.achLocked]}>
              <Text style={[$.achIcon, !a.unlocked && { opacity: 0.2 }]}>{a.icon}</Text>
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={onAchievements}><Text style={$.achMore}>{'더보기 ›'}</Text></TouchableOpacity>
      </Animated.View>

      {/* 시즌 + 파트너 */}
      <Animated.View entering={D(5)} style={IS_MOBILE ? $.cardMob : $.card}>
        <Text style={IS_MOBILE ? $.cardTitleMob : $.cardTitle}>{'시즌 보상'}</Text>
        <Text style={$.subText}>{seasonInfo ? `${seasonInfo.seasonName} · ${seasonInfo.myRating} RP · #${seasonInfo.myRank} · 남은 ${seasonInfo.remainingDays}일` : '시즌 종료 시 티어에 따라 보상이 지급됩니다'}</Text>
      </Animated.View>
      <Animated.View entering={D(6)} style={IS_MOBILE ? $.cardMob : $.card}>
        <Text style={IS_MOBILE ? $.cardTitleMob : $.cardTitle}>{'파트너 케미'}</Text>
        <Text style={$.subText}>{'데이터 수집 중 — 더 많은 게임을 플레이해주세요'}</Text>
      </Animated.View>
    </>
  );

  const Sidebar = () => (
    <Animated.View entering={D(2)} style={IS_MOBILE ? $.sideCardMob : $.sideCard}>
      <Text style={IS_MOBILE ? $.cardTitleMob : $.cardTitle}>{'리더보드'}</Text>
      <View style={$.lbTabs}>
        {(['all', 'friends', 'weekly'] as const).map(t => (
          <TouchableOpacity key={t} style={[$.lbTab, lbTab === t && $.lbTabActive]} onPress={() => setLbTab(t)} accessibilityRole="button">
            <Text style={[$.lbTabText, lbTab === t && $.lbTabTextAct]}>{t === 'all' ? '전체' : t === 'friends' ? '친구' : '주간'}</Text>
            {lbTab === t && <View style={$.lbTabLine} />}
          </TouchableOpacity>
        ))}
      </View>
      {lbShow.length > 0 ? (
        <>
          {lbShow.map((e, i) => {
            const me = e.id === useGameStore.getState().dbUserId;
            const t = getTier(e.xp);
            return (
              <View key={i} style={[$.lbRow, me && $.lbRowMe]}>
                <Text style={$.lbRank}>{i + 1}</Text>
                <Text style={{ fontSize: 14 }}>{t.icon}</Text>
                <Text style={[$.lbName, me && $.lbNameMe]} numberOfLines={1}>{e.nickname}</Text>
                <Text style={$.lbXp}>{e.xp}</Text>
              </View>
            );
          })}
          {IS_MOBILE && lbData.length > 3 && (
            <TouchableOpacity style={$.lbToggle} onPress={() => setLbExpanded(!lbExpanded)}>
              <Text style={$.lbToggleText}>{lbExpanded ? '접기 ▲' : `더보기 ▼ (${lbData.length}명)`}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={$.emptyMini}><Text style={$.emptyMiniT}>{'시즌 데이터를 수집 중입니다'}</Text></View>
      )}
    </Animated.View>
  );

  return (
    <SafeAreaView style={$.root}>
      <BackgroundWatermark />
      <ScrollView style={{ flex: 1, zIndex: 5 }} contentContainerStyle={IS_MOBILE ? $.scrollMob : $.scrollPC}>
        {/* 1. 프로필 헤더 */}
        <Animated.View entering={D(0)} style={IS_MOBILE ? $.headerCardMob : $.headerCard}>
          {IS_MOBILE ? (
            /* 모바일: 가로 레이아웃 (아바타 좌 | 정보 우) */
            <>
              <View style={$.mobHeaderRow}>
                <TouchableOpacity style={$.backBtnMob} onPress={onBack} accessibilityLabel="뒤로가기"><Text style={$.backT}>{'←'}</Text></TouchableOpacity>
                <View style={[$.avatarMob, { borderColor: frame.border, shadowColor: frame.shadow }]}>
                  <Text style={$.avatarEmojiMob}>{avatarEmoji}</Text>
                  <View style={[$.lvBadgeMob, { backgroundColor: myTier.color }]}><Text style={$.lvT}>{level}</Text></View>
                </View>
                <View style={$.mobHeaderInfo}>
                  <Text style={$.nickMob} numberOfLines={1}>{name}</Text>
                  {activeTitle ? (
                    <TouchableOpacity onPress={() => setShowTitlePicker(true)}><Text style={$.titleTMob}>{activeTitle.icon} {activeTitle.name}</Text></TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => setShowTitlePicker(true)}><Text style={$.titleE}>{'칭호를 선택해보세요 ›'}</Text></TouchableOpacity>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <View style={[$.tierChipMob, { borderColor: myTier.color, backgroundColor: `${myTier.color}18` }]}>
                      <Text style={[$.tierChipTMob, { color: myTier.color }]}>{myTier.icon} {myTier.name}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={$.editBtnMob} onPress={onEdit} accessibilityLabel="프로필 편집"><Text style={$.editT}>{'✏️'}</Text></TouchableOpacity>
              </View>
              {/* XP 바 */}
              <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: xpPct }} style={{ marginTop: 8 }}>
                <Text style={$.xpCenterMob}>{us.xp}{' / '}{isMax ? '∞' : myTier.max}{' RP'}</Text>
                <View style={$.xpTrackMob}>
                  <Animated.View style={[$.xpFill, xpAnimStyle]} />
                  {!isMax && <Text style={$.xpNextIcon}>{nextTier.icon}</Text>}
                </View>
              </View>
            </>
          ) : (
            /* PC: 기존 세로 레이아웃 */
            <>
              <TouchableOpacity style={$.backBtn} onPress={onBack} accessibilityLabel="뒤로가기"><Text style={$.backT}>{'←'}</Text></TouchableOpacity>
              <TouchableOpacity style={$.editBtn} onPress={onEdit} accessibilityLabel="프로필 편집"><Text style={$.editT}>{'✏️'}</Text></TouchableOpacity>
              <View style={$.headerCenter}>
                <View style={[$.avatar, { borderColor: frame.border, shadowColor: frame.shadow }]}>
                  <Text style={$.avatarEmoji}>{avatarEmoji}</Text>
                  <View style={[$.lvBadge, { backgroundColor: myTier.color }]}><Text style={$.lvT}>{level}</Text></View>
                </View>
                <Text style={$.nick}>{name}</Text>
                {activeTitle ? (
                  <TouchableOpacity onPress={() => setShowTitlePicker(true)}><Text style={$.titleT}>{activeTitle.icon} {activeTitle.name}</Text></TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setShowTitlePicker(true)}><Text style={$.titleE}>{'칭호를 선택해보세요 ›'}</Text></TouchableOpacity>
                )}
                <View style={[$.tierChip, { borderColor: myTier.color, backgroundColor: `${myTier.color}18` }]}>
                  <Text style={[$.tierChipT, { color: myTier.color }]}>{myTier.icon} {myTier.name}</Text>
                </View>
              </View>
              <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: xpPct }}>
                <Text style={$.xpCenter}>{us.xp}{' / '}{isMax ? '∞' : myTier.max}{' RP'}</Text>
                <View style={$.xpTrack}>
                  <Animated.View style={[$.xpFill, xpAnimStyle]} />
                  {!isMax && <Text style={$.xpNextIcon}>{nextTier.icon}</Text>}
                </View>
              </View>
            </>
          )}
        </Animated.View>

        {/* 2~8. 반응형 */}
        {IS_DESKTOP ? (
          <View style={$.desktopLayout}>
            <View style={$.mainCol}><MainContent /></View>
            <View style={$.sideCol}><Sidebar /></View>
          </View>
        ) : (
          <>
            <MainContent />
            <Sidebar />
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* 닉네임 팝업 — in-tree overlay (RN Modal touch-lock 회피, commit 05fabec) */}
      {showNickEdit && (
        <View style={$.modalOvl}>
          <View style={$.modalBox}>
            <Text style={$.modalTitle}>{'✏️ 닉네임 변경'}</Text>
            <TextInput style={$.modalInput} value={nick} onChangeText={setNick} placeholder="닉네임 입력" placeholderTextColor="rgba(255,255,255,0.3)" maxLength={12} />
            <TouchableOpacity style={[$.ctaBtn, !nick.trim() && { opacity: 0.4 }]} onPress={onSaveNick} disabled={!nick.trim()}><Text style={$.ctaBtnText}>{'확인'}</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {/* 칭호 팝업 — in-tree overlay */}
      {showTitlePicker && (
        <View style={$.modalOvl}>
          <View style={[$.modalBox, { maxWidth: 380 }]}>
            <Text style={$.modalTitle}>{'🏅 칭호 선택'}</Text>
            <View style={{ gap: 6 }}>
              {ALL_TITLES.map(t => {
                const ok = unlockedTitles.some(u => u.id === t.id);
                const sel = us.selectedTitle === t.id;
                return (
                  <TouchableOpacity key={t.id} style={[$.titleRow, sel && $.titleRowSel, !ok && { opacity: 0.5 }]}
                    onPress={() => { if (ok) { useUserStore.getState().setTitle(t.id); setShowTitlePicker(false); } }} disabled={!ok}>
                    <Text style={{ fontSize: 18, opacity: ok ? 1 : 0.3 }}>{t.icon}</Text>
                    <View style={{ flex: 1 }}><Text style={{ color: ok ? '#fff' : C.sub, fontSize: 13, fontWeight: '700' }}>{t.name}</Text><Text style={{ color: C.sub, fontSize: 11 }}>{t.desc}</Text></View>
                    {sel && <Text style={{ color: C.mint }}>{'✓'}</Text>}
                    {!ok && <Text>{'🔒'}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={[$.ctaBtn, { marginTop: 12 }]} onPress={() => setShowTitlePicker(false)}><Text style={$.ctaBtnText}>{'닫기'}</Text></TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── 스타일 ──────────────────────────────────────────────────
const $ = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scrollMob: { paddingHorizontal: 8, paddingBottom: 16, maxWidth: 600, alignSelf: 'center', width: '100%' },
  scrollPC: { paddingHorizontal: 24, paddingBottom: 20, maxWidth: 1200, alignSelf: 'center', width: '100%' },

  // 헤더 (PC)
  headerCard: { backgroundColor: C.cardImportant, borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: C.border, position: 'relative' },
  headerCenter: { alignItems: 'center', marginBottom: 12 },
  backBtn: { position: 'absolute', top: 14, left: 14, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  backT: { color: C.text, fontSize: 20, fontWeight: '700' },
  editBtn: { position: 'absolute', top: 14, right: 14, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  editT: { fontSize: 18 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 10, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8 },
  avatarEmoji: { fontSize: 38 },
  lvBadge: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)' },
  lvT: { color: '#fff', fontSize: 10, fontWeight: '900' },
  nick: { color: C.text, fontSize: 20, fontWeight: '900', marginBottom: 2 },
  titleT: { color: C.accent, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  titleE: { color: C.dim, fontSize: 11, marginBottom: 6 },
  tierChip: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3, marginBottom: 8 },
  tierChipT: { fontSize: 12, fontWeight: '800' },

  // 헤더 (모바일) — 가로 레이아웃
  headerCardMob: { backgroundColor: C.cardImportant, borderRadius: 12, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  mobHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtnMob: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  editBtnMob: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  avatarMob: { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  avatarEmojiMob: { fontSize: 26 },
  lvBadgeMob: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(0,0,0,0.5)' },
  mobHeaderInfo: { flex: 1 },
  nickMob: { color: C.text, fontSize: 16, fontWeight: '900' },
  titleTMob: { color: C.accent, fontSize: 11, fontWeight: '700' },
  tierChipMob: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  tierChipTMob: { fontSize: 11, fontWeight: '800' },

  // XP 바 (PC)
  xpCenter: { color: C.sub, fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  xpTrack: { height: 10, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden', position: 'relative' },
  xpFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5, backgroundColor: C.mint },
  xpNextIcon: { position: 'absolute', right: 4, top: -1, fontSize: 10 },
  // XP 바 (모바일)
  xpCenterMob: { color: C.sub, fontSize: 11, fontWeight: '800', textAlign: 'center', marginBottom: 2 },
  xpTrackMob: { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden', position: 'relative' },

  // 전적 요약
  statsCard: { backgroundColor: C.cardImportant, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  statsCardMob: { backgroundColor: C.cardImportant, borderRadius: 10, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statsGridMob: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', paddingVertical: 6, minWidth: 80 },
  statItemMob: { alignItems: 'center', paddingVertical: 3, width: '33%' as any },
  statIcon: { fontSize: 16, marginBottom: 2 },
  statIconMob: { fontSize: 13, marginBottom: 1 },
  statVal: { color: C.text, fontSize: 24, fontWeight: '900' },
  statValMob: { color: C.text, fontSize: 18, fontWeight: '900' },
  statLabel: { color: C.sub, fontSize: 11, fontWeight: '600', marginTop: 2 },
  statLabelMob: { color: C.sub, fontSize: 9, fontWeight: '600', marginTop: 1 },
  statsHint: { color: C.dim, fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 8 },

  // 카드
  card: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  cardMob: { backgroundColor: C.card, borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  cardImportant: { backgroundColor: C.cardImportant, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  cardTitleMob: { color: C.text, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  subText: { color: C.sub, fontSize: 12, fontWeight: '600' },

  // CTA (PC)
  emptyCta: { alignItems: 'center', paddingVertical: 24 },
  emptyCtaMsg: { color: C.sub, fontSize: 15, fontWeight: '600', marginBottom: 18 },
  ctaBtn: { backgroundColor: C.accent, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14, shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  // CTA (모바일)
  emptyCtaMob: { alignItems: 'center', paddingVertical: 12 },
  emptyCtaMsgMob: { color: C.sub, fontSize: 13, fontWeight: '600', marginBottom: 10 },
  ctaBtnMob: { backgroundColor: C.accent, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  ctaBtnTextMob: { color: '#fff', fontSize: 14, fontWeight: '900', textAlign: 'center' },

  // 도트
  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: 10, justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },

  // 최근 전적
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  recentBadge: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  recentBadgeT: { fontSize: 12, fontWeight: '800' },
  recentScore: { color: C.sub, fontSize: 12, fontWeight: '700' },
  recentRank: { color: C.dim, fontSize: 11, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4, paddingHorizontal: 5 },
  recentDate: { color: C.dim, fontSize: 11 },

  // 그래프
  graphWrap: { flexDirection: 'row', height: 80, alignItems: 'flex-end', gap: 2, marginBottom: 6 },
  graphCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', position: 'relative' },
  graphDot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, zIndex: 2 },
  graphBar: { width: '70%', borderRadius: 2, minHeight: 2 },
  graphSum: { color: C.sub, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  graphEmpty: { height: 60, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  graphDummy: { position: 'absolute', left: 10, right: 10, height: 1, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', borderStyle: 'dashed' },
  graphEmptyText: { color: C.dim, fontSize: 12, fontWeight: '600', opacity: 0.5 },

  // 리더보드
  sideCard: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  sideCardMob: { backgroundColor: C.card, borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  lbTabs: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  lbTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', position: 'relative' },
  lbTabActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  lbTabText: { color: C.dim, fontSize: 12, fontWeight: '700' },
  lbTabTextAct: { color: C.mint },
  lbTabLine: { position: 'absolute', bottom: 0, left: '20%' as any, right: '20%' as any, height: 2, backgroundColor: C.mint, borderRadius: 1 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 6 },
  lbRowMe: { backgroundColor: 'rgba(78,205,196,0.1)', borderWidth: 1, borderColor: 'rgba(78,205,196,0.2)' },
  lbRank: { color: C.sub, fontSize: 13, fontWeight: '800', width: 22, textAlign: 'center' },
  lbName: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  lbNameMe: { color: C.mint, fontWeight: '800' },
  lbXp: { color: C.dim, fontSize: 12, fontWeight: '700' },
  lbToggle: { alignItems: 'center', paddingVertical: 10 },
  lbToggleText: { color: C.mint, fontSize: 12, fontWeight: '700' },
  emptyMini: { paddingVertical: 12, alignItems: 'center' },
  emptyMiniT: { color: C.dim, fontSize: 12 },

  // 업적
  achBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' },
  achFill: { height: '100%', backgroundColor: C.mint, borderRadius: 2 },
  achScroll: { gap: 8, paddingVertical: 4 },
  achSlot: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  achLocked: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.08)' },
  achIcon: { fontSize: 20 },
  achMore: { color: C.mint, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 6 },

  // 데스크톱 레이아웃
  desktopLayout: { flexDirection: 'row', gap: 20 },
  mainCol: { flex: 7 },
  sideCol: { flex: 3 },

  // 모달
  modalOvl: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalBox: { backgroundColor: '#1e321e', borderRadius: 16, padding: 24, width: 340, maxWidth: '90%' as any, borderWidth: 1, borderColor: C.border },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  modalInput: { backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', textAlign: 'center', marginBottom: 14 },

  // 칭호
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.border },
  titleRowSel: { borderColor: 'rgba(78,205,196,0.3)', backgroundColor: 'rgba(78,205,196,0.06)' },
});
