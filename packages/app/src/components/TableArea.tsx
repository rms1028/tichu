import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  ZoomIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useGameStore } from '../stores/gameStore';
import { CardView } from './CardView';
import { mob } from '../utils/responsive';
import { COLORS, FONT } from '../utils/theme';

export function TableArea() {
  const tableCards = useGameStore((s) => s.tableCards);
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
  const prevCardsRef = useRef(tableCards);
  if (tableCards !== prevCardsRef.current) {
    tableKeyRef.current += 1;
    prevCardsRef.current = tableCards;
  }

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

  // 상대팀 이름 색상: 좌측 상대=노랑, 우측 상대=시안 (빨간 배경 위에서 잘 보이는 색)
  const leftEnemy = (mySeat + 1) % 4;
  const rightEnemy = (mySeat + 3) % 4;
  const enemyNameColor = currentTurn === leftEnemy ? '#A3E635' : '#C084FC'; // 라임 / 보라

  return (
    <View style={styles.container}>
      {/* 턴 표시 */}
      {phase === 'TRICK_PLAY' && (
        <View
          key={`turn-${currentTurn}`}
         
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
        </View>
      )}

      {/* 소원 표시 */}
      {wish && (
        <View style={styles.wishBanner}>
          <Text style={styles.wishIcon}>{'\u{1F004}'}</Text>
          <View>
            <Text style={styles.wishLabel}>소원 활성</Text>
            <Text style={styles.wishRank}>{wish}</Text>
          </View>
        </View>
      )}

      {/* 바닥 카드 - 확대 & 입체적 + 후광 */}
      {tableCards ? (
        <View
          key={`table-${tableKeyRef.current}`}
         
        >
          {/* 후광 이펙트 */}
          <View style={[
            styles.glowRipple,
            isBomb && styles.glowRippleBomb,
            bombGlowStyle,
          ]} />
          <View style={styles.cardsRow}>
            {tableCards.cards.map((card, i) => (
              <View
                key={i}
               
                style={[
                  styles.tableCard,
                  i > 0 && styles.tableCardOverlap,
                  isBomb && styles.bombCard,
                  { zIndex: i },
                ]}
              >
                <CardView card={card} size="large" disabled />
              </View>
            ))}
          </View>
          {lastPlay && (
            <Text style={styles.playInfo}>
              {players[lastPlay.seat]?.nickname ?? '?'} {'\u2192'} {valueLabel(lastPlay.hand.value)} {handTypeLabel(lastPlay.hand.type)}
            </Text>
          )}
        </View>
      ) : (
        <View>
          <Text style={styles.emptyText}>
            {phase === 'TRICK_PLAY' ? '새 트릭' : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

function valueLabel(v: number): string {
  if (v === 11) return 'J';
  if (v === 12) return 'Q';
  if (v === 13) return 'K';
  if (v === 14) return 'A';
  if (v === Infinity) return '\uC6A9';
  if (v % 1 !== 0) return String(Math.floor(v)); // 봉황 float
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
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: 8,
  },
  turnBanner: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: mob(16, 28),
    paddingVertical: mob(6, 10),
    borderRadius: mob(16, 24),
    marginBottom: mob(8, 10),
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
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 8,
  },
  turnBannerEnemy: {
    backgroundColor: 'rgba(239,68,68,0.85)',
    borderColor: 'rgba(252,129,129,0.5)',
    shadowColor: '#EF4444',
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
