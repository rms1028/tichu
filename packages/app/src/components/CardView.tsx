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
  size?: 'small' | 'normal' | 'large';
  faceDown?: boolean;
  disabled?: boolean;
}

export function CardView({
  card, selected = false, isBombCard = false, onPress, size = 'normal', faceDown = false, disabled = false,
}: CardViewProps) {
  const dims = SIZE_MAP[size];
  const color = getCardColor(card);
  const bgColor = getSuitBgColor(card);

  if (faceDown) {
    return (
      <View style={[styles.card, dims, styles.faceDown]}>
        <View style={styles.backPattern}>
          <Text style={styles.backText}>T</Text>
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

  // 선택 시 위로 올라가는 효과 (순수 RN style)
  const selectionStyle = selected ? { transform: [{ translateY: -10 } as any], borderWidth: 3, borderColor: '#ffe066' } : {};
  const bombStyle = isBombCard ? { borderColor: '#9b59b6', borderWidth: 2 } : {};

  if (isSpecial) {
    return (
      <TouchableOpacity onPress={onPress} disabled={disabled || !onPress} activeOpacity={0.7}>
        <View style={[
          styles.card, dims,
          { backgroundColor: specialBg, borderColor: specialBorder },
          selectionStyle,
        ]}>
          <Text style={[styles.specialTopName, { color }, size === 'small' && styles.specialTopNameSmall]}>{name}</Text>
          <Text style={[styles.specialIconCenter, size === 'small' && styles.specialIconSmall, size === 'large' && styles.specialIconLarge]}>{specialIcon}</Text>
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
        <View style={styles.cardInsetTop} />
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

import { isMobile } from '../utils/responsive';

const SIZE_MAP = isMobile ? {
  small: { width: 38, height: 54 },
  normal: { width: 48, height: 70 },
  large: { width: 58, height: 82 },
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
  faceDown: {
    backgroundColor: COLORS.cardBack,
    borderColor: '#8e2020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPattern: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: FONT.lg,
    fontWeight: '900',
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
  specialTopName: {
    position: 'absolute',
    top: 4,
    left: 5,
    fontSize: 10,
    fontWeight: '800',
  },
  specialTopNameSmall: {
    fontSize: 7,
  },
  specialIconCenter: {
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 28,
    lineHeight: 50,
  },
  specialIconSmall: {
    fontSize: 18,
    lineHeight: 36,
  },
  specialIconLarge: {
    fontSize: 38,
    lineHeight: 70,
  },
  cardInsetTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  bombHighlight: {
    borderColor: '#9b59b6',
    borderWidth: 2,
  },
  bombGlow: {
    shadowColor: '#9b59b6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  bombBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#9b59b6',
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
  selected: {
    // handled by selectionStyle inline
  },
});
