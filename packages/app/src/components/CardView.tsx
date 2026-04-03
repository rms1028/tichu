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
          {/* 하단 이름 (large) */}
          {size === 'large' && (
            <Text style={[styles.specialBottomName, { color: `${color}88` }]}>{name}</Text>
          )}
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
    case 'mahjong': return '#e8f5e9';
    case 'dog': return '#eceff1';
    case 'phoenix': return '#fff3e0';
    case 'dragon': return '#ffebee';
  }
}

function getSpecialBorderColor(card: Card): string {
  if (card.type !== 'special') return '#ccc';
  switch (card.specialType) {
    case 'mahjong': return '#4caf50';
    case 'dog': return '#607d8b';
    case 'phoenix': return '#ff9800';
    case 'dragon': return '#f44336';
  }
}

function getSpecialGlowColor(card: Card): string | undefined {
  if (card.type !== 'special') return undefined;
  switch (card.specialType) {
    case 'mahjong': return '#4caf50';
    case 'dog': return undefined;
    case 'phoenix': return '#ff9800';
    case 'dragon': return '#f44336';
  }
}

import { isMobile } from '../utils/responsive';

const SIZE_MAP = isMobile ? {
  small: { width: 34, height: 48 },
  normal: { width: 42, height: 60 },
  large: { width: 50, height: 72 },
} : {
  small: { width: 52, height: 74 },
  normal: { width: 72, height: 102 },
  large: { width: 88, height: 124 },
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
    top: 3,
    left: 4,
  },
  rank: {
    fontSize: FONT.md,
    fontWeight: '900',
    lineHeight: 16,
  },
  rankSmall: {
    fontSize: 10,
    lineHeight: 12,
  },
  rankLarge: {
    fontSize: FONT.lg,
    lineHeight: 20,
  },
  suitTop: {
    fontSize: 8,
    lineHeight: 10,
    marginTop: -1,
  },
  suitTopSmall: {
    fontSize: 6,
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
    top: 4,
    left: 5,
    fontSize: 10,
    fontWeight: '800',
    zIndex: 1,
  },
  specialTopNameSmall: {
    fontSize: 7,
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
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  bombBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.bomb,
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bombBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
});
