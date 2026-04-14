import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  ZoomIn,
  SlideInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useGameStore } from '../stores/gameStore';
import { CardView } from './CardView';
import { mob, isMobile } from '../utils/responsive';
import { COLORS, FONT } from '../utils/theme';

export function TableArea() {
  const rawTableCards = useGameStore((s) => s.tableCards);
  const dogLeadDisplay = useGameStore((s) => s.dogLeadDisplay);
  const tableCards = rawTableCards ?? dogLeadDisplay; // 개 리드 시 1.5초간 표시
  const wish = useGameStore((s) => s.wish);
  const lastPlay = useGameStore((s) => s.lastPlayEvent);
  const players = useGameStore((s) => s.players);
  const currentTurn = useGameStore((s) => s.currentTurn);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const mySeat = useGameStore((s) => s.mySeat);
  const phase = useGameStore((s) => s.phase);

  // 턴 플레이어가 파트너인지 상대인지
  const isPartnerTurn = !isMyTurn && ((currentTurn + 2) % 4 === mySeat);
  const isEnemyTurn = !isMyTurn && !isPartnerTurn;

  // 테이블 카드 변경 시 key를 바꿔서 entering 애니메이션 재실행
  const tableKeyRef = useRef(0);
  const prevRawRef = useRef(rawTableCards);
  const prevDogRef = useRef(dogLeadDisplay);
  if (rawTableCards !== prevRawRef.current || dogLeadDisplay !== prevDogRef.current) {
    tableKeyRef.current += 1;
    prevRawRef.current = rawTableCards;
    prevDogRef.current = dogLeadDisplay;
  }

  // 새 트릭 감지 (카드가 null로 바뀔 때 = 수거됨)
  const prevHadCards = useRef(false);
  const showCollectAnim = useRef(false);
  if (!tableCards && prevHadCards.current) {
    showCollectAnim.current = true;
  } else if (tableCards) {
    showCollectAnim.current = false;
  }
  prevHadCards.current = !!tableCards;

  // 폭탄/SF 이펙트
  const isBomb = tableCards?.type === 'four_bomb' || tableCards?.type === 'straight_flush_bomb';
  const bombGlow = useSharedValue(0);

  useEffect(() => {
    if (isBomb) {
      bombGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      bombGlow.value = withTiming(0, { duration: 200 });
    }
  }, [isBomb]);

  const bombGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: isBomb ? bombGlow.value * 0.8 : 0,
  }));

  const turnName = players[currentTurn]?.nickname ?? '...';

  // 상대팀 이름 색상: 좌측 상대=라임, 우측 상대=보라
  const leftEnemy = (mySeat + 1) % 4;
  const enemyNameColor = currentTurn === leftEnemy ? '#A3E635' : '#C084FC';

  return (
    <View style={styles.outerContainer}>
      {/* 중앙 컨텐츠 (턴 배너 + 카드) */}
      <View style={styles.centerContent}>
        {/* 턴 표시 */}
        {phase === 'TRICK_PLAY' && (
          <Animated.View
            key={`turn-${currentTurn}`}
            entering={ZoomIn.duration(250).springify()}
            style={[
              styles.turnBanner,
              isMyTurn && styles.turnBannerMine,
              isPartnerTurn && styles.turnBannerPartner,
              isEnemyTurn && styles.turnBannerEnemy,
            ]}
          >
            {isMyTurn ? (
              <Text style={[styles.turnText, styles.turnTextWhite]}>{'내 차례!'}</Text>
            ) : (
              <Text style={styles.turnText}>
                <Text style={[styles.turnNameHighlight, isEnemyTurn && { color: enemyNameColor }]}>{turnName}</Text>
                <Text style={styles.turnSuffix}>{'의 차례'}</Text>
              </Text>
            )}
          </Animated.View>
        )}
        {/* 소원 표시 */}
      {wish && (
        <Animated.View entering={ZoomIn.duration(300).springify()} style={styles.wishBanner}>
          <Text style={styles.wishIcon}>{'\u{1F004}'}</Text>
          <View>
            <Text style={styles.wishLabel}>소원 활성</Text>
            <Text style={styles.wishRank}>{wish}</Text>
          </View>
        </Animated.View>
      )}
      {/* 바닥 카드 - 등장 애니메이션 */}
      {tableCards ? (
        <Animated.View
          key={`table-${tableKeyRef.current}`}
          entering={SlideInDown.duration(250).springify().damping(14).stiffness(120)}
        >
          {/* 후광 이펙트 */}
          <Animated.View style={[
            styles.glowRipple,
            isBomb && styles.glowRippleBomb,
            bombGlowStyle,
          ]} />
          <View style={styles.cardsRow}>
            {tableCards.cards.map((card, i) => (
              <Animated.View
                key={i}
                entering={ZoomIn.delay(i * 40).duration(200).springify()}
                style={[
                  styles.tableCard,
                  i > 0 && styles.tableCardOverlap,
                  isBomb && styles.bombCard,
                  { zIndex: i },
                ]}
              >
                <CardView card={card} size={isMobile ? 'normal' : 'large'} disabled />
              </Animated.View>
            ))}
          </View>
          {lastPlay && (
            <Animated.Text
              entering={FadeIn.delay(150).duration(200)}
              style={styles.playInfo}
            >
              {lastPlay.hand.value === 0 && lastPlay.hand.cards.some((c: any) => c.type === 'special' && c.specialType === 'dog')
                ? `${players[lastPlay.seat]?.nickname ?? '?'} \u2192 \uD83D\uDC15 \uD30C\uD2B8\uB108\uC5D0\uAC8C \uB9AC\uB4DC \uC774\uC804`
                // 봉황 싱글 (value % 1 !== 0) 은 valueLabel 이 이미 "봉황 (11.5)" 같은
                // 완성된 라벨을 반환하므로 "싱글" 접미사 추가 안 함.
                : `${players[lastPlay.seat]?.nickname ?? '?'} \u2192 ${valueLabel(lastPlay.hand.value)}${lastPlay.hand.type !== 'single' || (lastPlay.hand.value >= 2 && lastPlay.hand.value <= 14 && lastPlay.hand.value % 1 === 0) ? ` ${handTypeLabel(lastPlay.hand.type)}` : ''}`
              }
            </Animated.Text>
          )}
        </Animated.View>
      ) : (
        <Animated.View
          key={`empty-${tableKeyRef.current}`}
          entering={FadeIn.duration(300)}
        >
          <Text style={styles.emptyText}>
            {phase === 'TRICK_PLAY' ? '새 트릭' : ''}
          </Text>
        </Animated.View>
      )}
      </View>
    </View>
  );
}

