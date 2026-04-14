import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Pressable } from 'react-native';
import { useResponsive } from '../utils/responsive';
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
  onCreateCustomRoom?: (roomName: string, password: string | undefined, playerId: string, nickname: string, options?: { scoreLimit?: number; turnTimer?: number | null; allowSpectators?: boolean }) => void;
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
  onGetGameHistory?: () => void;
  onClaimAttendance?: () => void;
  onDeleteAccount?: () => void;
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
import { ProfilePage } from './ProfilePage';
import { RankingScreen } from './RankingScreen';
import { ShopScreen } from './ShopScreen';
import { AchievementsScreen } from './AchievementsScreen';
import { TermsScreen } from './TermsScreen';
import { CustomMatchScreen } from './CustomMatchScreen';

type Page = 'main' | 'profile' | 'rules' | 'ranking' | 'shop' | 'achievements' | 'settings' | 'terms' | 'customMatch';

function FloatingSymbol({ symbol, x, delay }: { symbol: string; x: number; delay: number }) {
  const ty = useSharedValue(0);
  useEffect(() => {
    ty.value = withRepeat(withTiming(-24, { duration: 5000 + delay * 400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  return <Animated.Text style={[{ position: 'absolute', left: `${x}%` as any, top: `${20 + delay * 7}%` as any, fontSize: 22, color: '#fff', opacity: 0.04 }, s]}>{symbol}</Animated.Text>;
}

export function LobbyScreen({ onJoin, onTutorial, onCreateCustomRoom, onListRooms, onGetLeaderboard, onFriendInit, onFriendSearch, onFriendRequest, onFriendAccept, onFriendReject, onFriendRemove, onFriendInvite, onBuyShopItem, onEquipShopItem, onChangeNickname, onGetGameHistory, onClaimAttendance, onDeleteAccount }: LobbyScreenProps) {
  const { isDesktop } = useResponsive();
  // 18차: desktop 은 완전히 다른 구조 (AppBar + Hero + Cards + Footer). 1-17차의
  // 모든 desktop 실험 (contentWidth 계산, outerWrapper, cardDesktop 고정 width,
  // chrome/main 이원화, 사이드바 등) 전면 폐기. isDesktop 일 때 별도 return.
  const savedNickname = useUserStore((s) => s.nickname);
  const savedPlayerId = useUserStore((s) => s.playerId);
  const userSetNickname = useUserStore((s) => s.setNickname);
  const [nick, setNick] = useState(savedNickname);
  const [friendMsg, setFriendMsg] = useState('');
  const [page, setPage] = useState<Page>('main');
  const [showFriends, setShowFriends] = useState(false);
  // ⚠️ showNickEdit / showAttendance 는 초기값을 false 로 두고 mount 후
  // useEffect 에서 결정한다. 이유: RN 0.76 + New Arch + Bridgeless 에서
  // `<Modal visible={true}>` 이 첫 렌더에 활성화되면 네이티브 Dialog 가
  // 부모 window focus 를 훔쳐 gesture state 가 "DOWN" 으로 stuck — 이후
  // 모든 탭이 "Got DOWN touch before receiving UP or CANCEL" 로 거부됨.
  // 한 틱 늦춰서 마운트하면 회피 가능.
  const [showNickEdit, setShowNickEdit] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  useEffect(() => {
    if (!savedNickname) setShowNickEdit(true);
    if (useUserStore.getState().checkAttendance()) setShowAttendance(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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

  // 커스텀 방 목록 자동 갱신 로직은 CustomMatchScreen 으로 이전됨.

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
  if (page === 'customMatch') return (
    <CustomMatchScreen
      onBack={() => setPage('main')}
      onJoin={onJoin}
      onCreateCustomRoom={onCreateCustomRoom}
      onListRooms={onListRooms}
    />
  );
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
          <View style={S.section}>
            <Text style={S.secTitle}>{'계정'}</Text>
            <TouchableOpacity style={S.menuRow} onPress={() => {
              if (typeof globalThis.confirm === 'function') {
                if (globalThis.confirm('정말 계정을 삭제하시겠습니까?\n모든 데이터가 영구 삭제되며 복구할 수 없습니다.')) {
                  onDeleteAccount?.();
                }
              } else {
                const { Alert } = require('react-native');
                Alert.alert('계정 삭제', '정말 계정을 삭제하시겠습니까?\n모든 데이터가 영구 삭제되며 복구할 수 없습니다.',
                  [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => onDeleteAccount?.() }]
                );
              }
            }}>
              <Text style={S.menuIcon}>{'🗑️'}</Text><Text style={[S.menuText, { color: '#e74c3c' }]}>{'계정 삭제'}</Text><Text style={S.menuArrow}>{'>'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (page === 'profile') {
    return (
      <ProfilePage
        onBack={() => setPage('main')}
        onEdit={() => setShowNickEdit(true)}
        onStartGame={() => setPage('main')}
        onAchievements={() => setPage('achievements')}
        showNickEdit={showNickEdit}
        setShowNickEdit={setShowNickEdit}
        nick={nick}
        setNick={setNick}
        onSaveNick={() => { if (nick.trim()) { userSetNickname(nick.trim()); onChangeNickname?.(nick.trim()); setShowNickEdit(false); } }}
      />
    );
  }
  // ═══════════ 메인 화면 ═══════════
  // 공통 overlay/modal — desktop/mobile 양쪽에서 동일 JSX 재사용.
  const overlays = (
    <>
      {/* ═══ 친구 사이드 패널 ═══ */}
      {showFriends && (
        <Pressable style={S.overlay} onPress={() => setShowFriends(false)}>
          <Animated.View entering={SlideInRight.duration(300)} style={S.fp}>
            <Pressable style={{ flex: 1 }} onPress={e => e.stopPropagation()}>
              <View style={S.fpHead}><Text style={S.fpTitle}>{'친구 목록'}</Text><TouchableOpacity onPress={() => setShowFriends(false)}><Text style={S.fpX}>{'\u2715'}</Text></TouchableOpacity></View>
              {friendCode ? (
                <View style={{ alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>내 친구 코드</Text>
                  <Text style={{ color: '#F59E0B', fontSize: 18, fontWeight: '900', letterSpacing: 3 }}>{friendCode}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, paddingHorizontal: 4 }}>
                <TextInput
                  style={[S.mInput, { flex: 1, paddingVertical: 6, fontSize: 13 }]}
                  value={searchCode}
                  onChangeText={setSearchCode}
                  placeholder={'친구 코드 입력'}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  maxLength={6}
                  disableFullscreenUI
                />
                <TouchableOpacity
                  style={[S.fpAddBtn, { marginBottom: 0, paddingHorizontal: 12, paddingVertical: 6 }]}
                  onPress={() => { if (searchCode.trim() && onFriendSearch) onFriendSearch(searchCode.trim(), savedPlayerId); }}
                >
                  <Text style={S.fpAddText}>{'검색'}</Text>
                </TouchableOpacity>
              </View>
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
                <Text style={S.fpSec}>{'온라인 (' + onlineFriends.length + ')'}</Text>
                {onlineFriends.length === 0 && <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', paddingVertical: 8 }}>{'온라인 친구가 없습니다'}</Text>}
                {onlineFriends.map((f, i) => (
                  <View key={i} style={S.fpRow}>
                    <View style={S.fpAW}><Text style={S.fpAv}>{'🐲'}</Text><View style={S.fpDotOn} /></View>
                    <View style={{ flex: 1 }}><Text style={S.fpN}>{f.nickname}</Text><Text style={S.fpSt}>{f.status === 'lobby' ? '로비' : f.status === 'matching' ? '매칭 중' : '게임 중'}</Text></View>
                    {f.status === 'lobby' && (
                      <TouchableOpacity style={S.fpInv} onPress={() => {
                        const roomId = useGameStore.getState().roomId;
                        if (roomId) {
                          onFriendInvite?.(savedNickname, f.playerId, roomId);
                          setFriendMsg(`${f.nickname}님에게 초대를 보냈습니다!`);
                        } else {
                          setFriendMsg('방에 입장한 후 초대할 수 있습니다');
                        }
                        setTimeout(() => setFriendMsg(''), 2000);
                      }}>
                        <Text style={S.fpInvT}>{'초대'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
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
      {/* 출석/닉네임 편집 — RN 0.76 Modal 금지 (14.2 참조), overlay View 사용. */}
      {showAttendance && (
        <View style={[S.attOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }]}>
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
            <TouchableOpacity style={S.attBtn} onPress={() => { useUserStore.getState().claimAttendance(); onClaimAttendance?.(); setShowAttendance(false); }}>
              <Text style={S.attBtnT}>{'보상 받기'}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}
      {showNickEdit && (
        <View style={[S.mOvl, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }]}>
          <View style={S.mBox}>
            <Text style={S.mTitle}>{'✏️ 닉네임 변경'}</Text>
            <TextInput style={S.mInput} value={nick} onChangeText={setNick} placeholder={'닉네임 입력'} placeholderTextColor="rgba(255,255,255,0.3)" maxLength={12} disableFullscreenUI />
            <TouchableOpacity style={[S.mOk, !nick.trim() && { opacity: 0.4 }]} onPress={() => { if (nick.trim()) { userSetNickname(nick.trim()); onChangeNickname?.(nick.trim()); setShowNickEdit(false); } }} disabled={!nick.trim()}><Text style={S.mOkT}>{'확인'}</Text></TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );

  // ═══ Desktop (PC 웹) — 완전히 다른 AppBar + Hero + Cards + Footer 구조 ═══
  if (isDesktop) {
    return (
      <SafeAreaView style={S.root}>
        <BackgroundWatermark />
        <View style={S.particleLayer} pointerEvents="none">
          {particles.map((p, i) => <FloatingSymbol key={i} symbol={p.s} x={p.x} delay={p.d} />)}
        </View>
        {/* Desktop 상단 AppBar — 로고 좌, nav 중앙, tools 우 */}
        <Animated.View entering={FadeIn.delay(0).duration(500)} style={S.dHeader}>
          <View style={S.dHeaderLeft}>
            <Text style={S.dHeaderLogo}>{'TICHU'}</Text>
          </View>
          <View style={S.dHeaderNav}>
            <TouchableOpacity style={S.dHeaderNavItem} onPress={() => setActiveTab(0)}>
              <Text style={[S.dHeaderNavText, activeTab === 0 && S.dHeaderNavActive]}>{'홈'}</Text>
              {activeTab === 0 && <View style={S.dHeaderNavUnderline} />}
            </TouchableOpacity>
            <TouchableOpacity style={S.dHeaderNavItem} onPress={() => { setPage('ranking'); onGetLeaderboard?.(); }}>
              <Text style={S.dHeaderNavText}>{'랭킹'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.dHeaderNavItem} onPress={() => setPage('shop')}>
              <Text style={S.dHeaderNavText}>{'상점'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.dHeaderNavItem} onPress={() => setShowFriends(true)}>
              <Text style={S.dHeaderNavText}>{'친구'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.dHeaderNavItem} onPress={() => setPage('settings')}>
              <Text style={S.dHeaderNavText}>{'설정'}</Text>
            </TouchableOpacity>
          </View>
          <View style={S.dHeaderRight}>
            <TouchableOpacity style={S.dProfileBtn} activeOpacity={0.8} onPress={() => { setPage('profile'); onGetLeaderboard?.(); onGetGameHistory?.(); }}>
              <View style={[S.dAv, { borderColor: tier.color }]}><Text style={{ fontSize: 18 }}>{avatarEmoji}</Text></View>
              <Text style={S.dNick}>{name}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
        {/* Desktop 메인 — hero + cards + rules link */}
        <ScrollView style={{ flex: 1, zIndex: 5 }} contentContainerStyle={S.dMainContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeIn.delay(200).duration(500)} style={S.dHero}>
            <Text style={S.dHeroTagline}>{'ULTIMATE CARD BATTLE'}</Text>
            <Animated.Text style={[S.dHeroLogo, logoGlowStyle]}>{'TICHU'}</Animated.Text>
            <View style={S.dHeroDivider} />
          </Animated.View>
          {!matching ? (
            <>
              <Animated.View entering={FadeIn.delay(400).duration(500)} style={S.dCards}>
                <TouchableOpacity style={[S.dCard, S.dCardG]} activeOpacity={0.85} onPress={() => setMatching(true)}>
                  <View style={S.cardGlow} pointerEvents="none" />
                  <Text style={S.dCardIcon}>{'\u26A1'}</Text>
                  <Text style={S.dCardTitle}>{'\uBE60\uB978 \uB9E4\uCE6D'}</Text>
                  <Text style={S.dCardSub}>{'\uBE44\uC2B7\uD55C \uC2E4\uB825\uC758 \uC720\uC800\uC640'}{'\n'}{'\uC989\uC2DC \uD50C\uB808\uC774'}</Text>
                  <View style={S.dPlayBtn}><Text style={S.dPlayBtnText}>{'\u25B6  \uD50C\uB808\uC774'}</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={[S.dCard, S.dCardD]} activeOpacity={0.85} onPress={() => setPage('customMatch')}>
                  <Text style={S.dCardIcon}>{'\uD83D\uDD12'}</Text>
                  <Text style={S.dCardTitle}>{'\uCEE4\uC2A4\uD140 \uBAA8\uB4DC'}</Text>
                  <Text style={S.dCardSub}>{'\uBC29 \uB9CC\uB4E4\uAE30 \uBC0F'}{'\n'}{'\uCF54\uB4DC\uB85C \uC785\uC7A5'}</Text>
                  <View style={S.dPlayBtnOutline}><Text style={S.dPlayBtnOutlineText}>{'\u25B6  \uD50C\uB808\uC774'}</Text></View>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View entering={FadeIn.delay(600).duration(500)}>
                <TouchableOpacity style={S.dRulesBtn} activeOpacity={0.8} onPress={() => setPage('rules')}>
                  <Text style={S.dRulesBtnIcon}>{'\uD83D\uDCD6'}</Text>
                  <View style={S.dRulesBtnTextWrap}>
                    <Text style={S.dRulesBtnTitle}>{'게임 규칙'}</Text>
                    <Text style={S.dRulesBtnDesc}>{'티츄가 처음이라면 여기서 배워보세요!'}</Text>
                  </View>
                  <Text style={S.dRulesBtnArrow}>{'›'}</Text>
                </TouchableOpacity>
              </Animated.View>
            </>
          ) : (
            <Animated.View entering={ZoomIn.duration(300).springify()} style={S.matchBox}>
              <Text style={{ fontSize: 36 }}>{'\uD83D\uDD0D'}</Text>
              <Text style={S.matchTitle}>{'\uB9E4\uCE6D \uC911...'}</Text>
              <Text style={S.matchTimer}>{matchSec}{'\uCD08'}</Text>
              <TouchableOpacity style={S.matchCancel} onPress={() => setMatching(false)}><Text style={S.matchCancelT}>{'\uB9E4\uCE6D \uCDE8\uC18C'}</Text></TouchableOpacity>
            </Animated.View>
          )}
        </ScrollView>
        {/* Desktop 하단 푸터 */}
        <View style={S.dFooter}>
          <Text style={S.dFooterText}>{'© 2026 Tichu'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Text style={S.dFooterText}>{'v1.0.0'}</Text>
            <TouchableOpacity onPress={() => setPage('terms')}><Text style={S.dFooterLink}>{'이용약관'}</Text></TouchableOpacity>
          </View>
        </View>
        {overlays}
      </SafeAreaView>
    );
  }

  // ═══ Mobile (세로) — 기존 구조 유지 ═══
  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      <View style={S.particleLayer} pointerEvents="none">
        {particles.map((p, i) => <FloatingSymbol key={i} symbol={p.s} x={p.x} delay={p.d} />)}
      </View>
      <Animated.View entering={FadeIn.delay(0).duration(500)} style={S.topBar}>
        <TouchableOpacity style={S.profileBtn} activeOpacity={0.8} onPress={() => { setPage('profile'); onGetLeaderboard?.(); onGetGameHistory?.(); }}>
          <View style={[S.av, { borderColor: tier.color }]}><Text style={{ fontSize: 18 }}>{avatarEmoji}</Text></View>
          <Text style={S.nick}>{name}</Text>
          <Text style={S.tierIcon}>{tier.icon}</Text>
        </TouchableOpacity>
        <View style={S.topRight}>
          <TouchableOpacity style={S.topIconBtn} onPress={() => setPage('shop')}><Text style={S.topIconText}>{'🛒'}</Text></TouchableOpacity>
          <TouchableOpacity style={S.topIconBtn} onPress={() => setShowFriends(true)}>
            <Text style={S.topIconText}>{'\uD83D\uDC65'}</Text>
            {(onlineFriends.length > 0 || friendRequests.length > 0) && <View style={S.badge}><Text style={S.badgeText}>{onlineFriends.length + friendRequests.length}</Text></View>}
          </TouchableOpacity>
        </View>
      </Animated.View>
      <ScrollView
        style={{ flex: 1, zIndex: 5 }}
        contentContainerStyle={S.center}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.delay(200).duration(500)} style={S.logoArea}>
          <Animated.Text style={[S.title, logoGlowStyle]}>TICHU</Animated.Text>
          <Text style={S.subtitle}>Ultimate Card Battle</Text>
          <View style={S.divider} />
        </Animated.View>
        {!matching ? (
          <Animated.View entering={FadeIn.delay(400).duration(500)} style={S.cardsWrap}>
            <View style={S.cards}>
              <TouchableOpacity style={[S.card, S.cardG]} activeOpacity={0.85} onPress={() => setMatching(true)}>
                <View style={S.cardGlow} pointerEvents="none" />
                <Text style={S.cIcon}>{'\u26A1'}</Text>
                <Text style={S.cTitle}>{'\uBE60\uB978 \uB9E4\uCE6D'}</Text>
                <Text style={S.cSub}>{'\uBE44\uC2B7\uD55C \uC2E4\uB825\uC758 \uC720\uC800\uC640'}{'\n'}{'\uC989\uC2DC \uD50C\uB808\uC774'}</Text>
                <View style={S.playBtn}><Text style={S.playBtnText}>{'\u25B6  \uD50C\uB808\uC774'}</Text></View>
              </TouchableOpacity>
              <TouchableOpacity style={[S.card, S.cardD]} activeOpacity={0.85} onPress={() => { setPage('customMatch'); }}>
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
      </ScrollView>
      <Animated.View entering={FadeIn.delay(800).duration(500)} style={S.nav}>
        <View style={S.navInner}>
          {[{ i: '\uD83C\uDFE0', l: '\uD648', idx: 0 }, { i: '\uD83C\uDFC6', l: '\uB7AD\uD0B9', idx: 1 }, { i: '\u2699\uFE0F', l: '\uC124\uC815', idx: 2 }].map(t => (
            <TouchableOpacity key={t.idx} style={S.navTab} onPress={() => { setActiveTab(t.idx); if (t.idx === 1) setPage('ranking'); else if (t.idx === 2) setPage('settings'); }}>
              {activeTab === t.idx && <View style={S.navDot} />}
              <Text style={[S.navI, activeTab === t.idx ? S.navOn : S.navOff]}>{t.i}</Text>
              <Text style={[S.navL, activeTab === t.idx && S.navLOn]}>{t.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
      {overlays}
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, overflow: 'hidden' },
  particleLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },

  // 상단 바 — 모바일 풀폭. desktop 은 desktopContent (inline) 이 contentWidth
  // maxWidth + alignSelf center 주입.
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 10, zIndex: 10 },
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

  // 중앙 — ScrollView contentContainerStyle. 모바일/desktop 공통: 세로 중앙 정렬.
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  logoArea: { alignItems: 'center', marginBottom: 16 },
  title: { color: '#FFD700', fontSize: 48, fontWeight: '900', letterSpacing: 10, textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12, marginBottom: 2 },
  subtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '600', letterSpacing: 4, marginBottom: 8 },
  divider: { width: 50, height: 2, backgroundColor: 'rgba(255,215,0,0.3)', borderRadius: 1 },

  // 카드 (모바일만 사용)
  cardsWrap: { alignItems: 'stretch' },
  cards: { flexDirection: 'row', gap: 20, justifyContent: 'center' },
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

  // 하단 탭 (모바일만 사용. desktop 은 상단 AppBar 의 nav 메뉴 사용).
  nav: { backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', zIndex: 10 },
  navInner: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
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
  mOk: { flex: 1, backgroundColor: '#D97706', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  mOkT: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // ═══════════════════════════════════════════════════════════════════════
  // 18차 Desktop (PC 웹) — AppBar + Hero + Cards + Footer 스탠다드 레이아웃.
  // 모바일 스타일 (topBar, center, cards, nav) 와 완전 독립. 혼용 금지.
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Desktop 상단 AppBar ───
  dHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 72, paddingHorizontal: 48,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
    zIndex: 10,
  },
  dHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  dHeaderLogo: {
    color: '#FFD700', fontSize: 32, fontWeight: '900', letterSpacing: 3,
    textShadowColor: 'rgba(255,215,0,0.5)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8,
  },
  dHeaderNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dHeaderNavItem: { paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' },
  dHeaderNavText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  dHeaderNavActive: { color: '#F59E0B' },
  dHeaderNavUnderline: { marginTop: 6, height: 2, width: 24, backgroundColor: '#F59E0B', borderRadius: 1 },
  dHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dProfileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  dAv: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  dNick: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // ─── Desktop 메인 영역 ───
  dMainContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 48,
    zIndex: 5,
  },
  // Hero (큰 로고 + 태그라인)
  dHero: { alignItems: 'center', marginBottom: 40 },
  dHeroTagline: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14, fontWeight: '600',
    letterSpacing: 8,
    marginBottom: 12,
  },
  dHeroLogo: {
    color: '#FFD700', fontSize: 84, fontWeight: '900', letterSpacing: 16,
    textShadowColor: 'rgba(255,215,0,0.5)',
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 20,
  },
  dHeroDivider: { width: 80, height: 2, backgroundColor: 'rgba(255,215,0,0.3)', borderRadius: 1, marginTop: 16 },

  // 메인 카드 2개 (크게, PC 가독성)
  dCards: {
    flexDirection: 'row',
    gap: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  dCard: {
    width: 400, height: 380, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 26, paddingVertical: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55, shadowRadius: 28, elevation: 18,
    overflow: 'hidden',
  },
  dCardG: { backgroundColor: '#0d6b3f' },
  dCardD: { backgroundColor: '#14332a' },
  dCardIcon: { fontSize: 64, marginBottom: 18 },
  dCardTitle: { color: '#fff', fontSize: 30, fontWeight: '900', marginBottom: 10 },
  dCardSub: { color: 'rgba(255,255,255,0.5)', fontSize: 16, lineHeight: 23, textAlign: 'center', marginBottom: 22 },
  dPlayBtn: {
    backgroundColor: '#D97706', borderRadius: 12,
    paddingHorizontal: 46, paddingVertical: 14,
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
  },
  dPlayBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  dPlayBtnOutline: {
    borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.6)',
    borderRadius: 12,
    paddingHorizontal: 46, paddingVertical: 13,
  },
  dPlayBtnOutlineText: { color: '#10b981', fontSize: 17, fontWeight: '700' },

  // 게임 규칙 배너 — 카드 2개 합친 폭 (400×2 + gap 48 = 848) 에 맞춰 stretch.
  // marginTop 으로 카드 아래에 살짝 간격.
  dRulesBtn: {
    width: 848,
    marginTop: 4,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 28, paddingVertical: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
  },
  dRulesBtnIcon: { fontSize: 32, marginRight: 18 },
  dRulesBtnTextWrap: { flex: 1 },
  dRulesBtnTitle: { color: '#F59E0B', fontSize: 18, fontWeight: '800', marginBottom: 3 },
  dRulesBtnDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500' },
  dRulesBtnArrow: { color: 'rgba(255,255,255,0.4)', fontSize: 28, fontWeight: '300' },

  // ─── Desktop 하단 푸터 ───
  // 배경/보더 없음 — splash 배경 위에 텍스트만 올림. 상단 AppBar 와 시각적으로
  // 구분되어 "대칭 프레임" 느낌이 사라져 더 자연스러움.
  dFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52, paddingHorizontal: 48,
    zIndex: 10,
  },
  dFooterText: { color: 'rgba(255,255,255,0.35)', fontSize: 12 },
  dFooterLink: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
});
