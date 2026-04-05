import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Card } from '@tichu/shared';
import { getCardDisplayName, getSuitSymbol, getCardColor, getSuitBgColor, getSpecialIcon } from '../hooks/useGame';
import { COLORS, FONT } from '../utils/theme';

interface CardViewProps {
  card: Card;
  selected?: boolean;
  isBombCard?: boolean;
  onPress?: () => void;
  size?: string;
  faceDown?: boolean;
  disabled?: boolean;
}

export function CardView({
  card, selected = false, isBombCard = false, onPress, size = 'normal', faceDown = false, disabled = false,
}: CardViewProps) {
  const dims = SIZE_MAP[size as keyof typeof SIZE_MAP] ?? SIZE_MAP.normal;
  const color = getCardColor(card);
  const bgColor = getSuitBgColor(card);

  if (faceDown) {
    return (
      <View style={[styles.card, dims, styles.faceDown]}>
        <View style={styles.backInner}>
          <View style={styles.backBorder}>
            <View style={styles.backDiamond}>
              <Text style={styles.backLogo}>T</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  const isSpecial = card.type === 'special';
  const name = getCardDisplayName(card);
  const suit = getSuitSymbol(card);
  const specialIcon = isSpecial ? getSpecialIcon(card) : '';
  const specialBg = isSpecial ? getSpecialCardBg(card) : undefined;
  const specialBorder = isSpecial ? getSpecialBorderColor(card) : undefined;
  const specialGlow = isSpecial ? getSpecialGlowColor(card) : undefined;

  const selectionStyle = selected
    ? { transform: [{ translateY: -10 } as any], borderWidth: 3, borderColor: '#ffe066', shadowColor: '#ffe066', shadowOpacity: 0.6, shadowRadius: 12 }
    : {};
  const bombStyle = isBombCard ? { borderColor: COLORS.bomb, borderWidth: 2 } : {};

  if (isSpecial) {
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled || !onPress} activeOpacity={0.7}>
        <View style={[
          styles.card, dims,
          { backgroundColor: specialBg, borderColor: specialBorder },
          specialGlow && { shadowColor: specialGlow, shadowOpacity: 0.3, shadowRadius: 10 },
          selectionStyle,
        ]}>
          <Text style={[styles.specialTopName, { color }, size === 'small' && styles.specialTopNameSmall]}>{name}</Text>
          <View style={styles.specialIconWrap}>
            <Text style={[styles.specialIconCenter, size === 'small' && styles.specialIconSmall, size === 'large' && styles.specialIconLarge]}>{specialIcon}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const cardElement = (
    <TouchableOpacity onPress={onPress} disabled={disabled || !onPress} activeOpacity={0.7}>
      <View style={[
        styles.card, dims,
        { backgroundColor: bgColor, borderColor: color },
        isBombCard && styles.bombHighlight,
        selectionStyle,
        bombStyle,
      ]}>
        {/* 상단 하이라이트 */}
        <View style={styles.cardInsetTop} />
        {/* 하단 그라데이션 */}
        <View style={[styles.cardInsetBottom, { backgroundColor: `${color}08` }]} />
        <View style={styles.topLeft}>
          <Text style={[styles.rank, { color }, size === 'small' && styles.rankSmall, size === 'large' && styles.rankLarge]}>{name}</Text>
          <Text style={[styles.suitTop, { color }, size === 'small' && styles.suitTopSmall]}>{suit}</Text>
        </View>
        <Text style={[styles.suitCenter, { color }, size === 'small' && styles.suitCenterSmall, size === 'large' && styles.suitCenterLarge]}>{suit}</Text>
        {isBombCard && (
          <View style={styles.bombBadge}><Text style={styles.bombBadgeText}>B</Text></View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (isBombCard) {
    return (
      <View style={styles.bombGlow}>
        {cardElement}
      </View>
    );
  }

  return cardElement;
}

function getSpecialCardBg(card: Card): string {
  if (card.type !== 'special') return COLORS.card;
  switch (card.specialType) {
    case 'mahjong': return '#fff9e6';
    case 'dog': return '#eceff1';
    case 'phoenix': return '#fff3e0';
    case 'dragon': return '#ffebee';
  }
}

function getSpecialBorderColor(card: Card): string {
  if (card.type !== 'special') return '#ccc';
  switch (card.specialType) {
    case 'mahjong': return '#d4a017';
    case 'dog': return '#607d8b';
    case 'phoenix': return '#ff9800';
    case 'dragon': return '#f44336';
  }
}

function getSpecialGlowColor(card: Card): string | undefined {
  if (card.type !== 'special') return undefined;
  switch (card.specialType) {
    case 'mahjong': return '#d4a017';
    case 'dog': return undefined;
    case 'phoenix': return '#ff9800';
    case 'dragon': return '#f44336';
  }
}

import { isMobile, mob } from '../utils/responsive';

const SIZE_MAP = isMobile ? {
  small: { width: 42, height: 59 },
  normal: { width: 56, height: 78 },
  large: { width: 70, height: 98 },
} : {
  small: { width: 62, height: 87 },
  normal: { width: 80, height: 112 },
  large: { width: 96, height: 134 },
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 2,
    marginHorizontal: 1,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  // 카드 뒷면
  faceDown: {
    backgroundColor: '#b22020',
    borderColor: '#8e1818',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backInner: {
    flex: 1,
    margin: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  backBorder: {
    width: '70%',
    aspectRatio: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,200,40,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  backDiamond: {
    transform: [{ rotate: '-45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  backLogo: {
    color: 'rgba(255,200,40,0.4)',
    fontSize: FONT.lg,
    fontWeight: '900',
  },
  // 카드 앞면 장식
  cardInsetTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  cardInsetBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '25%',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  topLeft: {
    position: 'absolute',
    top: mob(2, 4),
    left: mob(3, 6),
  },
  rank: {
    fontSize: mob(FONT.md, 18),
    fontWeight: '900',
    lineHeight: mob(16, 22),
  },
  rankSmall: {
    fontSize: mob(10, 14),
    lineHeight: mob(12, 17),
  },
  rankLarge: {
    fontSize: mob(FONT.lg, 22),
    lineHeight: mob(20, 26),
  },
  suitTop: {
    fontSize: mob(8, 14),
    lineHeight: mob(10, 17),
    marginTop: -1,
  },
  suitTopSmall: {
    fontSize: mob(6, 10),
  },
  suitCenter: {
    position: 'absolute',
    bottom: '20%',
    alignSelf: 'center',
    fontSize: 24,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  suitCenterSmall: {
    fontSize: 16,
  },
  suitCenterLarge: {
    fontSize: 32,
  },
  // 특수카드
  specialTopName: {
    position: 'absolute',
    top: mob(2, 4),
    left: mob(3, 6),
    fontSize: mob(FONT.md, 18),
    fontWeight: '900',
    zIndex: 1,
  },
  specialTopNameSmall: {
    fontSize: mob(9, 14),
  },
  specialIconWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialIconCenter: {
    fontSize: 22,
    textAlign: 'center',
  },
  specialIconSmall: {
    fontSize: 16,
  },
  specialIconLarge: {
    fontSize: 30,
  },
  specialBottomName: {
    position: 'absolute',
    bottom: 4,
    right: 5,
    fontSize: 8,
    fontWeight: '700',
  },
  // 폭탄
  bombHighlight: {
    borderColor: COLORS.bomb,
    borderWidth: 2,
  },
  bombGlow: {
    shadowColor: COLORS.bomb,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  bombBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: COLORS.bomb,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
    shadowColor: COLORS.bomb,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 10,
  },
  bombBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
});
