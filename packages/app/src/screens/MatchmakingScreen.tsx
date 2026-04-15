import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Clipboard, Platform, StatusBar } from 'react-native';

// RN 'SafeAreaView' 는 iOS notch 만 처리 (Android no-op). Android 카메라홀/노치를
// 피하려면 StatusBar.currentHeight 로 직접 top padding 을 넣어야 함.
// react-native-safe-area-context 는 Bridgeless + New Arch 에서 RNCSafeAreaProvider
// duplicate-view-registration 으로 터진 이력 있음 → 사용 금지, 수동 계산 유지.
const ANDROID_TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence,
  Easing, ZoomIn, FadeIn,
} from 'react-native-reanimated';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';
import { useGameStore } from '../stores/gameStore';

interface Props {
  mode: 'quick' | 'custom';
  roomCode?: string;
  nickname: string;
  onCancel: () => void;
  onStart: () => void;
  onAddBots: () => void;
  onSwapSeat?: (targetSeat: number) => void;
  onMoveSeat?: (targetSeat: number) => void;
  onShuffleTeams?: () => void;
  onStartGame?: () => void;
  onAddBotToSeat?: (seat: number, difficulty?: 'easy' | 'medium' | 'hard') => void;
  onRemoveBot?: (seat: number) => void;
}

interface Slot { name: string | null; avatar: string; tier: string; ready: boolean; isBot: boolean; }

