import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Platform, StatusBar } from 'react-native';

// Android 카메라홀/노치 회피용 top inset. react-native-safe-area-context 는
// Bridgeless + New Arch 에서 duplicate-view 에러를 내서 사용 불가 → 수동 계산.
const ANDROID_TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
import { isMobile, mob } from '../utils/responsive';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { useGameStore } from '../stores/gameStore';
import { useUserStore } from '../stores/userStore';
import { useTeamInfo } from '../hooks/useGame';
import { PlayerHand } from '../components/PlayerHand';
import { OpponentHand } from '../components/OpponentHand';
import { TableArea } from '../components/TableArea';
import { ActionBar } from '../components/ActionBar';
import { CardView } from '../components/CardView';
import { ScoreBoard } from '../components/ScoreBoard';
import { DragonGiveModal } from '../components/DragonGiveModal';
import { ReportModal } from '../components/ReportModal';
import { useToast } from './../components/ToastSystem';
import { LargeTichuModal } from '../components/LargeTichuModal';
import { ExchangeView } from '../components/ExchangeView';

import { GameEventOverlay } from '../components/GameEventOverlay';
import { EmoteButton, EmoteBubble } from '../components/EmotePanel';
import { BackgroundWatermark } from '../components/BackgroundWatermark';
import { CircleTimer } from '../components/CircleTimer';
import { COLORS, FONT } from '../utils/theme';
import type { Card, Rank } from '@tichu/shared';

interface GameScreenProps {
  onPlay: (cards: Card[], phoenixAs?: Rank, wish?: Rank) => void;
  onPass: () => void;
  onDeclareTichu: (type: 'large' | 'small') => void;
  onPassTichu: () => void;
  onExchange: (left: Card, partner: Card, right: Card) => void;
  onDragonGive: (targetSeat: number) => void;
  onSubmitBomb: () => void;
  onSubmitBombCards?: (cards: Card[]) => void;
  onAddBots: () => void;
  onBackToLobby?: () => void;
  onSendEmote?: (emoji: string, label: string) => void;
  onReportUser?: (targetId: string, reason: string, description?: string) => void;
}

function TichuPulseButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0.3);
  useEffect(() => {
    scale.value = withRepeat(withSequence(withTiming(1.06, { duration: 600 }), withTiming(1, { duration: 600 })), -1, false);
    glow.value = withRepeat(withSequence(withTiming(0.7, { duration: 600 }), withTiming(0.3, { duration: 600 })), -1, false);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], shadowOpacity: glow.value }));
  return (
    <View style={[tichuPulseS.wrap, animStyle]}>
      <TouchableOpacity style={tichuPulseS.btn} onPress={onPress} activeOpacity={0.8}>
        <Text style={tichuPulseS.text}>{'⭐ 스몰 티츄 선언 가능'}</Text>
        <Text style={tichuPulseS.hint}>{'👆 탭하여 선언'}</Text>
      </TouchableOpacity>
    </View>
  );
}
const tichuPulseS = StyleSheet.create({
  wrap: { shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 0 }, shadowRadius: 12, elevation: 6 },
  btn: { backgroundColor: 'rgba(243,156,18,0.15)', borderWidth: 1.5, borderColor: 'rgba(243,156,18,0.5)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  text: { color: '#F59E0B', fontSize: 13, fontWeight: '800' },
  hint: { color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 2 },
});

