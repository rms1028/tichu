import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Modal, Pressable } from 'react-native';
import Animated, {
  FadeIn, ZoomIn, SlideInRight, SlideOutRight,
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import { useGameStore } from '../stores/gameStore';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';
import { RulesScreen } from './RulesScreen';

interface LobbyScreenProps {
  onJoin: (roomId: string, playerId: string, nickname: string, password?: string) => void;
  onTutorial?: () => void;
  onCreateCustomRoom?: (roomName: string, password: string | undefined, playerId: string, nickname: string) => void;
  onListRooms?: () => void;
  onGetLeaderboard?: () => void;
  onFriendInit?: (playerId: string, nickname: string) => void;
  onFriendSearch?: (code: string, myPlayerId: string) => void;
  onFriendRequest?: (fromId: string, fromNickname: string, toId: string) => void;
  onFriendAccept?: (fromId: string, myId: string) => void;
  onFriendReject?: (fromId: string, myId: string) => void;
  onFriendRemove?: (myId: string, friendId: string) => void;
  onFriendInvite?: (fromNickname: string, toId: string, roomId: string) => void;
  onBuyShopItem?: (itemId: string, category: 'avatar' | 'cardback', price: number) => void;
  onEquipShopItem?: (itemId: string, category: 'avatar' | 'cardback') => void;
  onChangeNickname?: (nickname: string) => void;
}

// 티어
const TIERS = [
  { name: '\uBE0C\uB860\uC988', icon: '\uD83E\uDD49', color: '#CD7F32', max: 1000 },
  { name: '\uC2E4\uBC84', icon: '\uD83E\uDD48', color: '#C0C0C0', max: 2000 },
  { name: '\uACE8\uB4DC', icon: '\uD83E\uDD47', color: '#FFD700', max: 3500 },
  { name: '\uB2E4\uC774\uC544', icon: '\uD83D\uDC8E', color: '#00BFFF', max: 5000 },
  { name: '\uB9C8\uC2A4\uD130', icon: '\uD83D\uDC9C', color: '#9333EA', max: 9999 },
];
const RP = 1250;
const tier = TIERS[1]!; // 실버
const rpPct = ((RP - 1000) / (2000 - 1000)) * 100;

// 출석 — streak에 따라 동적 생성
function buildAttendance(streak: number, claimedToday: boolean) {
  return [1, 2, 3, 4, 5, 6, 7].map(day => ({
    day,
    reward: day === 7 ? '💎 100' : '🪙 50',
    checked: day <= streak || (day === streak + 1 && claimedToday),
  }));
}

// 친구 (실제 데이터는 gameStore에서 가져옴)

import { useUserStore, getTier, TIERS as USER_TIERS, SHOP_AVATARS, getUnlockedTitles, ALL_TITLES, PROFILE_BGS, TIER_FRAME_COLORS } from '../stores/userStore';
import { useAchievementStore } from '../stores/achievementStore';
import { RankingScreen } from './RankingScreen';
import { ShopScreen } from './ShopScreen';
import { AchievementsScreen } from './AchievementsScreen';
import { TermsScreen } from './TermsScreen';

type Page = 'main' | 'profile' | 'rules' | 'ranking' | 'shop' | 'achievements' | 'settings' | 'terms';

function FloatingSymbol({ symbol, x, delay }: { symbol: string; x: number; delay: number }) {
  const ty = useSharedValue(0);
  useEffect(() => {
    ty.value = withRepeat(withTiming(-24, { duration: 5000 + delay * 400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  return <Animated.Text style={[{ position: 'absolute', left: `${x}%` as any, top: `${20 + delay * 7}%` as any, fontSize: 22, color: '#fff', opacity: 0.04 }, s]}>{symbol}</Animated.Text>;
}

export function LobbyScreen({ onJoin, onTutorial, onCreateCustomRoom, onListRooms, onGetLeaderboard, onFriendInit, onFriendSearch, onFriendRequest, onFriendAccept, onFriendReject, onFriendRemove, onFriendInvite, onBuyShopItem, onEquipShopItem, onChangeNickname }: LobbyScreenProps) {
  const savedNickname = useUserStore((s) => s.nickname);
  const savedPlayerId = useUserStore((s) => s.playerId);
  const userSetNickname = useUserStore((s) => s.setNickname);
  const [nick, setNick] = useState(savedNickname);
  const [friendMsg, setFriendMsg] = useState('');
  const [page, setPage] = useState<Page>('main');
  const [showFriends, setShowFriends] = useState(false);
  const [showRoom, setShowRoom] = useState(false);
  const [showNickEdit, setShowNickEdit] = useState(!savedNickname);
  const [showAttendance, setShowAttendance] = useState(() => useUserStore.getState().checkAttendance());
  const [searchCode, setSearchCode] = useState('');
  const [lbTab, setLbTab] = useState<'all' | 'friends' | 'weekly'>('all');
  const [showTitlePicker, setShowTitlePicker] = useState(false);

  // 친구 데이터 (gameStore)
  const friendCode = useGameStore((s) => s.friendCode);
  const friendList = useGameStore((s) => s.friendList);
  const friendRequests = useGameStore((s) => s.friendRequests);
  const friendSearchResult = useGameStore((s) => s.friendSearchResult);

  // 로비 진입 시 친구 초기화
  useEffect(() => {
    if (savedNickname && savedPlayerId && onFriendInit) {
      onFriendInit(savedPlayerId, savedNickname);
    }
  }, [savedNickname, savedPlayerId]);

  const onlineFriends = friendList.filter(f => f.online);
  const offlineFriends = friendList.filter(f => !f.online);
  const [roomCode, setRoomCode] = useState('');
  const [customTab, setCustomTab] = useState<'list' | 'create'>('list');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPw, setNewRoomPw] = useState('');
  const [joinPw, setJoinPw] = useState('');
  const [joinTarget, setJoinTarget] = useState<{ roomId: string; roomName: string } | null>(null);
  const customRoomList = useGameStore((s) => s.customRoomList);
  const [roomSearch, setRoomSearch] = useState('');
  const [matching, setMatching] = useState(false);
  const [matchSec, setMatchSec] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const soundOn = useUserStore((s) => s.soundOn);
  const musicOn = useUserStore((s) => s.musicOn);
  const ttsOn = useUserStore((s) => s.ttsOn);
  const notifyOn = useUserStore((s) => s.notifyOn);
  const friendNotify = useUserStore((s) => s.friendNotify);
  const gameNotify = useUserStore((s) => s.gameNotify);
  const setSetting = useUserStore((s) => s.setSetting);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const connected = useGameStore((s) => s.connected);
  const userCoins = useUserStore((s) => s.coins);
  const equippedAvatar = useUserStore((s) => s.equippedAvatar);
  const avatarEmoji = SHOP_AVATARS.find(a => a.id === equippedAvatar)?.emoji ?? '🐲';
  const name = nick.trim() || savedNickname || 'Guest';

  useEffect(() => {
    if (!matching) return;
    setMatchSec(0);
    timer.current = setInterval(() => setMatchSec(s => s + 1), 1000);
    const auto = setTimeout(() => {
      onJoin(`std_${Date.now().toString(36)}`, savedPlayerId, name);
    }, 3000);
    return () => { clearInterval(timer.current!); clearTimeout(auto); };
  }, [matching]);

  const joinRoom = () => { if (!roomCode.trim()) return; onJoin(roomCode.trim(), savedPlayerId, name); };
  const newRoom = () => { onJoin(`room_${Date.now().toString(36)}`, savedPlayerId, name); };

  // 로고 glow pulse
  const logoGlow = useSharedValue(0.3);
  useEffect(() => {
    logoGlow.value = withRepeat(withTiming(0.7, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const logoGlowStyle = useAnimatedStyle(() => ({
    textShadowRadius: 12 + logoGlow.value * 8,
    opacity: 0.85 + logoGlow.value * 0.15,
  }));
  // 파티클
  const particles = useRef([
    { s: '\u2660', x: 10, d: 0 }, { s: '\u2665', x: 28, d: 2 },
    { s: '\u2666', x: 52, d: 5 }, { s: '\u2663', x: 75, d: 1 },
    { s: '\u2660', x: 90, d: 4 }, { s: '\u2665', x: 40, d: 7 },
  ]).current;

  // ═══════════ 서브 페이지 ═══════════
  if (page === 'rules') return <RulesScreen onBack={() => setPage('main')} />;
  if (page === 'ranking') return <RankingScreen onBack={() => setPage('main')} onRefresh={onGetLeaderboard} />;
  if (page === 'shop') return <ShopScreen onBack={() => setPage('main')} onBuyItem={onBuyShopItem} onEquipItem={onEquipShopItem} />;
  if (page === 'achievements') return <AchievementsScreen onBack={() => setPage('profile')} />;
  if (page === 'terms') return <TermsScreen onBack={() => setPage('settings')} />;
  if (page === 'settings') {
    return (
      <SafeAreaView style={S.root}>
        <BackgroundWatermark />
        <ScrollView style={{ flex: 1, zIndex: 5 }} contentContainerStyle={{ padding: 20, maxWidth: 700, alignSelf: 'center' as const, width: '100%' }}>
          <TouchableOpacity onPress={() => setPage('main')} style={S.backBtn}><Text style={S.backText}>{'← 뒤로'}</Text></TouchableOpacity>
          <Text style={S.settingsTitle}>{'⚙️ 설정'}</Text>
          <View style={S.section}>
            <Text style={S.secTitle}>{'🔔 알림'}</Text>
            <View style={S.menuRow}><Text style={S.menuIcon}>{'🔔'}</Text><Text style={S.menuText}>{'전체 알림'}</Text><TouchableOpacity onPress={() => setSetting('notifyOn', !notifyOn)}><Text style={[S.toggle, notifyOn && S.toggleOn]}>{notifyOn ? 'ON' : 'OFF'}</Text></TouchableOpacity></View>
            <View style={S.menuRow}><Text style={S.menuIcon}>{'👥'}</Text><Text style={S.menuText}>{'친구 초대 알림'}</Text><TouchableOpacity onPress={() => setSetting('friendNotify', !friendNotify)}><Text style={[S.toggle, friendNotify && S.toggleOn]}>{friendNotify ? 'ON' : 'OFF'}</Text></TouchableOpacity></View>
            <View style={S.menuRow}><Text style={S.menuIcon}>{'🎮'}</Text><Text style={S.menuText}>{'게임 시작 알림'}</Text><TouchableOpacity onPress={() => setSetting('gameNotify', !gameNotify)}><Text style={[S.toggle, gameNotify && S.toggleOn]}>{gameNotify ? 'ON' : 'OFF'}</Text></TouchableOpacity></View>
          </View>
          <View style={S.section}>
            <Text style={S.secTitle}>{'🔊 소리'}</Text>
            <View style={S.menuRow}><Text style={S.menuIcon}>{'🔊'}</Text><Text style={S.menuText}>{'효과음'}</Text><TouchableOpacity onPress={() => setSetting('soundOn', !soundOn)}><Text style={[S.toggle, soundOn && S.toggleOn]}>{soundOn ? 'ON' : 'OFF'}</Text></TouchableOpacity></View>
            <View style={S.menuRow}><Text style={S.menuIcon}>{'🎵'}</Text><Text style={S.menuText}>{'배경음악'}</Text><TouchableOpacity onPress={() => setSetting('musicOn', !musicOn)}><Text style={[S.toggle, musicOn && S.toggleOn]}>{musicOn ? 'ON' : 'OFF'}</Text></TouchableOpacity></View>
            <View style={S.menuRow}><Text style={S.menuIcon}>{'🗣️'}</Text><Text style={S.menuText}>{'음성 안내 (TTS)'}</Text><TouchableOpacity onPress={() => setSetting('ttsOn', !ttsOn)}><Text style={[S.toggle, ttsOn && S.toggleOn]}>{ttsOn ? 'ON' : 'OFF'}</Text></TouchableOpacity></View>
          </View>
          <View style={S.section}>
            <Text style={S.secTitle}>{'📖 정보'}</Text>
            <TouchableOpacity style={S.menuRow} onPress={() => { if (onTutorial) onTutorial(); }}><Text style={S.menuIcon}>{'🎓'}</Text><Text style={S.menuText}>{'초보자 가이드'}</Text><Text style={S.menuArrow}>{'>'}</Text></TouchableOpacity>
            <TouchableOpacity style={S.menuRow} onPress={() => setPage('rules')}><Text style={S.menuIcon}>{'❓'}</Text><Text style={S.menuText}>{'도움말 / 게임 규칙'}</Text><Text style={S.menuArrow}>{'>'}</Text></TouchableOpacity>
            <TouchableOpacity style={S.menuRow} onPress={() => setPage('terms')}><Text style={S.menuIcon}>{'📋'}</Text><Text style={S.menuText}>{'이용약관'}</Text><Text style={S.menuArrow}>{'>'}</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (page === 'profile') {
    const us = useUserStore.getState();
    const hasData = us.totalGames > 0;
    const winRate = hasData ? Math.round(us.wins / us.totalGames * 100) : -1;
    const winRateColor = winRate < 0 ? 'rgba(255,255,255,0.3)' : winRate >= 60 ? '#5dcaa5' : winRate >= 50 ? '#10b981' : winRate >= 40 ? '#F59E0B' : '#ef4444';
    const myTier = getTier(us.xp);
    const myTierIdx = USER_TIERS.indexOf(myTier);
    const nextTierDef = myTierIdx < USER_TIERS.length - 1 ? USER_TIERS[myTierIdx + 1]! : myTier;
    const isMaxTier = myTier === nextTierDef;
    const xpInTier = us.xp - myTier.min;
    const xpRange = myTier.max - myTier.min + 1;
    const xpPctLocal = Math.min(100, Math.round((xpInTier / xpRange) * 100));
    const level = Math.max(1, Math.floor(us.xp / 100) + 1);
    const achievements = useAchievementStore.getState().achievements;
    const unlockedAchs = achievements.filter(a => a.unlocked);
    const lockedAchs = achievements.filter(a => !a.unlocked).slice(0, Math.max(0, 8 - unlockedAchs.length));
    const displayAchs = [...unlockedAchs, ...lockedAchs].slice(0, 8);
    const recentGames = us.recentGames ?? [];
    const unlockedTitles = getUnlockedTitles(us);
    const activeTitle = unlockedTitles.find(t => t.id === us.selectedTitle) ?? unlockedTitles[0] ?? null;
    const frame = TIER_FRAME_COLORS[myTier.key] ?? TIER_FRAME_COLORS['iron']!;
    const leaderboard = useGameStore.getState().leaderboard ?? [];
    const seasonInfo = useGameStore.getState().seasonInfo;
    const tichuTotal = us.tichuSuccess + us.tichuFail;
    const tichuRate = tichuTotal > 0 ? Math.round(us.tichuSuccess / tichuTotal * 100) : -1;

    // RP 그래프 데이터
    const graphData = recentGames.slice(0, 20).reverse();
    const graphMin = graphData.length > 0 ? Math.min(...graphData.map(g => g.rp)) - 20 : 0;
    const graphMax = graphData.length > 0 ? Math.max(...graphData.map(g => g.rp)) + 20 : 100;
    const graphRange = Math.max(1, graphMax - graphMin);
    const graphWins = graphData.filter(g => g.won).length;
    const graphLosses = graphData.length - graphWins;
    const graphWinRate = graphData.length > 0 ? Math.round(graphWins / graphData.length * 100) : 0;

    return (
      <SafeAreaView style={S.root}>
        <BackgroundWatermark />
        <ScrollView style={{ flex: 1, zIndex: 5 }} contentContainerStyle={P.scroll}>
          {/* 상단 네비게이션 */}
          <View style={P.nav}>
            <TouchableOpacity onPress={() => setPage('main')} style={P.navBtn} activeOpacity={0.7}>
              <Text style={P.navBtnText}>{'← 뒤로'}</Text>
            </TouchableOpacity>
            <Text style={P.navTitle}>{'프로필'}</Text>
            <TouchableOpacity onPress={() => setShowNickEdit(true)} style={P.navBtn} activeOpacity={0.7}>
              <Text style={P.navBtnText}>{'✏️ 편집'}</Text>
            </TouchableOpacity>
          </View>

          {/* ── 1. 프로필 헤더 카드 ── */}
          <View style={P.card}>
            <View style={P.headerCenter}>
              <View style={[P.avatarRing, { borderColor: frame.border, shadowColor: frame.shadow }]}>
                <View style={P.avatarInner}><Text style={P.avatarEmoji}>{avatarEmoji}</Text></View>
                <View style={[P.levelBadge, { backgroundColor: myTier.color }]}><Text style={P.levelText}>{level}</Text></View>
              </View>
              <Text style={P.nickname}>{name}</Text>
              {activeTitle && (
                <TouchableOpacity onPress={() => setShowTitlePicker(true)} activeOpacity={0.7}>
                  <Text style={P.titleText}>{activeTitle.icon} {activeTitle.name}</Text>
                </TouchableOpacity>
              )}
              {!activeTitle && unlockedTitles.length === 0 && (
                <TouchableOpacity onPress={() => setShowTitlePicker(true)} activeOpacity={0.7}>
                  <Text style={P.titleTextEmpty}>{'어떤 칭호를 얻을 수 있는지 확인해보세요 ›'}</Text>
                </TouchableOpacity>
              )}
              <View style={[P.tierChip, { borderColor: myTier.color, backgroundColor: `${myTier.color}18` }]}>
                <Text style={[P.tierChipText, { color: myTier.color }]}>{myTier.icon} {myTier.name}</Text>
              </View>
            </View>
          </View>

          {/* ── 2. 티어 & XP 카드 ── */}
          <View style={P.card}>
            <View style={P.cardTitleRow}>
              <Text style={P.cardTitle}>{'티어 & XP'}</Text>
              {!isMaxTier && <Text style={P.cardTitleRight}>{'다음: '}{nextTierDef.icon}{' '}{nextTierDef.name}</Text>}
            </View>
            <View style={P.xpBar}>
              <View style={[P.xpFill, { width: `${xpPctLocal}%`, backgroundColor: myTier.color }]} />
            </View>
            <View style={P.xpLabels}>
              <Text style={P.xpLabelLeft}>{myTier.icon} {myTier.name}</Text>
              <Text style={P.xpLabelCenter}>{us.xp} / {isMaxTier ? '∞' : myTier.max} RP</Text>
              <Text style={P.xpLabelRight}>{isMaxTier ? '' : `${nextTierDef.icon} ${nextTierDef.name}`}</Text>
            </View>
            {!isMaxTier && <Text style={P.xpRemaining}>{'다음 티어까지 '}{myTier.max - us.xp}{' RP'}</Text>}
          </View>

          {/* ── 3. 전적 통계 카드 (확장 2×3) ── */}
          <View style={P.card}>
            <View style={P.cardTitleRow}>
              <Text style={P.cardTitle}>{'전적 통계'}</Text>
              {seasonInfo && <Text style={P.cardTitleRight}>{seasonInfo.seasonName}</Text>}
            </View>
            <View style={P.statsGrid}>
              <View style={P.statBox}><Text style={P.statIcon}>{'🎮'}</Text><Text style={P.statNum}>{hasData ? us.totalGames : '—'}</Text><Text style={P.statLabel}>{'총 게임'}</Text></View>
              <View style={P.statBox}><Text style={P.statIcon}>{'📊'}</Text><Text style={[P.statNum, { color: winRateColor }]}>{winRate >= 0 ? `${winRate}%` : '—'}</Text><Text style={P.statLabel}>{'승률'}</Text></View>
              <View style={P.statBox}><Text style={P.statIcon}>{'🎯'}</Text><Text style={P.statNum}>{tichuRate >= 0 ? `${tichuRate}%` : '—'}</Text><Text style={P.statLabel}>{'티츄 성공률'}</Text></View>
              <View style={P.statBox}><Text style={P.statIcon}>{'🔥'}</Text><Text style={P.statNum}>{hasData ? us.winStreak : '—'}</Text><Text style={P.statLabel}>{'최고 연승'}</Text></View>
              <View style={P.statBox}><Text style={P.statIcon}>{'👑'}</Text><Text style={P.statNum}>{'—'}</Text><Text style={P.statLabel}>{'라지 티츄 성공률'}</Text></View>
              <View style={P.statBox}><Text style={P.statIcon}>{'🤝'}</Text><Text style={P.statNum}>{'—'}</Text><Text style={P.statLabel}>{'원투 성공'}</Text></View>
            </View>
          </View>

          {/* ── 4. RP 그래프 카드 ── */}
          <View style={P.card}>
            <Text style={P.cardTitle}>{'RP 변화'}</Text>
            {graphData.length < 2 ? (
              <View style={P.emptyState}>
                <Text style={P.emptyIcon}>{'📈'}</Text>
                <Text style={P.emptyText}>{'게임을 더 플레이하면 그래프가 표시됩니다'}</Text>
              </View>
            ) : (
              <>
                <View style={P.graphWrap}>
                  {graphData.map((g, i) => {
                    const pct = ((g.rp - graphMin) / graphRange) * 100;
                    return (
                      <View key={i} style={P.graphCol}>
                        <View style={[P.graphDot, { bottom: `${pct}%`, backgroundColor: g.won ? '#4CAF50' : '#F44336' }]} />
                        <View style={[P.graphBar, { height: `${pct}%`, backgroundColor: g.won ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.15)' }]} />
                      </View>
                    );
                  })}
                </View>
                <Text style={P.graphSummary}>
                  {'최근 '}{graphData.length}{'게임: '}{graphWins}{'승 '}{graphLosses}{'패 (승률 '}{graphWinRate}{'%)'}
                </Text>
              </>
            )}
          </View>

          {/* ── 5. 리더보드 카드 ── */}
          <View style={P.card}>
            <Text style={P.cardTitle}>{'리더보드'}</Text>
            <View style={P.lbTabs}>
              {(['all', 'friends', 'weekly'] as const).map(t => (
                <TouchableOpacity key={t} style={[P.lbTab, lbTab === t && P.lbTabActive]} onPress={() => setLbTab(t)}>
                  <Text style={[P.lbTabText, lbTab === t && P.lbTabTextActive]}>
                    {t === 'all' ? '전체' : t === 'friends' ? '친구' : '주간'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {lbTab === 'all' && leaderboard.length > 0 ? (
              <View style={P.lbList}>
                {leaderboard.slice(0, 10).map((entry, i) => {
                  const isMe = entry.id === useGameStore.getState().dbUserId;
                  const entryTier = getTier(entry.xp);
                  return (
                    <View key={i} style={[P.lbRow, isMe && P.lbRowMe]}>
                      <Text style={P.lbRank}>{i + 1}</Text>
                      <Text style={P.lbTierIcon}>{entryTier.icon}</Text>
                      <Text style={[P.lbName, isMe && P.lbNameMe]} numberOfLines={1}>{entry.nickname}</Text>
                      <Text style={P.lbXp}>{entry.xp} RP</Text>
                    </View>
                  );
                })}
              </View>
            ) : lbTab !== 'all' ? (
              <View>
                <View style={{ opacity: 0.15 }}>
                  {[1, 2, 3].map(i => (
                    <View key={i} style={P.lbRow}>
                      <Text style={P.lbRank}>{i}</Text>
                      <Text style={P.lbTierIcon}>{'🔩'}</Text>
                      <View style={{ flex: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, marginRight: 8 }} />
                      <Text style={P.lbXp}>{'— RP'}</Text>
                    </View>
                  ))}
                </View>
                <Text style={P.emptyTextOverlay}>{lbTab === 'friends' ? '친구와 함께 플레이하면 랭킹이 표시됩니다' : '주간 랭킹은 곧 제공될 예정입니다'}</Text>
              </View>
            ) : (
              <View style={P.emptyState}><Text style={P.emptyText}>{'첫 게임을 완료하면 랭킹에 등록됩니다'}</Text></View>
            )}
          </View>

          {/* ── 6. 최근 전적 카드 ── */}
          <View style={P.card}>
            <Text style={P.cardTitle}>{'최근 전적'}</Text>
            {recentGames.length === 0 ? (
              <View style={P.emptyState}>
                <Text style={P.emptyIcon}>{'🃏'}</Text>
                <Text style={P.emptyText}>{'아직 전적이 없습니다'}</Text>
                <TouchableOpacity style={P.ctaBtn} onPress={() => setPage('main')} activeOpacity={0.8}>
                  <Text style={P.ctaBtnText}>{'첫 게임 시작하기'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={P.recentList}>
                {recentGames.slice(0, 10).map((g, i) => (
                  <View key={i} style={P.recentRow}>
                    <View style={[P.recentBadge, { backgroundColor: g.won ? 'rgba(93,202,165,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                      <Text style={[P.recentBadgeText, { color: g.won ? '#5dcaa5' : '#ef4444' }]}>{g.won ? '승' : '패'}</Text>
                    </View>
                    {g.rp > 0 && <Text style={P.recentRp}>{g.rp} RP</Text>}
                    <View style={{ flex: 1 }} />
                    <Text style={P.recentDate}>{g.date}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── 7. 파트너 케미 카드 ── */}
          <View style={P.card}>
            <Text style={P.cardTitle}>{'파트너 케미'}</Text>
            <View style={P.emptyState}>
              <Text style={P.emptyIcon}>{'🤝'}</Text>
              <Text style={P.emptyText}>{'데이터 수집 중 — 더 많은 게임을 플레이해주세요'}</Text>
            </View>
          </View>

          {/* ── 8. 업적 카드 ── */}
          <View style={P.card}>
            <View style={P.cardTitleRow}>
              <Text style={P.cardTitle}>{'업적'}</Text>
              <Text style={P.cardTitleRight}>{unlockedAchs.length}{' / '}{achievements.length}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={P.achScroll} contentContainerStyle={P.achRow}>
              {achievements.map((a, i) => (
                <View key={i} style={[P.achSlot, !a.unlocked && P.achLocked]}>
                  <Text style={[P.achIcon, !a.unlocked && P.achIconLocked]}>{a.icon}</Text>
                  <Text style={[P.achName, !a.unlocked && P.achNameLocked]} numberOfLines={1}>{a.name}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={P.achFooter}>
              <Text style={P.achHint}>{'게임을 플레이하여 잠금 해제'}</Text>
              <TouchableOpacity onPress={() => setPage('achievements')}><Text style={P.achMore}>{'더보기 ›'}</Text></TouchableOpacity>
            </View>
          </View>

          {/* ── 9. 시즌 보상 카드 ── */}
          <View style={P.card}>
            <Text style={P.cardTitle}>{'시즌 보상'}</Text>
            {seasonInfo ? (
              <View>
                <View style={P.seasonRow}>
                  <Text style={P.seasonLabel}>{seasonInfo.seasonName}</Text>
                  <Text style={P.seasonDays}>{'남은 기간: '}{seasonInfo.remainingDays}{'일'}</Text>
                </View>
                <View style={P.seasonRow}>
                  <Text style={P.seasonLabel}>{'현재 레이팅'}</Text>
                  <Text style={P.seasonValue}>{seasonInfo.myRating} RP</Text>
                </View>
                <View style={P.seasonRow}>
                  <Text style={P.seasonLabel}>{'시즌 순위'}</Text>
                  <Text style={P.seasonValue}>{'#'}{seasonInfo.myRank}</Text>
                </View>
                <View style={P.seasonRewards}>
                  {USER_TIERS.slice(0, 5).map((t, i) => (
                    <View key={i} style={[P.seasonRewardSlot, myTierIdx >= i && P.seasonRewardUnlocked]}>
                      <Text style={{ fontSize: 18 }}>{t.icon}</Text>
                      <Text style={P.seasonRewardName}>{t.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={P.emptyState}>
                <Text style={P.emptyIcon}>{'🏅'}</Text>
                <Text style={P.emptyText}>{'시즌 진행 중 — 시즌 종료 시 달성 티어에 따라 보상이 지급됩니다'}</Text>
              </View>
            )}
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>

        {/* 닉네임 편집 모달 */}
        <Modal visible={showNickEdit} transparent animationType="fade">
          <View style={S.mOvl}><View style={S.mBox}>
            <Text style={S.mTitle}>{'✏️ 닉네임 변경'}</Text>
            <TextInput style={S.mInput} value={nick} onChangeText={setNick} placeholder={'닉네임 입력'} placeholderTextColor="rgba(255,255,255,0.3)" maxLength={12} />
            <TouchableOpacity style={[S.mOk, !nick.trim() && { opacity: 0.4 }]} onPress={() => { if (nick.trim()) { userSetNickname(nick.trim()); onChangeNickname?.(nick.trim()); setShowNickEdit(false); } }} disabled={!nick.trim()}><Text style={S.mOkT}>{'확인'}</Text></TouchableOpacity>
          </View></View>
        </Modal>

        {/* 칭호 선택 모달 */}
        <Modal visible={showTitlePicker} transparent animationType="fade">
          <View style={S.mOvl}><View style={[S.mBox, { maxWidth: 360 }]}>
            <Text style={S.mTitle}>{'🏅 칭호 선택'}</Text>
            <View style={{ gap: 6 }}>
              {ALL_TITLES.map(t => {
                const isUnlocked = unlockedTitles.some(u => u.id === t.id);
                const isSelected = us.selectedTitle === t.id;
                return (
                  <TouchableOpacity key={t.id} style={[P.titleOption, isSelected && P.titleOptionActive, !isUnlocked && P.titleOptionLocked]}
                    onPress={() => { if (isUnlocked) { useUserStore.getState().setTitle(t.id); setShowTitlePicker(false); } }}
                    disabled={!isUnlocked} activeOpacity={isUnlocked ? 0.7 : 1}>
                    <Text style={{ fontSize: 18, opacity: isUnlocked ? 1 : 0.3 }}>{t.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[P.titleOptionName, !isUnlocked && { color: 'rgba(255,255,255,0.3)' }]}>{t.name}</Text>
                      <Text style={P.titleOptionDesc}>{t.desc}</Text>
                    </View>
                    {isSelected && <Text style={{ color: '#5dcaa5' }}>{'✓'}</Text>}
                    {!isUnlocked && <Text style={{ fontSize: 14 }}>{'🔒'}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={[S.mOk, { marginTop: 12 }]} onPress={() => setShowTitlePicker(false)}><Text style={S.mOkT}>{'닫기'}</Text></TouchableOpacity>
          </View></View>
        </Modal>
      </SafeAreaView>
    );
  }
  // ═══════════ 메인 화면 ═══════════
  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      {/* 파티클 */}
      <View style={S.particleLayer} pointerEvents="none">
        {particles.map((p, i) => <FloatingSymbol key={i} symbol={p.s} x={p.x} delay={p.d} />)}
      </View>
      {/* 상단 바 */}
      <Animated.View entering={FadeIn.delay(0).duration(500)} style={S.topBar}>
        <TouchableOpacity style={S.profileBtn} activeOpacity={0.8} onPress={() => setPage('profile')}>
          <View style={[S.av, { borderColor: tier.color }]}><Text style={{ fontSize: 18 }}>{avatarEmoji}</Text></View>
          <Text style={S.nick}>{name}</Text>
          <Text style={S.tierIcon}>{tier.icon}</Text>
        </TouchableOpacity>
        <View style={S.topRight}>
          <View style={S.coinBadge}><Text style={{ fontSize: 16 }}>{'🪙'}</Text><Text style={S.coinText}>{userCoins}</Text></View>
          <TouchableOpacity style={S.topIconBtn} onPress={() => setPage('shop')}><Text style={S.topIconText}>{'🛒'}</Text></TouchableOpacity>
          <TouchableOpacity style={S.topIconBtn} onPress={() => setShowFriends(true)}>
            <Text style={S.topIconText}>{'\uD83D\uDC65'}</Text>
            {(onlineFriends.length > 0 || friendRequests.length > 0) && <View style={S.badge}><Text style={S.badgeText}>{onlineFriends.length + friendRequests.length}</Text></View>}
          </TouchableOpacity>
        </View>
      </Animated.View>
      {/* 중앙 */}
      <View style={S.center}>
        <Animated.View entering={FadeIn.delay(200).duration(500)} style={S.logoArea}>
          <Animated.Text style={[S.title, logoGlowStyle]}>TICHU</Animated.Text>
          <Text style={S.subtitle}>Ultimate Card Battle</Text>
          <View style={S.divider} />
        </Animated.View>
        {!matching ? (
          <Animated.View entering={FadeIn.delay(400).duration(500)} style={S.cardsWrap}>
            <View style={S.cards}>
              <TouchableOpacity style={[S.card, S.cardG, !connected && { opacity: 0.4 }]} activeOpacity={0.85} onPress={() => setMatching(true)} disabled={!connected}>
                <View style={S.cardGlow} />
                <Text style={S.cIcon}>{'\u26A1'}</Text>
                <Text style={S.cTitle}>{'\uBE60\uB978 \uB9E4\uCE6D'}</Text>
                <Text style={S.cSub}>{'\uBE44\uC2B7\uD55C \uC2E4\uB825\uC758 \uC720\uC800\uC640'}{'\n'}{'\uC989\uC2DC \uD50C\uB808\uC774'}</Text>
                <View style={S.playBtn}><Text style={S.playBtnText}>{'\u25B6  \uD50C\uB808\uC774'}</Text></View>
              </TouchableOpacity>
              <TouchableOpacity style={[S.card, S.cardD]} activeOpacity={0.85} onPress={() => { setShowRoom(true); setCustomTab('list'); onListRooms?.(); }}>
                <Text style={S.cIcon}>{'\uD83D\uDD12'}</Text>
                <Text style={S.cTitle}>{'\uCEE4\uC2A4\uD140 \uBAA8\uB4DC'}</Text>
                <Text style={S.cSub}>{'\uBC29 \uB9CC\uB4E4\uAE30 \uBC0F'}{'\n'}{'\uCF54\uB4DC\uB85C \uC785\uC7A5'}</Text>
                <View style={S.playBtnOutline}><Text style={S.playBtnOutlineText}>{'\u25B6  \uD50C\uB808\uC774'}</Text></View>
              </TouchableOpacity>
            </View>
            <Animated.View entering={FadeIn.delay(600).duration(500)}>
              <TouchableOpacity style={S.rulesBtn} activeOpacity={0.8} onPress={() => setPage('rules')}>
                <View style={S.rulesBtnInner}>
                  <Text style={S.rulesBtnIcon}>{'\uD83D\uDCD6'}</Text>
                  <View style={S.rulesBtnTextWrap}>
                    <Text style={S.rulesBtnTitle}>{'\uAC8C\uC784 \uADDC\uCE59'}</Text>
                    <Text style={S.rulesBtnDesc}>{'\uD2F0\uCE04\uAC00 \uCC98\uC74C\uC774\uB77C\uBA74 \uC5EC\uAE30\uC11C \uBC30\uC6CC\uBCF4\uC138\uC694!'}</Text>
                  </View>
                  <Text style={S.rulesBtnArrow}>{'>'}</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View entering={ZoomIn.duration(300).springify()} style={S.matchBox}>
            <Text style={{ fontSize: 36 }}>{'\uD83D\uDD0D'}</Text>
            <Text style={S.matchTitle}>{'\uB9E4\uCE6D \uC911...'}</Text>
            <Text style={S.matchTimer}>{matchSec}{'\uCD08'}</Text>
            <TouchableOpacity style={S.matchCancel} onPress={() => setMatching(false)}><Text style={S.matchCancelT}>{'\uB9E4\uCE6D \uCDE8\uC18C'}</Text></TouchableOpacity>
          </Animated.View>
        )}
      </View>
      {/* 하단 탭 */}
      <Animated.View entering={FadeIn.delay(800).duration(500)} style={S.nav}>
        {[{ i: '\uD83C\uDFE0', l: '\uD648', idx: 0 }, { i: '\uD83C\uDFC6', l: '\uB7AD\uD0B9', idx: 1 }, { i: '\u2699\uFE0F', l: '\uC124\uC815', idx: 2 }].map(t => (
          <TouchableOpacity key={t.idx} style={S.navTab} onPress={() => { setActiveTab(t.idx); if (t.idx === 1) setPage('ranking'); else if (t.idx === 2) setPage('settings'); }}>
            {activeTab === t.idx && <View style={S.navDot} />}
            <Text style={[S.navI, activeTab === t.idx ? S.navOn : S.navOff]}>{t.i}</Text>
            <Text style={[S.navL, activeTab === t.idx && S.navLOn]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
      {/* ═══ 친구 사이드 패널 ═══ */}
      {showFriends && (
        <Pressable style={S.overlay} onPress={() => setShowFriends(false)}>
          <Animated.View entering={SlideInRight.duration(300)} style={S.fp}>
            <Pressable style={{ flex: 1 }} onPress={e => e.stopPropagation()}>
              <View style={S.fpHead}><Text style={S.fpTitle}>{'친구 목록'}</Text><TouchableOpacity onPress={() => setShowFriends(false)}><Text style={S.fpX}>{'\u2715'}</Text></TouchableOpacity></View>
              {/* 내 친구 코드 */}
              {friendCode ? (
                <View style={{ alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>내 친구 코드</Text>
                  <Text style={{ color: '#F59E0B', fontSize: 18, fontWeight: '900', letterSpacing: 3 }}>{friendCode}</Text>
                </View>
              ) : null}
              {/* 친구 코드로 검색 */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, paddingHorizontal: 4 }}>
                <TextInput
                  style={[S.mInput, { flex: 1, paddingVertical: 6, fontSize: 13 }]}
                  value={searchCode}
                  onChangeText={setSearchCode}
                  placeholder={'친구 코드 입력'}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  maxLength={6}
                />
                <TouchableOpacity
                  style={[S.fpAddBtn, { marginBottom: 0, paddingHorizontal: 12, paddingVertical: 6 }]}
                  onPress={() => { if (searchCode.trim() && onFriendSearch) onFriendSearch(searchCode.trim(), savedPlayerId); }}
                >
                  <Text style={S.fpAddText}>{'검색'}</Text>
                </TouchableOpacity>
              </View>
              {/* 검색 결과 */}
              {friendSearchResult && friendSearchResult.found && (
                <View style={[S.fpRow, { backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 8, marginBottom: 6 }]}>
                  <View style={{ flex: 1 }}><Text style={S.fpN}>{friendSearchResult.nickname}</Text></View>
                  <TouchableOpacity style={S.fpInv} onPress={() => {
                    if (onFriendRequest && friendSearchResult.playerId) {
                      onFriendRequest(savedPlayerId, name, friendSearchResult.playerId);
                      setFriendMsg('친구 요청을 보냈습니다!');
                      setTimeout(() => setFriendMsg(''), 2000);
                    }
                  }}><Text style={S.fpInvT}>{'추가'}</Text></TouchableOpacity>
                </View>
              )}
              {friendSearchResult && !friendSearchResult.found && (
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', marginBottom: 6 }}>{'플레이어를 찾을 수 없습니다'}</Text>
              )}
              {friendMsg ? <Text style={{ color: '#F59E0B', fontSize: 11, textAlign: 'center', marginBottom: 6 }}>{friendMsg}</Text> : null}
              {/* 친구 요청 */}
              {friendRequests.length > 0 && (
                <>
                  <Text style={S.fpSec}>{'📩 친구 요청 (' + friendRequests.length + ')'}</Text>
                  {friendRequests.map((r, i) => (
                    <View key={i} style={S.fpRow}>
                      <View style={{ flex: 1 }}><Text style={S.fpN}>{r.fromNickname}</Text></View>
                      <TouchableOpacity style={[S.fpInv, { backgroundColor: 'rgba(16,185,129,0.15)', borderColor: '#10b981' }]} onPress={() => onFriendAccept?.(r.fromId, savedPlayerId)}>
                        <Text style={[S.fpInvT, { color: '#10b981' }]}>{'수락'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[S.fpInv, { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: '#ef4444', marginLeft: 4 }]} onPress={() => onFriendReject?.(r.fromId, savedPlayerId)}>
                        <Text style={[S.fpInvT, { color: '#ef4444' }]}>{'거절'}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 온라인 친구 */}
                <Text style={S.fpSec}>{'온라인 (' + onlineFriends.length + ')'}</Text>
                {onlineFriends.length === 0 && <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', paddingVertical: 8 }}>{'온라인 친구가 없습니다'}</Text>}
                {onlineFriends.map((f, i) => (
                  <View key={i} style={S.fpRow}>
                    <View style={S.fpAW}><Text style={S.fpAv}>{'🐲'}</Text><View style={S.fpDotOn} /></View>
                    <View style={{ flex: 1 }}><Text style={S.fpN}>{f.nickname}</Text><Text style={S.fpSt}>{f.status === 'lobby' ? '로비' : f.status === 'matching' ? '매칭 중' : '게임 중'}</Text></View>
                    {f.status === 'lobby' && (
                      <TouchableOpacity style={S.fpInv} onPress={() => { setFriendMsg(`${f.nickname}님에게 초대를 보냈습니다!`); setTimeout(() => setFriendMsg(''), 2000); }}>
                        <Text style={S.fpInvT}>{'초대'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {/* 오프라인 친구 */}
                <Text style={[S.fpSec, { marginTop: 10 }]}>{'오프라인 (' + offlineFriends.length + ')'}</Text>
                {offlineFriends.map((f, i) => (
                  <View key={i} style={[S.fpRow, { opacity: 0.5 }]}>
                    <View style={S.fpAW}><Text style={S.fpAv}>{'🐲'}</Text><View style={S.fpDotOff} /></View>
                    <View style={{ flex: 1 }}><Text style={S.fpN}>{f.nickname}</Text></View>
                  </View>
                ))}
              </ScrollView>
            </Pressable>
          </Animated.View>
        </Pressable>
      )}
      {/* ═══ 출석 체크 팝업 ═══ */}
      <Modal visible={showAttendance} transparent animationType="fade">
        <View style={S.attOverlay}>
          <Animated.View entering={ZoomIn.duration(350).springify()} style={S.attModal}>
            <Text style={S.attTitle}>{'🎁 오늘의 출석 보상!'}</Text>
            <View style={S.attGrid}>
              {buildAttendance(useUserStore.getState().attendanceStreak, false).map((a, i) => (
                <View key={i} style={[S.attCell, a.day === useUserStore.getState().attendanceStreak + 1 && S.attCellToday]}>
                  <Text style={S.attDayN}>{a.day}{'일'}</Text>
                  <Text style={{ fontSize: 18 }}>{a.checked ? '✅' : a.day === useUserStore.getState().attendanceStreak + 1 ? '🎁' : '🔒'}</Text>
                  <Text style={S.attReward}>{a.reward}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={S.attBtn} onPress={() => { useUserStore.getState().claimAttendance(); setShowAttendance(false); }}>
              <Text style={S.attBtnT}>{'보상 받기'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
      {/* 닉네임 편집 모달 */}
      <Modal visible={showNickEdit} transparent animationType="fade">
        <View style={S.mOvl}><View style={S.mBox}>
          <Text style={S.mTitle}>{'✏️ 닉네임 변경'}</Text>
          <TextInput style={S.mInput} value={nick} onChangeText={setNick} placeholder={'닉네임 입력'} placeholderTextColor="rgba(255,255,255,0.3)" maxLength={12} />
          <TouchableOpacity style={[S.mOk, !nick.trim() && { opacity: 0.4 }]} onPress={() => { if (nick.trim()) { userSetNickname(nick.trim()); onChangeNickname?.(nick.trim()); setShowNickEdit(false); } }} disabled={!nick.trim()}><Text style={S.mOkT}>{'확인'}</Text></TouchableOpacity>
        </View></View>
      </Modal>
      {/* 커스텀 방 모달 */}
      <Modal visible={showRoom} transparent animationType="fade">
        <View style={S.mOvl}><View style={[S.mBox, { maxWidth: 460, minHeight: 480, maxHeight: '85%' as any }]}>
          <Text style={S.mTitle}>{'🎮 커스텀 매치'}</Text>
          {/* 탭 */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <TouchableOpacity
              style={[S.mTab, customTab === 'list' && S.mTabActive]}
              onPress={() => { setCustomTab('list'); onListRooms?.(); }}
            >
              <Text style={[S.mTabText, customTab === 'list' && S.mTabTextActive]}>방 목록</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.mTab, customTab === 'create' && S.mTabActive]}
              onPress={() => setCustomTab('create')}
            >
              <Text style={[S.mTabText, customTab === 'create' && S.mTabTextActive]}>방 만들기</Text>
            </TouchableOpacity>
          </View>
          {customTab === 'list' ? (
            <View style={{ flex: 1, minHeight: 360 }}>
              {/* 검색 + 새로고침 */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                <TextInput
                  style={[S.mInput, { flex: 1, paddingVertical: 7, fontSize: 13 }]}
                  value={roomSearch}
                  onChangeText={setRoomSearch}
                  placeholder={'방 이름 검색...'}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />
                <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, justifyContent: 'center' }} onPress={() => onListRooms?.()}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{'🔄'}</Text>
                </TouchableOpacity>
              </View>
              {(() => {
                const filtered = customRoomList.filter(r => !roomSearch.trim() || r.roomName.toLowerCase().includes(roomSearch.trim().toLowerCase()));
                return filtered.length === 0 ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>{customRoomList.length === 0 ? '대기 중인 방이 없습니다' : '검색 결과가 없습니다'}</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 320 }}>
                    {filtered.map(r => (
                      <TouchableOpacity
                        key={r.roomId}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}
                        onPress={() => {
                          if (r.hasPassword) { setJoinTarget(r); setJoinPw(''); }
                          else { onJoin(r.roomId, savedPlayerId, name); setShowRoom(false); }
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 }} numberOfLines={1}>{r.roomName}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginRight: 8 }}>{r.playerCount}/4</Text>
                        {r.hasPassword && <Text style={{ fontSize: 14 }}>{'🔒'}</Text>}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                );
              })()}
              {/* 비밀번호 입력 */}
              {joinTarget && (
                <View style={{ marginTop: 12, gap: 8 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>🔒 {joinTarget.roomName} — 비밀번호 입력</Text>
                  <TextInput style={S.mInput} value={joinPw} onChangeText={setJoinPw} placeholder={'비밀번호'} placeholderTextColor="rgba(255,255,255,0.3)" secureTextEntry />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={S.mSec} onPress={() => setJoinTarget(null)}><Text style={S.mSecT}>취소</Text></TouchableOpacity>
                    <TouchableOpacity style={[S.mOk, !joinPw && { opacity: 0.4 }]} onPress={() => { onJoin(joinTarget.roomId, savedPlayerId, name, joinPw); setShowRoom(false); setJoinTarget(null); }} disabled={!joinPw}><Text style={S.mOkT}>입장</Text></TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <TextInput style={S.mInput} value={newRoomName} onChangeText={setNewRoomName} placeholder={'방 이름 (예: 같이 한판!)'} placeholderTextColor="rgba(255,255,255,0.3)" />
              <TextInput style={S.mInput} value={newRoomPw} onChangeText={setNewRoomPw} placeholder={'비밀번호 (선택사항)'} placeholderTextColor="rgba(255,255,255,0.3)" secureTextEntry />
              <TouchableOpacity
                style={[S.mOk, !newRoomName.trim() && { opacity: 0.4 }]}
                disabled={!newRoomName.trim()}
                onPress={() => {
                  onCreateCustomRoom?.(newRoomName.trim(), newRoomPw || undefined, savedPlayerId, name);
                  setShowRoom(false);
                  setNewRoomName('');
                  setNewRoomPw('');
                }}
              >
                <Text style={S.mOkT}>방 만들기</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity style={{ alignItems: 'center', marginTop: 14 }} onPress={() => { setShowRoom(false); setJoinTarget(null); }}>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>닫기</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, overflow: 'hidden' },
  particleLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },

  // 상단 바
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, zIndex: 10 },
  profileBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  av: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  nick: { color: '#fff', fontSize: 14, fontWeight: '700' },
  tierIcon: { fontSize: 14 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coinBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  coinText: { color: '#F59E0B', fontSize: 14, fontWeight: '800' },
  topIconBtn: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topIconText: { fontSize: 20 },
  badge: { position: 'absolute', top: -3, right: -3, backgroundColor: '#ef4444', borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: COLORS.bg },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },

  // 중앙
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 5, paddingHorizontal: 20 },
  logoArea: { alignItems: 'center', marginBottom: 16 },
  title: { color: '#FFD700', fontSize: 48, fontWeight: '900', letterSpacing: 10, textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12, marginBottom: 2 },
  subtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '600', letterSpacing: 4, marginBottom: 8 },
  divider: { width: 50, height: 2, backgroundColor: 'rgba(255,215,0,0.3)', borderRadius: 1 },

  // 카드 (1.5배 높이)
  cardsWrap: { alignItems: 'stretch' },
  cards: { flexDirection: 'row', gap: 16 },
  card: { width: 160, height: 240, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 28, elevation: 16, overflow: 'hidden' },
  cardG: { backgroundColor: '#0d6b3f' },
  cardD: { backgroundColor: '#14332a' },
  cardGlow: { position: 'absolute', top: -20, left: -20, right: -20, bottom: -20, borderRadius: 30, backgroundColor: 'rgba(245,158,11,0.04)', shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 30, elevation: 2 },
  cIcon: { fontSize: 42, marginBottom: 10 },
  cTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 6 },
  cSub: { color: 'rgba(255,255,255,0.45)', fontSize: 11, textAlign: 'center', lineHeight: 16, marginBottom: 12 },
  playBtn: { backgroundColor: '#D97706', borderRadius: 12, paddingHorizontal: 22, paddingVertical: 9, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6 },
  playBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  playBtnOutline: { borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.5)', borderRadius: 12, paddingHorizontal: 22, paddingVertical: 8 },
  playBtnOutlineText: { color: '#10b981', fontSize: 14, fontWeight: '700' },

  rulesBtn: {
    marginTop: 12, alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    paddingVertical: 14, paddingHorizontal: 20,
  },
  rulesBtnInner: { flexDirection: 'row', alignItems: 'center' },
  rulesBtnIcon: { fontSize: 24, marginRight: 12 },
  rulesBtnTextWrap: { flex: 1 },
  rulesBtnTitle: { color: '#F59E0B', fontSize: 14, fontWeight: '700' },
  rulesBtnDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 1 },
  rulesBtnArrow: { color: 'rgba(255,255,255,0.3)', fontSize: 16, fontWeight: '600' },

  // 매칭
  matchBox: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 24, paddingHorizontal: 40, paddingVertical: 24, gap: 6 },
  matchTitle: { color: '#F59E0B', fontSize: 20, fontWeight: '900' },
  matchTimer: { color: '#fff', fontSize: 28, fontWeight: '900' },
  matchCancel: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 7, marginTop: 4, backgroundColor: 'rgba(239,68,68,0.1)' },
  matchCancelT: { color: '#f87171', fontSize: 13, fontWeight: '700' },

  // 하단 탭
  nav: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', zIndex: 10 },
  navTab: { alignItems: 'center', paddingHorizontal: 16 },
  navDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#F59E0B', marginBottom: 2 },
  navI: { fontSize: 26 },
  navOn: { opacity: 1 },
  navOff: { opacity: 0.4 },
  navL: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginTop: 2 },
  navLOn: { color: '#F59E0B' },

  // 오버레이+친구패널
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 30, flexDirection: 'row', justifyContent: 'flex-end' },
  fp: { width: 280, height: '100%', backgroundColor: 'rgba(10,25,15,0.95)', paddingHorizontal: 16, paddingVertical: 14 },
  fpHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  fpTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  fpX: { color: 'rgba(255,255,255,0.5)', fontSize: 18 },
  fpAddBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingVertical: 7, alignItems: 'center', marginBottom: 10 },
  fpAddText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' },
  fpSec: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  fpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  fpAW: { position: 'relative' },
  fpAv: { fontSize: 20 },
  fpDotOn: { position: 'absolute', bottom: -1, right: -2, width: 7, height: 7, borderRadius: 4, backgroundColor: '#2ecc71', borderWidth: 1.5, borderColor: COLORS.bg },
  fpDotOff: { position: 'absolute', bottom: -1, right: -2, width: 7, height: 7, borderRadius: 4, backgroundColor: '#555', borderWidth: 1.5, borderColor: COLORS.bg },
  fpN: { color: '#fff', fontSize: 13, fontWeight: '600' },
  fpSt: { color: 'rgba(255,255,255,0.35)', fontSize: 9 },
  fpInv: { backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  fpInvT: { color: '#60a5fa', fontSize: 10, fontWeight: '700' },

  // 출석 모달
  attOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  attModal: { backgroundColor: COLORS.bgDark, borderRadius: 22, padding: 24, width: '100%', maxWidth: 380, alignItems: 'center' },
  attTitle: { color: '#FFD700', fontSize: 20, fontWeight: '900', marginBottom: 16, textShadowColor: 'rgba(255,215,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  attGrid: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  attCell: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 6, minWidth: 42, gap: 3 },
  attCellToday: { borderWidth: 2, borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)' },
  attDayN: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700' },
  attReward: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: '600' },
  attBtn: { backgroundColor: '#D97706', borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6 },
  attBtnT: { color: '#fff', fontSize: 16, fontWeight: '900' },

  // 프로필 페이지
  backBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  settingsTitle: { color: '#FFD700', fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 16 },
  backText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '700' },
  pHeader: { alignItems: 'center', marginBottom: 20 },
  pAvatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  pName: { color: '#fff', fontSize: 22, fontWeight: '900' },
  pTier: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  pJoined: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 4 },
  section: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 14, padding: 14, marginBottom: 12 },
  secTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '800', marginBottom: 10 },
  rpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rpBg: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  rpFill: { height: '100%', borderRadius: 3 },
  rpText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', minWidth: 90, textAlign: 'right' },
  rpNext: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 6 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  statNum: { color: '#fff', fontSize: 22, fontWeight: '900' },
  statLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600', marginTop: 2 },
  attRow: { flexDirection: 'row', gap: 4 },
  attDay: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 6, flex: 1 },
  attToday: { borderWidth: 1.5, borderColor: '#F59E0B' },
  attDayNum: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700' },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  menuIcon: { fontSize: 16, width: 28 },
  menuText: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  menuArrow: { color: 'rgba(255,255,255,0.2)', fontSize: 14 },
  toggle: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)' },
  toggleOn: { color: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.1)' },

  // 모달 공통
  mOvl: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  mBox: { backgroundColor: COLORS.bgDark, borderRadius: 20, padding: 24, width: 300, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 20 },
  mTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  mInput: { backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', textAlign: 'center', marginBottom: 16 },
  mBtns: { flexDirection: 'row', gap: 10 },
  mSec: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  mSecT: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 13 },
  mOk: { flex: 1, backgroundColor: '#D97706', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  mOkT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  mTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  mTabActive: { backgroundColor: 'rgba(217,119,6,0.15)', borderColor: 'rgba(217,119,6,0.4)' },
  mTabText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '700' },
  mTabTextActive: { color: '#F59E0B' },
});
// ── 프로필 스타일 ──────────────────────────────────────────
const P = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 30, maxWidth: 500, alignSelf: 'center', width: '100%' },

  // 네비게이션
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  navBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  navBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '700' },
  navTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },

  // 카드 공통
  card: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  cardTitleRight: { color: '#e8a42a', fontSize: 12, fontWeight: '700' },

  // 프로필 헤더
  headerCenter: { alignItems: 'center' },
  avatarRing: { width: 88, height: 88, borderRadius: 44, borderWidth: 3.5, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 10 },
  avatarInner: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 42 },
  levelBadge: { position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'rgba(0,0,0,0.6)' },
  levelText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  nickname: { color: '#fff', fontSize: 22, fontWeight: '900', marginBottom: 4 },
  titleText: { color: '#e8a42a', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  titleTextEmpty: { color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '600', marginBottom: 8 },
  tierChip: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  tierChipText: { fontSize: 13, fontWeight: '800' },

  // XP 바
  xpBar: { height: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
  xpFill: { height: '100%', borderRadius: 5 },
  xpLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  xpLabelLeft: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700' },
  xpLabelCenter: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' },
  xpLabelRight: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700' },
  xpRemaining: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 6 },

  // 전적 2x3 그리드
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statBox: { width: '47%' as any, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  statIcon: { fontSize: 16, marginBottom: 2 },
  statNum: { color: '#fff', fontSize: 22, fontWeight: '900' },
  statLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', marginTop: 2 },

  // RP 그래프
  graphWrap: { flexDirection: 'row', height: 100, alignItems: 'flex-end', gap: 2, marginBottom: 8, paddingHorizontal: 2 },
  graphCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', position: 'relative' },
  graphDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, zIndex: 2 },
  graphBar: { width: '80%', borderRadius: 2, minHeight: 2 },
  graphSummary: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', textAlign: 'center' },

  // 리더보드
  lbTabs: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  lbTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
  lbTabActive: { backgroundColor: 'rgba(93,202,165,0.15)', borderWidth: 1, borderColor: 'rgba(93,202,165,0.3)' },
  lbTabText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700' },
  lbTabTextActive: { color: '#5dcaa5' },
  lbList: { gap: 2 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  lbRowMe: { backgroundColor: 'rgba(93,202,165,0.1)', borderWidth: 1, borderColor: 'rgba(93,202,165,0.2)' },
  lbRank: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '800', width: 24, textAlign: 'center' },
  lbTierIcon: { fontSize: 16 },
  lbName: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  lbNameMe: { color: '#5dcaa5', fontWeight: '800' },
  lbXp: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700' },

  // 빈 상태
  emptyState: { alignItems: 'center', paddingVertical: 20 },
  emptyIcon: { fontSize: 36, marginBottom: 8, opacity: 0.4 },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600', marginBottom: 14, textAlign: 'center' },
  ctaBtn: { backgroundColor: '#5dcaa5', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  ctaBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // 최근 전적
  recentList: { gap: 4 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  recentBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, minWidth: 36, alignItems: 'center' },
  recentBadgeText: { fontSize: 13, fontWeight: '800' },
  recentRp: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' },
  recentDate: { color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '600' },

  // 업적
  achScroll: { marginBottom: 8 },
  achRow: { gap: 10, paddingVertical: 4 },
  achSlot: { width: 64, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)' },
  achLocked: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.15)' },
  achIcon: { fontSize: 24, marginBottom: 4 },
  achIconLocked: { opacity: 0.25 },
  achName: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  achNameLocked: { color: 'rgba(255,255,255,0.25)' },
  achFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  achHint: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '600' },
  achMore: { color: '#5dcaa5', fontSize: 12, fontWeight: '700' },

  // 시즌 보상
  seasonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  seasonLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  seasonDays: { color: '#e8a42a', fontSize: 12, fontWeight: '700' },
  seasonValue: { color: '#fff', fontSize: 14, fontWeight: '800' },
  seasonRewards: { flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'center' },
  seasonRewardSlot: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, opacity: 0.4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  seasonRewardUnlocked: { opacity: 1, borderColor: 'rgba(232,164,42,0.3)', backgroundColor: 'rgba(232,164,42,0.08)' },
  seasonRewardName: { color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '700', marginTop: 2 },

  // 칭호 선택
  titleOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  titleOptionActive: { borderColor: 'rgba(93,202,165,0.3)', backgroundColor: 'rgba(93,202,165,0.08)' },
  titleOptionName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  titleOptionDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' },
  titleOptionLocked: { opacity: 0.6, backgroundColor: 'rgba(0,0,0,0.15)' },

  // 리더보드 오버레이 텍스트
  emptyTextOverlay: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: -40, paddingVertical: 10 },
});
