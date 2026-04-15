import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { isMobile, mob } from '../utils/responsive';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  FadeIn,
  ZoomIn,
  Easing,
} from 'react-native-reanimated';
import { COLORS, FONT } from '../utils/theme';

interface OpponentHandProps {
  cardCount: number;
  nickname: string;
  tichu: 'large' | 'small' | null;
  isCurrentTurn: boolean;
  finished: boolean;
  passed: boolean;
  position: 'left' | 'top' | 'right';
  connected?: boolean;
  isPartner?: boolean;
  nickColor?: string;
  trickWon?: { points: number } | null;
  /** 길게 눌렀을 때 — 신고 모달 오픈용 */
  onLongPress?: () => void;
}

// 동물 아바타 매핑 (이름 해시 기반)
const AVATARS = [
  { emoji: '\uD83E\uDD81', bg: '#4a2c1a' }, // 사자
  { emoji: '\uD83D\uDC3B', bg: '#3b2418' }, // 곰
  { emoji: '\uD83E\uDD8A', bg: '#4a3020' }, // 여우
  { emoji: '\uD83D\uDC3A', bg: '#2a3040' }, // 늑대
  { emoji: '\uD83E\uDD85', bg: '#3a2838' }, // 독수리
  { emoji: '\uD83D\uDC2F', bg: '#3a3018' }, // 호랑이
  { emoji: '\uD83D\uDC32', bg: '#1a3028' }, // 용
  { emoji: '\uD83E\uDD89', bg: '#2a2838' }, // 올빼미
];

const EMOTES = ['\uD83D\uDC4D', '\uD83D\uDE02', '\uD83D\uDE31', '\uD83E\uDD14', '\uD83D\uDD25'];

function getAvatar(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AVATARS[Math.abs(hash) % AVATARS.length]!;
}