export function MatchmakingScreen({ mode, roomCode, nickname, onCancel, onStart, onAddBots, onSwapSeat, onMoveSeat, onShuffleTeams, onStartGame, onAddBotToSeat, onRemoveBot }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<'easy' | 'medium' | 'hard'>('hard');

  // 서버에서 받은 실제 플레이어 정보 구독
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const mySeat = useGameStore((s) => s.mySeat);

  // 서버 플레이어 정보를 슬롯으로 변환
  const avatars = ['🐲', '🦁', '🐻', '🦊'];
  const roomId = useGameStore((s) => s.roomId);
  const hasJoinedRoom = !!roomId && mySeat >= 0;
  const slots: Slot[] = [0, 1, 2, 3].map(seat => {
    const p = players[seat];
    if (p) {
      return {
        name: p.nickname,
        avatar: avatars[seat] ?? '🐲',
        tier: p.isBot ? '🤖' : '🥈',
        ready: true,
        isBot: p.isBot,
      };
    }
    // 대기 중: 아직 room_joined 안 왔으면 seat 0에 내 정보 표시
    if (!hasJoinedRoom && seat === 0) {
      return {
        name: nickname,
        avatar: avatars[0]!,
        tier: '🥈',
        ready: true,
        isBot: false,
      };
    }
    return { name: null, avatar: '', tier: '', ready: false, isBot: false };
  });

  const filledCount = slots.filter(s => s.name !== null).length;
  const humanCount = slots.filter(s => s.name !== null && !s.isBot).length;
  const hostPlayerId = useGameStore((s) => s.hostPlayerId);
  const myPlayerId = useGameStore((s) => s.playerId);
  const isHost = (hostPlayerId && myPlayerId) ? hostPlayerId === myPlayerId : (mySeat === 0 || (!hasJoinedRoom && mode === 'custom'));
  // 커스텀 방 시작 조건 완화: 2명 이상이면 시작 허용.
  // 서버 start_game 핸들러가 빈 자리를 기본 봇으로 자동 채움 (socket-handlers.ts:724).
  // 기존엔 === 4 만 허용해서 봇 제거 후 버튼이 비활성화되어 "안 눌림" 체감 버그.
  const canStart = filledCount >= 2;

  // 경과 시간
  useEffect(() => {
    const iv = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  // 빠른 매칭: 서버에서 자동 매칭 (큐 시스템)
  const matchmakingStatus = useGameStore((s) => s.matchmakingStatus);
  const matchmakingPosition = useGameStore((s) => s.matchmakingPosition);
  const matchmakingQueueSize = useGameStore((s) => s.matchmakingQueueSize);
  // 빠른매칭: 4인 채워지면 카운트다운 (커스텀은 방장 시작)
  useEffect(() => {
    if (mode === 'quick' && filledCount === 4 && countdown === null) {
      setCountdown(3);
    }
  }, [filledCount]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { onStart(); return; }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);
  // 게임이 시작되면 (TRICK_PLAY 등) 자동 전환
  useEffect(() => {
    if (phase && phase !== 'WAITING_FOR_PLAYERS') {
      // 이미 게임 진행 중이면 바로 전환
      if (countdown === null) setCountdown(3);
    }
  }, [phase]);
  // 스피너
  const spin = useSharedValue(0);
  useEffect(() => { spin.value = withRepeat(withTiming(360, { duration: 2500, easing: Easing.linear }), -1, false); }, []);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  // 로딩 dots
  const dotOpacity = useSharedValue(0.3);
  useEffect(() => { dotOpacity.value = withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0.3, { duration: 600 })), -1, false); }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleCopy = () => {
    if (roomCode) {
      try { Clipboard.setString(roomCode); } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSlotPress = (idx: number) => {
    if (mode !== 'custom') return;
    if (idx === mySeat) return;
    const slot = slots[idx];
    if (!slot) return;

    if (slot.name === null) {
      // 빈 자리 → 방장은 봇 추가, 일반 플레이어는 이동
      if (isHost && onAddBotToSeat) { onAddBotToSeat(idx, botDifficulty); return; }
      if (onMoveSeat) onMoveSeat(idx);
    } else if (slot.isBot && isHost) {
      // 봇 자리 → 봇 제거 (방장만)
      if (onRemoveBot) onRemoveBot(idx);
    } else if (!slot.isBot && isHost) {
      // 다른 플레이어 → 자리 교환 (방장만)
      if (onSwapSeat) onSwapSeat(idx);
    }
  };

  const renderSlot = (slot: Slot, idx: number) => {
    // teams: seat 0,2 = team1, seat 1,3 = team2
    const isTeam1 = idx === 0 || idx === 2;
    const isMe = idx === mySeat || (!hasJoinedRoom && idx === 0);
    const teamColor = isTeam1 ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)';
    const borderColor = isMe
      ? '#F59E0B'
      : slot.name ? (isTeam1 ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.1)';
    const canInteract = mode === 'custom' && !isMe;

    // 힌트 텍스트
    let hint = '';
    if (canInteract) {
      if (!slot.name) hint = '탭하여 이동';
      else if (slot.isBot && isHost) hint = '탭하여 제거';
      else if (!slot.isBot && isHost) hint = '탭하여 교환';
    }

    const content = (
      <Animated.View key={idx} entering={slot.name ? ZoomIn.delay(idx * 200).duration(350).springify() : undefined} style={[S.slot, { backgroundColor: teamColor, borderColor, borderStyle: isMe ? 'solid' : 'dashed' }]}>
        {isMe && <View style={S.meBadge}><Text style={S.meBadgeText}>나</Text></View>}
        {slot.name ? (
          <>
            <Text style={S.slotAvatar}>{slot.avatar}</Text>
            <Text style={S.slotName} numberOfLines={1}>{slot.name}</Text>
            <Text style={S.slotTier}>{slot.tier}</Text>
            {slot.isBot && <View style={S.botBadge}><Text style={S.botBadgeText}>BOT</Text></View>}
            {hint ? <Text style={S.swapHint}>{hint}</Text> : null}
            {slot.ready && !slot.isBot && <View style={S.readyMark}><Text style={S.readyMarkText}>{'\u2713'}</Text></View>}
          </>
        ) : (
          <>
            <View style={S.emptyCircle}><Animated.Text style={[S.emptyDots, dotStyle]}>...</Animated.Text></View>
            <Text style={S.emptyText}>{mode === 'custom' ? '대기 중' : '상대를 찾는 중...'}</Text>
            {hint ? <Text style={S.swapHint}>{hint}</Text> : null}
          </>
        )}
      </Animated.View>
    );

    if (canInteract && (hint || !slot.name)) {
      return (
        <TouchableOpacity key={idx} onPress={() => handleSlotPress(idx)} activeOpacity={0.7}>
          {content}
        </TouchableOpacity>
      );
    }
    return <View key={idx}>{content}</View>;
  };

  return (
    <SafeAreaView style={[S.root, { paddingTop: ANDROID_TOP_INSET }]}>
      <BackgroundWatermark />
      {/* 카운트다운 오버레이 */}
      {countdown !== null && countdown > 0 && (
        <Animated.View entering={ZoomIn.duration(300).springify()} style={S.cdOverlay}>
          <Text style={S.cdNum}>{countdown}</Text>
        </Animated.View>
      )}
      {countdown !== null && countdown <= 0 && (
        <Animated.View entering={ZoomIn.duration(300).springify()} style={S.cdOverlay}>
          <Text style={S.cdGo}>{'게임 시작!'}</Text>
        </Animated.View>
      )}
      <View style={S.content}>
        {/* 상단 */}
        <View style={S.header}>
          <Text style={S.headerTitle}>{mode === 'quick' ? '매칭 중...' : '커스텀 매치'}</Text>
          {mode === 'custom' && roomCode && (
            <TouchableOpacity style={S.codeBox} onPress={handleCopy} activeOpacity={0.7}>
              <Text style={S.codeLabel}>방 코드</Text>
              <Text style={S.codeText}>{roomCode}</Text>
              <Text style={S.codeCopy}>{copied ? '✓ 복사됨' : '📋 복사'}</Text>
            </TouchableOpacity>
          )}
          <View style={S.timerRow}>
            <Animated.Text style={[S.spinSymbol, spinStyle]}>{'\u2660'}</Animated.Text>
            <Text style={S.elapsed}>{fmt(elapsed)}</Text>
            <Animated.Text style={[S.spinSymbol, spinStyle]}>{'\u2665'}</Animated.Text>
          </View>
          <Text style={S.playerCount}>
            {mode === 'quick' && matchmakingStatus === 'queued'
              ? `대기열 ${matchmakingPosition}/${matchmakingQueueSize}명`
              : `${filledCount}/4 명 참가`}
          </Text>
        </View>
        {/* 슬롯 */}
        <View style={S.slotsArea}>
          <View style={S.teamHeader}>
            <View style={S.teamLabelRow}><View style={[S.teamDot, { backgroundColor: COLORS.team1 }]} /><Text style={S.teamLabel}>Team 1</Text></View>
            <View style={S.teamLabelRow}><Text style={S.teamLabel}>Team 2</Text><View style={[S.teamDot, { backgroundColor: COLORS.team2 }]} /></View>
          </View>
          <View style={S.slotsGrid}>
            <View style={S.teamCol}>{[0, 2].map(i => renderSlot(slots[i]!, i))}</View>
            <View style={S.vsCol}><Text style={S.vsText}>VS</Text></View>
            <View style={S.teamCol}>{[1, 3].map(i => renderSlot(slots[i]!, i))}</View>
          </View>
        </View>
        {/* 하단 */}
        <View style={S.bottom}>
          {mode === 'custom' && isHost && (
            <View style={S.hostActions}>
              {/* Row 1: 난이도 선택 (4인 미만일 때만) */}
              {filledCount < 4 && (
                <View style={S.difficultyRow}>
                  {(['easy', 'medium', 'hard'] as const).map((d) => (
                    <TouchableOpacity
                      key={d}
                      onPress={() => setBotDifficulty(d)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      style={[
                        S.difficultyBtn,
                        botDifficulty === d && {
                          backgroundColor: d === 'easy' ? '#22c55e' : d === 'medium' ? '#f59e0b' : '#ef4444',
                        },
                      ]}
                    >
                      <Text style={[S.difficultyText, botDifficulty === d && S.difficultyTextActive]}>
                        {d === 'easy' ? '쉬움' : d === 'medium' ? '보통' : '어려움'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {/* Row 2: 셔플 + 봇 채우기 (2개 나란히) */}
              <View style={S.actionRow}>
                <TouchableOpacity style={[S.secondaryBtn, S.rowBtnFlex]} onPress={onShuffleTeams} activeOpacity={0.7}>
                  <Text style={S.secondaryBtnText}>{'🔀 셔플'}</Text>
                </TouchableOpacity>
                {filledCount < 4 && (
                  <TouchableOpacity
                    style={[S.secondaryBtn, S.rowBtnFlex]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => {
                      for (let s = 0; s < 4; s++) {
                        if (!players[s] && onAddBotToSeat) onAddBotToSeat(s, botDifficulty);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={S.secondaryBtnText}>{'🤖 봇 채우기'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {/* Row 3: 시작 (풀폭, 강조) */}
              <TouchableOpacity
                style={[S.startGameBtn, !canStart && S.startGameBtnDisabled]}
                onPress={onStartGame}
                disabled={!canStart}
              >
                <Text style={[S.startGameText, !canStart && { opacity: 0.5 }]}>
                  {canStart
                    ? (filledCount === 4 ? '🎮 시작' : `🎮 시작 (${filledCount}/4 — 나머지 자동 봇)`)
                    : `🎮 최소 2명 필요 (${filledCount}/4)`}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity style={S.cancelBtn} onPress={onCancel}>
            <Text style={S.cancelText}>{mode === 'quick' ? '매칭 취소' : '나가기'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40, zIndex: 5 },

  // 상단
  header: { alignItems: 'center', gap: 8 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spinSymbol: { color: 'rgba(255,255,255,0.2)', fontSize: 18 },
  elapsed: { color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] as any },
  playerCount: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' },
  codeBox: { alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  codeLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' },
  codeText: { color: '#F59E0B', fontSize: 24, fontWeight: '900', letterSpacing: 4 },
  codeCopy: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },

  // 슬롯
  // slotsArea 는 flex:1 + overflow:'hidden' 으로 제한 — 슬롯 콘텐츠가
  // flex stretch 되면서 아래 hostActions 버튼 row 위에 겹쳐 그려지는
  // 2026-04-14 landscape 버그 (7차 작업 2단계 실측에서 확인) 방지.
  slotsArea: { flex: 1, justifyContent: 'center', overflow: 'hidden', marginBottom: 12 },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
  teamLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  teamLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700' },
  // alignItems: 'flex-start' 로 고정해서 teamCol 들이 세로로 stretch
  // 되지 않도록 — 기본 'stretch' 가 parent 높이에 맞춰 늘어나던 원인.
  slotsGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  teamCol: { flex: 1, gap: 8 },
  vsCol: { width: 40, alignItems: 'center', alignSelf: 'center' },
  vsText: { color: 'rgba(255,255,255,0.15)', fontSize: 18, fontWeight: '900' },

  slot: {
    borderRadius: 16, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 8,
    // height 를 고정해 slots 가 부모 컨테이너에 따라 stretch 되는 걸 차단.
    // 이전엔 minHeight 120 만 있어서 column 레이아웃에서 stretch 되며
    // 651px 까지 커지고 버튼 row 를 덮었음.
    // 2026-04-15: 140 → 110 으로 축소해 하단 호스트 액션 3단 레이아웃에
    // 충분한 수직 여유 확보 (모바일 웹 주소창 고려).
    height: 110,
    position: 'relative',
  },
  slotAvatar: { fontSize: 28 },
  slotName: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2, maxWidth: 100, textAlign: 'center' },
  slotTier: { fontSize: 12, marginTop: 1 },
  readyMark: { position: 'absolute', top: 6, right: 6, backgroundColor: '#10b981', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  readyMarkText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  botBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(99,102,241,0.3)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  botBadgeText: { color: '#818CF8', fontSize: 9, fontWeight: '800' },
  emptyCircle: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  emptyDots: { color: 'rgba(255,255,255,0.3)', fontSize: 20, fontWeight: '900' },
  emptyText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 6, textAlign: 'center' },
  swapHint: { color: 'rgba(245,158,11,0.5)', fontSize: 9, marginTop: 4 },
  meBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(245,158,11,0.3)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  meBadgeText: { color: '#F59E0B', fontSize: 9, fontWeight: '800' },

  // 카운트다운
  cdOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 },
  cdNum: { color: '#FFD700', fontSize: 80, fontWeight: '900', textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 20 },
  cdGo: { color: '#FFD700', fontSize: 36, fontWeight: '900', textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 16 },

  // 하단 — flexShrink:0 으로 slotsArea 가 이 영역을 밀어내지 못하게.
  bottom: { alignItems: 'stretch', gap: 10, flexShrink: 0, width: '100%' },
  // portrait 고정 이후: 가로 한 줄에 셔플/봇/시작 3개를 담기엔 모바일 폭이 부족.
  // column 으로 세로 stack — 3개 버튼이 각자 한 줄 씩 차지해서 잘림 없음.
  // 3단 row 레이아웃: 난이도 / (셔플+봇채우기) / 시작
  hostActions: { flexDirection: 'column', gap: 8, alignItems: 'stretch', width: '100%' },
  difficultyRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  difficultyBtn: { paddingHorizontal: 18, paddingVertical: 8 },
  difficultyText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  difficultyTextActive: { color: '#fff', fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8, width: '100%' },
  rowBtnFlex: { flex: 1 },
  secondaryBtn: {
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#A5B4FC', fontSize: 13, fontWeight: '800' },
  shuffleBtn: { backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  shuffleBtnText: { color: '#818CF8', fontSize: 14, fontWeight: '800' },
  startGameBtn: { backgroundColor: '#2ecc71', borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, alignItems: 'center', shadowColor: '#2ecc71', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  startGameBtnDisabled: { backgroundColor: 'rgba(46,204,113,0.25)', shadowOpacity: 0 },
  startGameText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  botFillBtn: { backgroundColor: 'rgba(99,102,241,0.15)', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  botFillText: { color: '#818CF8', fontSize: 15, fontWeight: '700' },
  cancelBtn: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  cancelText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
});