function valueLabel(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 999 || v === Infinity || !isFinite(v)) return '용';
  if (v === 0) return '개';
  if (v === 1) return '참새';
  // 봉황 싱글: value 는 직전 카드값 + 0.5 (리드 시엔 1.5).
  // 예: J(11) 위에 봉황 → 11.5, A(14) 위에 봉황 → 14.5, 리드 → 1.5.
  // 직전 랭크명 + 실제 값 모두 표시 → 사람이 즉시 강도 파악 가능.
  if (v % 1 !== 0) {
    if (v === 1.5) return '봉황 (리드 · 1.5)';
    const prev = Math.floor(v);
    const prevName =
      prev === 11 ? 'J' :
      prev === 12 ? 'Q' :
      prev === 13 ? 'K' :
      prev === 14 ? 'A' :
      String(prev);
    return `봉황 (${prevName} 위 · ${v})`;
  }
  if (v === 11) return 'J';
  if (v === 12) return 'Q';
  if (v === 13) return 'K';
  if (v === 14) return 'A';
  return String(v);
}

function handTypeLabel(type: string): string {
  switch (type) {
    case 'single': return '싱글';
    case 'pair': return '페어';
    case 'steps': return '연속 페어';
    case 'triple': return '트리플';
    case 'fullhouse': return '풀하우스';
    case 'straight': return '스트레이트';
    case 'four_bomb': return '폭탄!';
    case 'straight_flush_bomb': return 'SF 폭탄!!';
    default: return type;
  }
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    flexDirection: 'column',
    padding: mob(0, 8),
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: mob(0, 30),
  },
  turnBanner: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: mob(16, 28),
    paddingVertical: mob(4, 10),
    borderRadius: mob(16, 24),
    marginBottom: mob(2, 10),
    transform: [{ translateY: mob(-10, -20) }],
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  turnBannerMine: {
    backgroundColor: 'rgba(243,156,18,0.9)',
    borderColor: '#ffca28',
    shadowColor: '#f39c12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 10,
  },
  turnBannerPartner: {
    backgroundColor: 'rgba(59,130,246,0.85)',
    borderColor: 'rgba(96,165,250,0.5)',
    shadowColor: COLORS.team1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 8,
  },
  turnBannerEnemy: {
    backgroundColor: 'rgba(239,68,68,0.85)',
    borderColor: 'rgba(252,129,129,0.5)',
    shadowColor: COLORS.team2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 8,
  },
  turnText: {
    color: COLORS.textDim,
    fontSize: mob(16, 22),
    fontWeight: '800',
    textAlign: 'center',
  },
  turnTextWhite: {
    color: '#fff',
  },
  turnNameHighlight: {
    color: '#fff',
    fontWeight: '900',
    fontSize: mob(17, 24),
  },
  turnSuffix: {
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    fontSize: mob(14, 18),
  },
  glowRipple: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 200,
    height: 120,
    marginTop: -60,
    marginLeft: -100,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#f39c12',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 2,
    zIndex: -1,
  },
  glowRippleBomb: {
    backgroundColor: 'rgba(155,89,182,0.08)',
    shadowColor: '#9b59b6',
    shadowOpacity: 0.6,
    shadowRadius: 40,
  },
  bombCard: {
    shadowColor: '#9b59b6',
    shadowOpacity: 0.6,
    shadowRadius: 16,
  },
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    maxWidth: mob(280, 500),
  },
  tableCard: {
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 14,
  },
  tableCardOverlap: {
    marginLeft: -8,
  },
  wishBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff6f00',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 10,
    gap: 10,
    borderWidth: 2,
    borderColor: '#ffca28',
    shadowColor: '#ff6f00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  wishIcon: {
    fontSize: 28,
  },
  wishLabel: {
    color: '#fff3e0',
    fontSize: 11,
    fontWeight: '600',
  },
  wishRank: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  emptyText: {
    color: COLORS.textDim,
    fontSize: FONT.md,
  },
  playInfo: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: mob(FONT.md, 16),
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