export function OpponentHand({
  cardCount, nickname, tichu, isCurrentTurn, finished, passed, position, connected = true, isPartner = false, nickColor, trickWon = null, onLongPress,
}: OpponentHandProps) {
  const [emote, setEmote] = useState<string | null>(null);
  const [passBubble, setPassBubble] = useState(false);
  const prevPassedRef = useRef(false);
  const [wonBubble, setWonBubble] = useState<number | null>(null);

  // 패스 말풍선: passed가 false→true로 바뀔 때 표시
  useEffect(() => {
    if (passed && !prevPassedRef.current) {
      setPassBubble(true);
      setTimeout(() => setPassBubble(false), 1200);
    }
    prevPassedRef.current = passed;
  }, [passed]);

  // 트릭 승리 말풍선
  useEffect(() => {
    if (trickWon) {
      setWonBubble(trickWon.points);
      setTimeout(() => setWonBubble(null), 2000);
    }
  }, [trickWon]);

  // 턴 pulse
  const pulseScale = useSharedValue(1);
  const ringGlow = useSharedValue(0);

  useEffect(() => {
    if (isCurrentTurn) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false,
      );
      ringGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600 }),
          withTiming(0.4, { duration: 600 }),
        ),
        -1, false,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
      ringGlow.value = withTiming(0, { duration: 200 });
    }
  }, [isCurrentTurn]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: ringGlow.value,
  }));

  const teamBorderColor = isPartner ? COLORS.team1 : COLORS.team2;
  const avatar = getAvatar(nickname);

  // 이모트 표시 후 자동 사라짐
  const showEmote = (e: string) => {
    setEmote(e);
    setTimeout(() => setEmote(null), 2000);
  };

  // 파트너: 아바타를 카드 왼쪽에 가로 배치
  if (isPartner) {
    return (
      <Pressable onLongPress={onLongPress} delayLongPress={500} style={[styles.partnerRow, finished && styles.finishedContainer]}>
        {/* 좌: 아바타 + 이름 */}
        <View style={styles.partnerLeft}>
          {passBubble && (
            <View style={styles.passBubble}>
              <Text style={styles.passBubbleText}>패스!</Text>
            </View>
          )}
          <View style={[
            styles.avatarOuter,
            { borderColor: teamBorderColor },
            isCurrentTurn && styles.avatarOuterActive,
            isCurrentTurn && { shadowColor: teamBorderColor, shadowOpacity: 0.6 },
            isCurrentTurn && pulseStyle,
            isCurrentTurn && glowStyle,
            tichu && styles.avatarTichuGlow,
            tichu === 'large' && styles.avatarTichuGlowLarge,
          ]}>
            <View style={[styles.avatarInner, { backgroundColor: avatar.bg }]}>
              <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
            </View>
          </View>
          <Text style={[styles.nickname, !connected && styles.nicknameDimmed, nickColor ? { color: nickColor } : undefined]} numberOfLines={1} ellipsizeMode="tail">{nickname}</Text>
          {tichu && (
            <View style={[styles.tichuBadge, tichu === 'large' && styles.tichuLarge]}>
              <Text style={styles.tichuText} numberOfLines={1}>{tichu === 'large' ? '🔥 라지' : '⭐ 스몰'}</Text>
            </View>
          )}
        </View>
        {/* 우: 카드 더미 */}
        {!finished ? (
          <View style={styles.deckWrap}>
            <View style={styles.deckStack}>
              <View style={[styles.deckCard, styles.deckCard3]} />
              <View style={[styles.deckCard, styles.deckCard2]} />
              <View style={[styles.deckCard, styles.deckCard1]} />
            </View>
            <Text style={[styles.deckNum, cardCount <= 3 && styles.deckNumDanger]}>{cardCount}</Text>
          </View>
        ) : (
          <View style={styles.outBadge}><Text style={styles.outText}>OUT</Text></View>
        )}
        {!finished && passed && (
          <View style={styles.passBadge}>
            <Text style={styles.passText}>패스!</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={500} style={[styles.container, finished && styles.finishedContainer]}>
      {/* 패스 말풍선 — flow 배치, 아바타 위에 자연스럽게 */}
      {passBubble && (
        <View style={styles.passBubble}>
          <Text style={styles.passBubbleText}>패스!</Text>
        </View>
      )}
      {/* 이모트 말풍선 */}
      {emote && (
        <View style={styles.emoteBubble}>
          <Text style={styles.emoteText}>{emote}</Text>
          <View style={styles.emoteTail} />
        </View>
      )}
      {/* 이름 (아바타 위) */}
      <Text style={[styles.nickname, !connected && styles.nicknameDimmed, nickColor ? { color: nickColor } : undefined]} numberOfLines={1} ellipsizeMode="tail">
        {nickname}
      </Text>
      {/* 아바타 프레임 */}
      <View style={styles.avatarFrame}>
        <View style={[
          styles.avatarOuter,
          { borderColor: teamBorderColor },
          isCurrentTurn && styles.avatarOuterActive,
          isCurrentTurn && pulseStyle,
          isCurrentTurn && glowStyle,
          tichu && styles.avatarTichuGlow,
          tichu === 'large' && styles.avatarTichuGlowLarge,
        ]}>
          <View style={[styles.avatarInner, { backgroundColor: avatar.bg }]}>
            <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
          </View>
        </View>
      </View>
      {/* 카드 더미 + 숫자 */}
      {!finished && (
        <View style={styles.deckWrap}>
          <View style={styles.deckStack}>
            <View style={[styles.deckCard, styles.deckCard3]} />
            <View style={[styles.deckCard, styles.deckCard2]} />
            <View style={[styles.deckCard, styles.deckCard1]} />
          </View>
          <Text style={[styles.deckNum, cardCount <= 3 && styles.deckNumDanger]}>{cardCount}</Text>
        </View>
      )}
      {/* 상태 뱃지들 */}
      {finished ? (
        <View style={styles.outBadge}>
          <Text style={styles.outText}>OUT</Text>
        </View>
      ) : (
        <>
          {tichu && (
            <View style={[styles.tichuBadge, tichu === 'large' && styles.tichuLarge]}>
              <Text style={styles.tichuText} numberOfLines={1}>
                {tichu === 'large' ? '🔥 라지' : '⭐ 스몰'}
              </Text>
            </View>
          )}
          {passed && (
            <View style={styles.passBadge}>
              <Text style={styles.passText}>패스!</Text>
            </View>
          )}
        </>
      )}
      {/* 이모트 버튼 (제거) */}
      {false && !finished && (
        <View style={styles.emoteRow}>
          {EMOTES.slice(0, 3).map((e, i) => (
            <TouchableOpacity key={i} onPress={() => showEmote(e)} style={styles.emoteBtn}>
              <Text style={styles.emoteBtnText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 파트너 가로 레이아웃
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: mob(6, 10),
  },
  partnerLeft: {
    alignItems: 'center',
    gap: 2,
  },
  container: {
    alignItems: 'center',
    padding: 2,
    gap: 2,
    overflow: 'visible' as const,
  },
  finishedContainer: {
    opacity: 0.35,
  },

  // 아바타 프레임
  avatarFrame: {
    position: 'relative',
  },
  avatarOuter: {
    width: mob(32, 48),
    height: mob(32, 48),
    borderRadius: mob(16, 24),
    borderWidth: mob(2, 3),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  avatarOuterActive: {
    shadowRadius: 16,
    elevation: 12,
  },
  avatarInner: {
    width: mob(26, 40),
    height: mob(26, 40),
    borderRadius: mob(13, 20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: mob(16, 24),
  },

  // 카드 더미 + 숫자
  deckWrap: {
    alignItems: 'center',
    marginTop: 2,
  },
  deckStack: {
    width: mob(28, 36),
    height: mob(22, 28),
    position: 'relative',
  },
  deckCard: {
    position: 'absolute',
    width: mob(18, 24),
    height: mob(26, 32),
    backgroundColor: '#e8e0d0',
    borderRadius: mob(3, 4),
    borderWidth: 1,
    borderTopColor: '#f5f0e8',
    borderLeftColor: '#e0d8c8',
    borderRightColor: '#c8c0b0',
    borderBottomColor: '#b8b0a0',
  },
  deckCard1: { top: 0, left: mob(5, 6), zIndex: 3 },
  deckCard2: { top: -2, left: mob(3, 3), zIndex: 2, opacity: 0.7 },
  deckCard3: { top: -4, left: mob(1, 0), zIndex: 1, opacity: 0.4 },
  deckNum: {
    color: '#fff',
    fontSize: mob(18, 20),
    fontWeight: '900',
    marginTop: mob(2, 4),
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  deckNumDanger: {
    color: '#ef4444',
  },

  nickname: {
    color: COLORS.text,
    fontSize: mob(9, 12),
    fontWeight: 'bold',
    maxWidth: mob(52, 80),
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  nicknameDimmed: {
    color: '#607d6b',
    opacity: 0.6,
  },

  // OUT
  outBadge: {
    backgroundColor: 'rgba(120,144,156,0.15)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#78909c',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  outText: {
    color: '#78909c',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // 티츄 — 상주 표시를 명확하게. 라지 = 빨강 펄스, 스몰 = 골드.
  // alignSelf:center + flexShrink:0 로 부모 sideOpponent 의 좁은 컬럼 폭 (56-72dp)
  // 안에서 텍스트가 세로로 잘리지 않게 함. 부모 overflow visible 로 좌우 overflow 허용.
  tichuBadge: {
    alignSelf: 'center',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(243,156,18,0.35)',
    borderWidth: 1.5,
    borderColor: '#f39c12',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    shadowColor: '#f39c12',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  tichuLarge: {
    backgroundColor: 'rgba(231,76,60,0.4)',
    borderColor: '#e74c3c',
    shadowColor: '#e74c3c',
  },
  tichuText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // 티츄 선언자 아바타 글로우 — 라운드 내내 지속
  avatarTichuGlow: {
    shadowColor: '#f39c12',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 10,
    borderWidth: 3,
    borderColor: '#f39c12',
  },
  avatarTichuGlowLarge: {
    shadowColor: '#e74c3c',
    borderColor: '#e74c3c',
  },

  // 트릭 승리 말풍선
  wonBubble: {
    position: 'absolute',
    top: mob(-28, -50),
    left: mob(-14, -40),
    zIndex: 100,
    backgroundColor: 'rgba(16,185,129,0.9)',
    borderRadius: mob(10, 14),
    paddingHorizontal: mob(10, 24),
    paddingVertical: mob(4, 10),
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 8,
    width: mob(65, 120),
    alignItems: 'center' as const,
  },
  wonBubbleText: {
    color: '#fff',
    fontSize: mob(12, 22),
    fontWeight: '900',
  },
  // 패스 말풍선 — absolute로 부모 너비에 종속되지 않음
  passBubble: {
    position: 'absolute',
    top: mob(-20, -28),
    left: '50%',
    transform: [{ translateX: '-50%' }],
    backgroundColor: 'rgba(100,116,139,0.9)',
    borderRadius: mob(8, 12),
    paddingHorizontal: mob(8, 14),
    paddingVertical: mob(2, 4),
    zIndex: 20,
    alignItems: 'center',
  } as any,
  passBubbleText: {
    color: '#fff',
    fontSize: mob(10, 16),
    fontWeight: '900',
    whiteSpace: 'nowrap',
  } as any,
  // 패스 뱃지 (작은 표시)
  passBadge: {
    backgroundColor: 'rgba(120,144,156,0.4)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  passText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // 이모트 말풍선
  emoteBubble: {
    position: 'absolute',
    top: -30,
    zIndex: 100,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  emoteTail: {
    position: 'absolute',
    bottom: -5,
    alignSelf: 'center',
    left: '45%' as any,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255,255,255,0.95)',
  },
  emoteText: {
    fontSize: 20,
  },

  // 이모트 버튼
  emoteRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 1,
  },
  emoteBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoteBtnText: {
    fontSize: 11,
  },
});