export function GameScreen({
  onPlay, onPass, onDeclareTichu, onPassTichu,
  onExchange, onDragonGive, onSubmitBomb, onSubmitBombCards, onAddBots, onBackToLobby, onSendEmote, onReportUser,
}: GameScreenProps) {
  const phase = useGameStore((s) => s.phase);
  const players = useGameStore((s) => s.players);
  const otherHandCounts = useGameStore((s) => s.otherHandCounts);
  const tichuDeclarations = useGameStore((s) => s.tichuDeclarations);
  const finishOrder = useGameStore((s) => s.finishOrder);
  const currentTurn = useGameStore((s) => s.currentTurn);
  const roundResult = useGameStore((s) => s.roundResult);
  const gameOver = useGameStore((s) => s.gameOver);
  const errorMsg = useGameStore((s) => s.errorMsg);
  const passedSeats = useGameStore((s) => s.passedSeats);
  const trickWonEvent = useGameStore((s) => s.trickWonEvent);
  const exchangeReceived = useGameStore((s) => s.exchangeReceived);
  const mySeat = useGameStore((s) => s.mySeat);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const turnStartedAt = useGameStore((s) => s.turnStartedAt);
  const turnDuration = useGameStore((s) => s.turnDuration);
  const canDeclareTichu = useGameStore((s) => s.canDeclareTichu);
  const lastPlayEvent = useGameStore((s) => s.lastPlayEvent);
  const [bombShake, setBombShake] = useState(false);
  // 스몰 티츄 확인 모달 — 실수로 누르면 -100 손해라 중요. RN 0.76 touch-lock
  // 버그 회피 위해 native Modal 금지, absolute overlay View 사용 (CLAUDE.md §14.2).
  const [showTichuConfirm, setShowTichuConfirm] = useState(false);
  // 파트너 위에 카드 낼 때 경고 모달 (팀원 트릭 막기 방지)
  const [pendingPartnerBlock, setPendingPartnerBlock] = useState<{ cards: Card[]; phoenixAs?: Rank; wish?: Rank } | null>(null);
  // 신고 모달 — 게임 중 opponent 신고
  const [reportTarget, setReportTarget] = useState<{ seat: number; nickname: string; dbUserId: string } | null>(null);
  const { showToast } = useToast();
  // "다시 표시하지 않기" 체크박스 로컬 상태 — 모달이 열릴 때마다 초기화
  const [tichuDontShowAgain, setTichuDontShowAgain] = useState(false);
  const [partnerDontShowAgain, setPartnerDontShowAgain] = useState(false);
  useEffect(() => { if (showTichuConfirm) setTichuDontShowAgain(false); }, [showTichuConfirm]);
  useEffect(() => { if (pendingPartnerBlock) setPartnerDontShowAgain(false); }, [pendingPartnerBlock]);
  // 설정: 두 안내 힌트의 on/off — in-game "다시 표시하지 않기" 가 저장됨
  const smallTichuHintOn = useUserStore((s) => s.smallTichuHintOn);
  const partnerBlockHintOn = useUserStore((s) => s.partnerBlockHintOn);
  const setSetting = useUserStore((s) => s.setSetting);
  const tableCards = useGameStore((s) => s.tableCards);
  // onPlay 인터셉터 — 파트너가 마지막으로 낸 카드 위에 내가 카드를 내려 하면
  // "팀원 트릭 막기" 경고 모달. 설정 off 거나 이미 "다시 표시하지 않기" 누른
  // 경우 바로 통과.
  const handlePlayWithGuard = (cards: Card[], phoenixAs?: Rank, wish?: Rank) => {
    if (
      partnerBlockHintOn &&
      tableCards !== null &&
      lastPlayEvent &&
      lastPlayEvent.seat === partnerSeat &&
      !lastPlayEvent.hand.cards.some(c => c.type === 'special' && c.specialType === 'dragon')
    ) {
      setPendingPartnerBlock({ cards, phoenixAs, wish });
      return;
    }
    onPlay(cards, phoenixAs, wish);
  };

  // 스몰 티츄 버튼: 힌트 on 이면 확인 모달, off 면 바로 선언
  const handleSmallTichuPress = () => {
    if (smallTichuHintOn) setShowTichuConfirm(true);
    else onDeclareTichu('small');
  };

  // 폭탄이 실제로 플레이됐을 때만 화면 흔들림
  useEffect(() => {
    if (lastPlayEvent?.hand?.type === 'four_bomb' || lastPlayEvent?.hand?.type === 'straight_flush_bomb') {
      setBombShake(true);
      setTimeout(() => setBombShake(false), 500);
    }
  }, [lastPlayEvent]);

  // 이모트 말풍선
  const emoteEvent = useGameStore((s) => s.emoteEvent);
  const [activeEmotes, setActiveEmotes] = useState<Record<number, { emoji: string; label: string } | null>>({});
  useEffect(() => {
    if (!emoteEvent) return;
    const { seat, emoji, label } = emoteEvent;
    setActiveEmotes(prev => ({ ...prev, [seat]: { emoji, label } }));
    const timer = setTimeout(() => {
      setActiveEmotes(prev => ({ ...prev, [seat]: null }));
    }, 3000);
    return () => clearTimeout(timer);
  }, [emoteEvent]);
  const scores = useGameStore((s) => s.scores);
  const reset = useGameStore((s) => s.reset);
  const { leftOpponent, rightOpponent, partnerSeat } = useTeamInfo();
  // 에러 배너 shake 애니메이션
  const errorShakeX = useSharedValue(0);
  useEffect(() => {
    if (errorMsg) {
      errorShakeX.value = withSequence(
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 50 }),
        withTiming(-4, { duration: 50 }),
        withTiming(4, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      );
    }
  }, [errorMsg]);
  const errorShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: errorShakeX.value }],
  }));
  // 트릭 승리 / 패스 팝업은 TableArea 내부에서 처리

  // 티츄 선언 중앙 팝업 (2초간 표시)
  const [tichuFlash, setTichuFlash] = useState<{ seat: number; type: 'large' | 'small' } | null>(null);
  const prevTichuRef = useRef<Record<number, string | null>>({});
  useEffect(() => {
    for (const seat of [0, 1, 2, 3]) {
      const decl = tichuDeclarations[seat];
      if (decl && !prevTichuRef.current[seat]) {
        setTichuFlash({ seat, type: decl });
        setTimeout(() => setTichuFlash(null), 2500);
      }
      prevTichuRef.current[seat] = decl ?? null;
    }
  }, [tichuDeclarations]);
  // Helper: get player name by seat
  const seatName = (seat: number): string => players[seat]?.nickname ?? `P${seat + 1}`;
  // Helper: get rank label
  const rankLabel = (rank: number): string => {
    const labels = ['1', '2', '3', '4'];
    return `${labels[rank - 1] ?? rank}`;
  };

  // 턴 타이머 카운트다운
  const [remainingSec, setRemainingSec] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== 'TRICK_PLAY' || turnStartedAt === 0) {
      setRemainingSec(0);
      return;
    }
    const tick = () => {
      const elapsed = Date.now() - turnStartedAt;
      const remaining = Math.max(0, Math.ceil((turnDuration - elapsed) / 1000));
      setRemainingSec(remaining);
    };
    tick();
    intervalRef.current = setInterval(tick, 200);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [turnStartedAt, turnDuration, phase]);
  // 턴 글로우 (테이블 영역)
  const turnGlow = useSharedValue(0);
  useEffect(() => {
    if (phase === 'TRICK_PLAY' && currentTurn >= 0) {
      turnGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        ), -1, false,
      );
    } else {
      turnGlow.value = withTiming(0, { duration: 300 });
    }
  }, [phase, currentTurn]);

  const isPartnerTurn = !isMyTurn && ((currentTurn + 2) % 4 === mySeat);
  const tableBorderColor = isMyTurn ? COLORS.accent : isPartnerTurn ? COLORS.team1 : COLORS.team2;
  const tableGlowStyle = useAnimatedStyle(() => ({
    borderColor: phase === 'TRICK_PLAY' ? tableBorderColor : 'transparent',
    shadowColor: tableBorderColor,
    shadowOpacity: turnGlow.value * 0.5,
  }));
  // 내 턴 하단 영역 밝기
  const bottomGlow = useSharedValue(0);
  useEffect(() => {
    if (isMyTurn) {
      bottomGlow.value = withTiming(1, { duration: 300 });
    } else {
      bottomGlow.value = withTiming(0, { duration: 300 });
    }
  }, [isMyTurn]);
  const bottomGlowStyle = useAnimatedStyle(() => ({
    backgroundColor: isMyTurn
      ? `rgba(243,156,18,${0.04 + bottomGlow.value * 0.06})`
      : 'rgba(0,0,0,0.2)',
  }));
  // 5초 이하 긴박감 (내 턴)
  const urgencyPulse = useSharedValue(0);
  const isUrgent = isMyTurn && remainingSec > 0 && remainingSec <= 5;
  useEffect(() => {
    if (isUrgent) {
      urgencyPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 250 }),
          withTiming(0, { duration: 250 }),
        ), -1, false,
      );
    } else {
      urgencyPulse.value = withTiming(0, { duration: 200 });
    }
  }, [isUrgent]);
  const urgencyStyle = useAnimatedStyle(() => ({
    borderTopColor: `rgba(239,68,68,${urgencyPulse.value * 0.6})`,
    borderTopWidth: urgencyPulse.value > 0.01 ? 2 : 1,
  }));
  // 대기 중
  if (phase === 'WAITING_FOR_PLAYERS') {
    const joined = [0, 1, 2, 3].filter(s => players[s] !== null).length;
    return (
      <View style={styles.outerBg}>
        <BackgroundWatermark ingame />
        <SafeAreaView style={styles.container}>
          <View style={styles.center}>
            <Text style={styles.waitTitle}>대기 중</Text>
            <Text style={styles.waitText}>{joined}/4 참가</Text>
            {joined < 4 && (
              <TouchableOpacity style={styles.addBotsBtn} onPress={onAddBots}>
                <Text style={styles.addBotsText}>봇으로 채우기</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }
  // 딜링 중 (빠른 전환 시 버벅임 방지)
  if (phase === 'DEALING_8' || phase === 'DEALING_6') {
    return (
      <View style={styles.outerBg}>
        <BackgroundWatermark ingame />
        <SafeAreaView style={styles.container}>
          <View style={styles.center}>
            <Text style={styles.waitTitle}>{'🃏'}</Text>
            <Text style={styles.waitText}>{phase === 'DEALING_8' ? '카드 배분 중...' : '추가 카드 배분 중...'}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }
  // 게임 종료
  if (gameOver) {
    const isTeam1Winner = gameOver.winner === 'team1';
    const winnerColor = '#FFD700';
    const loserColor = COLORS.textDim;
    return (
      <View style={styles.outerBg}>
      <BackgroundWatermark ingame />
      <SafeAreaView style={styles.container}>
        <View style={styles.resultContainer}>
          <Text style={styles.gameOverBanner}>게임 종료!</Text>
          <View style={[styles.winnerBox, { borderColor: winnerColor }]}>
            <Text style={[styles.winnerTeamText, { color: winnerColor }]}>
              {isTeam1Winner ? '팀1' : '팀2'} 승리!
            </Text>
            <View style={styles.finalScoreRow}>
              <View style={styles.finalScoreTeam}>
                <Text style={[styles.finalScoreLabel, { color: isTeam1Winner ? winnerColor : loserColor }]}>팀1</Text>
                <Text style={[styles.finalScoreValue, { color: isTeam1Winner ? winnerColor : loserColor }]}>{gameOver.scores.team1}</Text>
              </View>
              <Text style={styles.finalScoreDivider}>:</Text>
              <View style={styles.finalScoreTeam}>
                <Text style={[styles.finalScoreLabel, { color: !isTeam1Winner ? winnerColor : loserColor }]}>팀2</Text>
                <Text style={[styles.finalScoreValue, { color: !isTeam1Winner ? winnerColor : loserColor }]}>{gameOver.scores.team2}</Text>
              </View>
            </View>
          </View>
          {/* 라운드 결과가 있으면 마지막 라운드 상세도 표시 */}
          {roundResult?.details && (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>마지막 라운드</Text>
              {roundResult.details.oneTwoFinish && (
                <Text style={styles.oneTwoText}>원투 피니시!</Text>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>카드 점수</Text>
                <Text style={styles.detailValue}>팀1: {roundResult.details.team1CardPoints} / 팀2: {roundResult.details.team2CardPoints}</Text>
              </View>
              {Object.entries(roundResult.details.tichuBonuses).length > 0 && (
                <>
                  <Text style={styles.detailSubTitle}>티츄 보너스</Text>
                  {Object.entries(roundResult.details.tichuBonuses).map(([seatStr, bonus]) => {
                    const seat = Number(seatStr);
                    const decl = roundResult.tichuDeclarations?.[seat];
                    const success = Number(bonus) > 0;
                    return (
                      <Text key={seatStr} style={[styles.tichuBonusText, { color: success ? COLORS.success : COLORS.danger }]}>
                        {seatName(seat)}: {decl === 'large' ? '라지' : '스몰'} 티츄 {success ? '성공' : '실패'} {Number(bonus) > 0 ? '+' : ''}{bonus}
                      </Text>
                    );
                  })}
                </>
              )}
            </View>
          )}
          <TouchableOpacity
            style={styles.backToLobbyBtn}
            onPress={() => {
              reset();
              onBackToLobby?.();
            }}
          >
            <Text style={styles.backToLobbyText}>다시 하기</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
      </View>
    );
  }
  // 라운드 결과 표시
  if (roundResult && (phase === 'ROUND_END' || phase === 'SCORING')) {
    const fo = roundResult.finishOrder ?? finishOrder;
    const decls = roundResult.tichuDeclarations ?? tichuDeclarations;
    return (
      <View style={styles.outerBg}>
      <BackgroundWatermark ingame />
      <SafeAreaView style={styles.container}>
        <View style={styles.resultContainer}>
          <Text style={styles.roundTitle}>라운드 결과</Text>
          {/* 순위 */}
          {fo.length > 0 && (
            <View style={styles.detailSection}>
              <View style={styles.finishOrderRow}>
                {fo.map((seat, idx) => (
                  <View key={seat} style={styles.finishOrderItem}>
                    <Text style={[styles.finishRank, idx === 0 && styles.finishRankFirst]}>{rankLabel(idx + 1)}등</Text>
                    <Text style={[styles.finishName, idx === 0 && styles.finishNameFirst]}>{seatName(seat)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {/* 카드 점수 */}
          {roundResult.details && (
            <View style={styles.detailSection}>
              {roundResult.details.oneTwoFinish && (
                <Text style={styles.oneTwoText}>원투 피니시!</Text>
              )}
              <Text style={styles.detailSectionTitle}>카드 점수</Text>
              <View style={styles.cardPointsRow}>
                <View style={styles.cardPointsTeam}>
                  <Text style={[styles.cardPointsLabel, { color: COLORS.team1 }]}>팀1</Text>
                  <Text style={[styles.cardPointsValue, { color: COLORS.team1 }]}>{roundResult.details.team1CardPoints}점</Text>
                </View>
                <View style={styles.cardPointsTeam}>
                  <Text style={[styles.cardPointsLabel, { color: COLORS.team2 }]}>팀2</Text>
                  <Text style={[styles.cardPointsValue, { color: COLORS.team2 }]}>{roundResult.details.team2CardPoints}점</Text>
                </View>
              </View>
              {/* 티츄 보너스 */}
              {Object.entries(roundResult.details.tichuBonuses).length > 0 && (
                <>
                  <Text style={styles.detailSectionTitle}>티츄 보너스</Text>
                  {Object.entries(roundResult.details.tichuBonuses).map(([seatStr, bonus]) => {
                    const seat = Number(seatStr);
                    const decl = decls[seat];
                    const success = Number(bonus) > 0;
                    return (
                      <Text key={seatStr} style={[styles.tichuBonusText, { color: success ? COLORS.success : COLORS.danger }]}>
                        {seatName(seat)}: {decl === 'large' ? '라지' : '스몰'} 티츄 {success ? '성공' : '실패'} {Number(bonus) > 0 ? '+' : ''}{bonus}
                      </Text>
                    );
                  })}
                </>
              )}
            </View>
          )}
          {/* 이번 라운드 */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>이번 라운드</Text>
            <View style={styles.roundScoreRow}>
              <Text style={[styles.roundScoreTeam, { color: COLORS.team1 }]}>
                팀1: {roundResult.team1 > 0 ? '+' : ''}{roundResult.team1}
              </Text>
              <Text style={[styles.roundScoreTeam, { color: COLORS.team2 }]}>
                팀2: {roundResult.team2 > 0 ? '+' : ''}{roundResult.team2}
              </Text>
            </View>
          </View>
          {/* 누적 점수 */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>누적 점수</Text>
            <ScoreBoard />
          </View>
        </View>
      </SafeAreaView>
      </View>
    );
  }
  // 교환 페이즈
  if (phase === 'PASSING') {
    return (
      <View style={styles.outerBg}>
        <BackgroundWatermark ingame />
        <SafeAreaView style={styles.container}>
          <ExchangeView onExchange={onExchange} onDeclareTichu={onDeclareTichu} />
        </SafeAreaView>
      </View>
    );
  }
  // 플레이어별 색상
  const SEAT_COLORS = ['#22d3ee', '#f472b6', '#a78bfa', '#fb923c'];
  const currentPlayerNick = isMyTurn ? '' : (players[currentTurn]?.nickname ?? '...');
  const currentSeatColor = SEAT_COLORS[currentTurn] ?? '#22d3ee';

  // 메인 게임 화면 (landscape layout)
  return (
    <View style={styles.outerBg}>
      <BackgroundWatermark ingame />
    <SafeAreaView style={styles.container}>
      {/* 게임 이벤트 오버레이 (폭탄/티츄 등) */}
      <GameEventOverlay />
      {/* Top bar */}
      <View style={styles.topBar}>
        <ScoreBoard />
        <View style={styles.partnerCenter}>
          <View>
            {activeEmotes[partnerSeat] && <EmoteBubble emoji={activeEmotes[partnerSeat]!.emoji} label={activeEmotes[partnerSeat]!.label} />}
            <OpponentHand
              position="top"
              cardCount={otherHandCounts[partnerSeat] ?? 0}
              nickname={players[partnerSeat]?.nickname ?? '파트너'}
              tichu={tichuDeclarations[partnerSeat]}
              isCurrentTurn={currentTurn === partnerSeat}
              finished={finishOrder.includes(partnerSeat)}
              passed={passedSeats.includes(partnerSeat)}
              connected={players[partnerSeat]?.connected ?? true}
              isPartner={true}
              trickWon={trickWonEvent?.winningSeat === partnerSeat ? { points: trickWonEvent.points } : null}
              onLongPress={() => {
                const p = players[partnerSeat];
                if (p && !p.isBot && p.dbUserId) setReportTarget({ seat: partnerSeat, nickname: p.nickname, dbUserId: p.dbUserId });
              }}
            />
          </View>
        </View>
        <View style={styles.topBarRight} />
      </View>
      {/* Middle area: left opponent | table center | right opponent */}
      <View style={styles.middleArea}>
        {/* Left opponent */}
        <View style={styles.sideOpponent}>
          <View>
            {activeEmotes[leftOpponent] && <EmoteBubble emoji={activeEmotes[leftOpponent]!.emoji} label={activeEmotes[leftOpponent]!.label} />}
            <OpponentHand
              position="left"
              cardCount={otherHandCounts[leftOpponent] ?? 0}
              nickname={players[leftOpponent]?.nickname ?? ''}
              tichu={tichuDeclarations[leftOpponent]}
              isCurrentTurn={currentTurn === leftOpponent}
              finished={finishOrder.includes(leftOpponent)}
              passed={passedSeats.includes(leftOpponent)}
              connected={players[leftOpponent]?.connected ?? true}
              isPartner={false}
              nickColor="#A3E635"
              trickWon={trickWonEvent?.winningSeat === leftOpponent ? { points: trickWonEvent.points } : null}
              onLongPress={() => {
                const p = players[leftOpponent];
                if (p && !p.isBot && p.dbUserId) setReportTarget({ seat: leftOpponent, nickname: p.nickname, dbUserId: p.dbUserId });
              }}
            />
          </View>
        </View>
        {/* Table center */}
        <Animated.View style={[styles.tableCenter, styles.tableCenterGlow, tableGlowStyle]}>
          <TableArea />
        </Animated.View>
        {/* Right opponent */}
        <View style={styles.sideOpponent}>
          <View>
            {activeEmotes[rightOpponent] && <EmoteBubble emoji={activeEmotes[rightOpponent]!.emoji} label={activeEmotes[rightOpponent]!.label} />}
            <OpponentHand
              position="right"
              cardCount={otherHandCounts[rightOpponent] ?? 0}
              nickname={players[rightOpponent]?.nickname ?? ''}
              tichu={tichuDeclarations[rightOpponent]}
              isCurrentTurn={currentTurn === rightOpponent}
              finished={finishOrder.includes(rightOpponent)}
              passed={passedSeats.includes(rightOpponent)}
              connected={players[rightOpponent]?.connected ?? true}
              isPartner={false}
              nickColor="#C084FC"
              trickWon={trickWonEvent?.winningSeat === rightOpponent ? { points: trickWonEvent.points } : null}
              onLongPress={() => {
                const p = players[rightOpponent];
                if (p && !p.isBot && p.dbUserId) setReportTarget({ seat: rightOpponent, nickname: p.nickname, dbUserId: p.dbUserId });
              }}
            />
          </View>
        </View>
      </View>
      {/* 티츄 선언 + 이모티콘 (박스 위) */}
      {(tichuDeclarations[mySeat] || canDeclareTichu) && (
        <View style={styles.topActionRow}>
          {tichuDeclarations[mySeat] ? (
            <View style={[styles.tichuIndicator, tichuDeclarations[mySeat] === 'large' && styles.tichuIndicatorLarge]}>
              <Text style={styles.tichuIndicatorText}>
                {tichuDeclarations[mySeat] === 'large' ? '🔥 라지 티츄' : '⭐ 스몰 티츄'}
              </Text>
            </View>
          ) : (
            <View>
              <TichuPulseButton onPress={handleSmallTichuPress} />
            </View>
          )}
          <EmoteButton onSend={(emoji, label) => onSendEmote?.(emoji, label)} />
        </View>
      )}
      {/* Bottom area: error, turn indicator, timer, actions, hand */}
      <Animated.View style={[styles.bottomArea, bottomGlowStyle, urgencyStyle]}>
        {/* 에러 메시지 */}
        {errorMsg && (
          <View style={[styles.errorBanner, errorShakeStyle]}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
        {/* 턴 + 원형 타이머 + 액션바 통합 */}
        <View style={styles.turnAndActions}>
          <View style={styles.timerAndButtonsRow}>
            {/* 원형 타이머 */}
            {phase === 'TRICK_PLAY' && remainingSec > 0 && (
              <CircleTimer
                remainingSec={remainingSec}
                totalSec={Math.ceil(turnDuration / 1000)}
                playerName={currentPlayerNick}
                isMyTurn={isMyTurn}
                seatColor={currentSeatColor}
              />
            )}
            {/* 액션 버튼 */}
            <View style={styles.actionRow}>
              <ActionBar
                onPlay={handlePlayWithGuard}
                onPass={onPass}
                onDeclareTichu={(type) => onDeclareTichu(type)}
                onSubmitBomb={onSubmitBombCards ?? (() => {})}
              />
            </View>
          </View>
        </View>
        <PlayerHand />
      </Animated.View>
      {/* 모달 */}
      <LargeTichuModal
        onDeclare={() => onDeclareTichu('large')}
        onPass={onPassTichu}
      />
      <DragonGiveModal onGive={onDragonGive} />
      <ReportModal
        visible={reportTarget !== null}
        targetNickname={reportTarget?.nickname ?? ''}
        onClose={() => setReportTarget(null)}
        onSubmit={(reason, description) => {
          if (reportTarget && onReportUser) {
            onReportUser(reportTarget.dbUserId, reason, description);
            showToast('신고가 접수되었습니다.');
          }
          setReportTarget(null);
        }}
      />
      {/* 교환 결과 오버레이 (3초간 표시) */}
      {exchangeReceived && (
        <View style={styles.exchangeOverlay}>
          <View style={styles.exchangeModal}>
            <Text style={styles.exchangeTitle}>받은 카드</Text>
            <View style={styles.exchangeCards}>
              <View style={styles.exchangeSlot}>
                <Text style={styles.exchangeLabel}>{'\u2190'} 왼쪽에서</Text>
                <CardView card={exchangeReceived.fromLeft} size="normal" />
              </View>
              <View style={styles.exchangeSlot}>
                <Text style={styles.exchangeLabel}>{'\u2191'} 파트너에서</Text>
                <CardView card={exchangeReceived.fromPartner} size="normal" />
              </View>
              <View style={styles.exchangeSlot}>
                <Text style={styles.exchangeLabel}>{'\u2192'} 오른쪽에서</Text>
                <CardView card={exchangeReceived.fromRight} size="normal" />
              </View>
            </View>
          </View>
        </View>
      )}
      {/* 스몰 티츄 선언 확인 모달 — 실수 방지. 이기면 +100, 실패 시 -100.
          RN 0.76 Bridgeless 에서 native Modal 은 focus-steal 버그 있어 금지 (CLAUDE.md §14.2). */}
      {showTichuConfirm && (
        <View style={styles.tichuConfirmOverlay}>
          <View style={styles.tichuConfirmBox}>
            <Text style={styles.tichuConfirmIcon}>{'⭐'}</Text>
            <Text style={styles.tichuConfirmTitle}>{'스몰 티츄 선언'}</Text>
            <Text style={styles.tichuConfirmDesc}>
              {'정말 스몰 티츄를 선언하시겠습니까?'}
            </Text>
            <View style={styles.tichuConfirmRewardRow}>
              <View style={styles.tichuConfirmRewardCol}>
                <Text style={styles.tichuConfirmRewardLabelOk}>{'성공'}</Text>
                <Text style={styles.tichuConfirmRewardValOk}>{'+100'}</Text>
              </View>
              <View style={styles.tichuConfirmRewardCol}>
                <Text style={styles.tichuConfirmRewardLabelFail}>{'실패'}</Text>
                <Text style={styles.tichuConfirmRewardValFail}>{'−100'}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.hintDontShowRow}
              onPress={() => setTichuDontShowAgain(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.hintCheckbox, tichuDontShowAgain && styles.hintCheckboxOn]}>
                {tichuDontShowAgain && <Text style={styles.hintCheckMark}>{'✓'}</Text>}
              </View>
              <Text style={styles.hintDontShowText}>{'다시 표시하지 않기'}</Text>
            </TouchableOpacity>
            <View style={styles.tichuConfirmBtns}>
              <TouchableOpacity
                style={[styles.tichuConfirmBtn, styles.tichuConfirmBtnCancel]}
                onPress={() => {
                  if (tichuDontShowAgain) setSetting('smallTichuHintOn', false);
                  setShowTichuConfirm(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.tichuConfirmBtnCancelText}>{'취소'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tichuConfirmBtn, styles.tichuConfirmBtnOk]}
                onPress={() => {
                  if (tichuDontShowAgain) setSetting('smallTichuHintOn', false);
                  setShowTichuConfirm(false);
                  onDeclareTichu('small');
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.tichuConfirmBtnOkText}>{'선언'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 파트너 트릭 막기 경고 모달 — 팀원이 방금 낸 카드 위에 내가 또 낼 때.
          일반적으로 파트너가 이기게 놔두는 게 팀에 유리하므로 실수 방지용 안내. */}
      {pendingPartnerBlock && (
        <View style={styles.tichuConfirmOverlay}>
          <View style={styles.tichuConfirmBox}>
            <Text style={styles.tichuConfirmIcon}>{'⚠️'}</Text>
            <Text style={styles.tichuConfirmTitle}>{'팀원 트릭 막기'}</Text>
            <Text style={styles.tichuConfirmDesc}>
              {'파트너가 이기고 있는 트릭에\n카드를 내시겠습니까?'}
            </Text>
            <TouchableOpacity
              style={styles.hintDontShowRow}
              onPress={() => setPartnerDontShowAgain(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.hintCheckbox, partnerDontShowAgain && styles.hintCheckboxOn]}>
                {partnerDontShowAgain && <Text style={styles.hintCheckMark}>{'✓'}</Text>}
              </View>
              <Text style={styles.hintDontShowText}>{'다시 표시하지 않기'}</Text>
            </TouchableOpacity>
            <View style={styles.tichuConfirmBtns}>
              <TouchableOpacity
                style={[styles.tichuConfirmBtn, styles.tichuConfirmBtnCancel]}
                onPress={() => {
                  if (partnerDontShowAgain) setSetting('partnerBlockHintOn', false);
                  setPendingPartnerBlock(null);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.tichuConfirmBtnCancelText}>{'취소'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tichuConfirmBtn, styles.tichuConfirmBtnOk]}
                onPress={() => {
                  if (partnerDontShowAgain) setSetting('partnerBlockHintOn', false);
                  const p = pendingPartnerBlock;
                  setPendingPartnerBlock(null);
                  onPlay(p.cards, p.phoenixAs, p.wish);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.tichuConfirmBtnOkText}>{'내기'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      {/* 트릭 승리 / 패스 팝업은 TableArea 안에서 표시 */}
      {/* 티츄 선언 중앙 폭발 팝업 */}
      {tichuFlash && (
        <View style={styles.tichuFlashOverlay} pointerEvents="none">
          <View style={[
            styles.tichuFlashBox,
            tichuFlash.type === 'large' && styles.tichuFlashBoxLarge,
          ]}>
            <Text style={styles.tichuFlashEmoji}>
              {tichuFlash.type === 'large' ? '🔥' : '⭐'}
            </Text>
            <Text style={styles.tichuFlashTitle}>
              {tichuFlash.type === 'large' ? '라지 티츄!' : '스몰 티츄!'}
            </Text>
            <Text style={styles.tichuFlashName}>
              {seatName(tichuFlash.seat)}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
    </View>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case 'DEALING_8': return '딜링...';
    case 'LARGE_TICHU_WINDOW': return '라지 티츄';
    case 'DEALING_6': return '추가 분배...';
    case 'PASSING': return '교환';
    case 'TRICK_PLAY': return '플레이';
    case 'ROUND_END': return '라운드 종료';
    case 'SCORING': return '정산';
    default: return '';
  }
}

const styles = StyleSheet.create({
  outerBg: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    flexDirection: 'column',
    overflow: 'hidden',
    ...(isMobile ? {} : { maxWidth: 900, width: '100%', alignSelf: 'center' as const }),
  },
  // 카메라홀 회피를 container paddingTop 으로 주면 아래가 밀려서 내 패 / 파트너가
  // 화면 밖으로 잘림 (container 는 flex:1 + overflow:hidden). 상단 topBar 에만
  // margin 으로 inset 을 먹여서 실제 레이아웃 높이는 그대로 유지.
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: mob(4, 8),
    paddingTop: mob(1, 2) + ANDROID_TOP_INSET,
    paddingBottom: mob(0, 1),
  },
  partnerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topBarRight: {
    minWidth: mob(40, 60),
  },
  middleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  sideOpponent: {
    width: mob(56, 72),
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible' as const,
    paddingHorizontal: mob(2, 4),
  },
  tableCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableCenterGlow: {
    borderWidth: 0,
    borderRadius: 16,
    marginVertical: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    elevation: 8,
  },
  bottomArea: {
    paddingBottom: mob(2, 8),
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitTitle: {
    color: COLORS.text,
    fontSize: FONT.xxl,
    fontWeight: 'bold',
  },
  waitText: {
    color: COLORS.textDim,
    fontSize: FONT.lg,
    marginTop: 8,
  },
  addBotsBtn: {
    backgroundColor: 'rgba(46,204,113,0.15)',
    borderWidth: 1.5,
    borderColor: '#2ecc71',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  addBotsText: {
    color: '#2ecc71',
    fontWeight: 'bold',
    fontSize: FONT.md,
  },
  resultContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  gameOverBanner: {
    color: '#FFD700',
    fontSize: FONT.xxl,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(255,215,0,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  winnerBox: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.08)',
    marginBottom: 12,
  },
  winnerTeamText: {
    fontSize: FONT.xl,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  finalScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  finalScoreTeam: {
    alignItems: 'center',
  },
  finalScoreLabel: {
    fontSize: FONT.md,
    fontWeight: '600',
  },
  finalScoreValue: {
    fontSize: FONT.xxl,
    fontWeight: 'bold',
  },
  finalScoreDivider: {
    color: COLORS.textDim,
    fontSize: FONT.xxl,
    fontWeight: 'bold',
  },
  backToLobbyBtn: {
    backgroundColor: 'rgba(46,204,113,0.15)',
    borderWidth: 1.5,
    borderColor: '#2ecc71',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    alignSelf: 'center',
    marginTop: 16,
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  backToLobbyText: {
    color: '#2ecc71',
    fontWeight: 'bold',
    fontSize: FONT.lg,
  },
  roundTitle: {
    color: COLORS.accent,
    fontSize: FONT.xl,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  detailSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  detailSectionTitle: {
    color: COLORS.textDim,
    fontSize: FONT.sm,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  detailSubTitle: {
    color: COLORS.textDim,
    fontSize: FONT.sm,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailLabel: {
    color: COLORS.textDim,
    fontSize: FONT.md,
  },
  detailValue: {
    color: COLORS.text,
    fontSize: FONT.md,
    fontWeight: '600',
  },
  oneTwoText: {
    color: '#FFD700',
    fontSize: FONT.lg,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  finishOrderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  finishOrderItem: {
    alignItems: 'center',
    gap: 2,
  },
  finishRank: {
    color: COLORS.textDim,
    fontSize: FONT.sm,
    fontWeight: '600',
  },
  finishRankFirst: {
    color: '#FFD700',
  },
  finishName: {
    color: COLORS.text,
    fontSize: FONT.md,
    fontWeight: '600',
  },
  finishNameFirst: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  cardPointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 4,
  },
  cardPointsTeam: {
    alignItems: 'center',
  },
  cardPointsLabel: {
    fontSize: FONT.sm,
    fontWeight: '600',
  },
  cardPointsValue: {
    fontSize: FONT.lg,
    fontWeight: 'bold',
  },
  tichuBonusText: {
    fontSize: FONT.md,
    fontWeight: '600',
    marginBottom: 2,
  },
  roundScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  roundScoreTeam: {
    fontSize: FONT.lg,
    fontWeight: 'bold',
  },
  errorBanner: {
    backgroundColor: 'rgba(211, 47, 47, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,0,0,0.3)',
  },
  errorText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: FONT.sm,
  },
  turnAndActions: {
    alignItems: 'stretch',
    paddingHorizontal: 8,
    paddingVertical: mob(1, 2),
    position: 'relative',
  },
  timerAndButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionRow: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  tichuDeclareBtn: {
    backgroundColor: 'rgba(243,156,18,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(243,156,18,0.4)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tichuDeclareBtnText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '800',
  },
  // 하단 티츄 인디케이터 (작게)
  tichuIndicator: {
    flexDirection: 'row',
    backgroundColor: 'rgba(243,156,18,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(243,156,18,0.4)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 4,
  },
  tichuIndicatorLarge: {
    backgroundColor: 'rgba(231,76,60,0.15)',
    borderColor: 'rgba(231,76,60,0.4)',
  },
  tichuIndicatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  // 중앙 폭발 팝업
  tichuFlashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  tichuFlashBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(243,156,18,0.15)',
    borderWidth: 3,
    borderColor: '#f39c12',
    borderRadius: 24,
    paddingHorizontal: 40,
    paddingVertical: 24,
    shadowColor: '#f39c12',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  tichuFlashBoxLarge: {
    backgroundColor: 'rgba(231,76,60,0.15)',
    borderColor: '#e74c3c',
    shadowColor: '#e74c3c',
  },
  tichuFlashEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  tichuFlashTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  tichuFlashName: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  // 내 프로필
  myProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  myAvatar: {
    width: mob(28, 34),
    height: mob(28, 34),
    borderRadius: mob(14, 17),
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 2,
    borderColor: COLORS.team1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myAvatarActive: {
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 6,
  },
  myAvatarEmoji: {
    fontSize: mob(14, 18),
  },
  myNickname: {
    color: '#fff',
    fontSize: mob(11, 13),
    fontWeight: '700',
  },
  myTichuMini: {
    backgroundColor: 'rgba(243,156,18,0.2)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  myTichuMiniLarge: {
    backgroundColor: 'rgba(231,76,60,0.2)',
  },
  myTichuMiniText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '900',
  },
  // 교환 결과 오버레이
  exchangeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  exchangeModal: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  exchangeTitle: {
    color: COLORS.accent,
    fontSize: FONT.xl,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  exchangeCards: {
    flexDirection: 'row',
    gap: 20,
  },
  exchangeSlot: {
    alignItems: 'center',
    gap: 6,
  },
  exchangeLabel: {
    color: COLORS.textDim,
    fontSize: FONT.sm,
  },

  // ─── 스몰 티츄 확인 모달 ───
  tichuConfirmOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
    paddingHorizontal: 24,
  },
  tichuConfirmBox: {
    backgroundColor: COLORS.bgDark,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(245,158,11,0.5)',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 20,
  },
  tichuConfirmIcon: { fontSize: 44, marginBottom: 6 },
  tichuConfirmTitle: { color: '#F59E0B', fontSize: 20, fontWeight: '900', marginBottom: 10 },
  tichuConfirmDesc: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14, lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  tichuConfirmRewardRow: {
    flexDirection: 'row', gap: 20,
    marginBottom: 22,
  },
  tichuConfirmRewardCol: {
    alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    minWidth: 80,
  },
  tichuConfirmRewardLabelOk: { color: '#10b981', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  tichuConfirmRewardValOk: { color: '#10b981', fontSize: 20, fontWeight: '900' },
  tichuConfirmRewardLabelFail: { color: '#ef4444', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  tichuConfirmRewardValFail: { color: '#ef4444', fontSize: 20, fontWeight: '900' },
  hintDontShowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
  },
  hintCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  hintCheckboxOn: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  hintCheckMark: {
    color: '#0a1910',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  hintDontShowText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  tichuConfirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  tichuConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  tichuConfirmBtnCancel: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tichuConfirmBtnCancelText: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '700' },
  tichuConfirmBtnOk: {
    backgroundColor: '#D97706',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  tichuConfirmBtnOkText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
