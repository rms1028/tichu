import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { Card } from '@tichu/shared';
import { getCardDisplayName, getSuitSymbol, getCardColor, getSuitBgColor, getSpecialIcon } from '../hooks/useGame';
import { COLORS, FONT } from '../utils/theme';
import { haptics } from '../utils/haptics';

interface CardViewProps {
  card: Card;
  selected?: boolean;
  isBombCard?: boolean;
  onPress?: () => void;
  size?: 'small' | 'normal' | 'large';
  faceDown?: boolean;
  disabled?: boolean;
}

// AnimatedTouchable은 모바일 웹에서 터치 문제가 있어 분리 처리

export function CardView({
  card, selected = false, isBombCard = false, onPress, size = 'normal', faceDown = false, disabled = false,
}: CardViewProps) {
  const dims = SIZE_MAP[size];
  const color = getCardColor(card);
  const bgColor = getSuitBgColor(card);

  // Reanimated: 카드 선택 spring
  const translateY = useSharedValue(0);
  const selectionScale = useSharedValue(1);

  useEffect(() => {
    translateY.value = withSpring(selected ? -12 : 0, { damping: 14, stiffness: 200 });
    selectionScale.value = withSpring(selected ? 1.08 : 1, { damping: 14, stiffness: 200 });
  }, [selected]);

  const selectedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: selectionScale.value }],
  }));

  // Reanimated: 폭탄 글로우 pulse
  const glowOpacity = useSharedValue(0);

  useEffect(() => {
    if (isBombCard) {
      glowOpacity.value = withRepeat(
        withTiming(1, { duration: 800 }),
        -1,
        true,
      );
    } else {
      glowOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isBombCard]);

  const bombGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.3 + glowOpacity.value * 0.5,
    borderColor: isBombCard ? '#9b59b6' : 'transparent',
  }));

  const handlePress = () => {
    onPress?.();
  };

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

  if (isSpecial) {
    return (
      <TouchableOpacity onPress={handlePress} disabled={disabled || !onPress} activeOpacity={0.7}>
        <Animated.View style={[
          styles.card, dims,
          { backgroundColor: specialBg, borderColor: specialBorder },
          selected && styles.selected,
          selectedStyle,
        ]}>
          <Text style={[styles.specialTopName, { color }, size === 'small' && styles.specialTopNameSmall]}>{name}</Text>
          <Text style={[styles.specialIconCenter, size === 'small' && styles.specialIconSmall, size === 'large' && styles.specialIconLarge]}>{specialIcon}</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  // 일반 카드
  const cardContent = (
    <TouchableOpacity onPress={handlePress} disabled={disabled || !onPress} activeOpacity={0.7}>
      <Animated.View style={[
        styles.card, dims,
        { backgroundColor: bgColor, borderColor: color },
        isBombCard && styles.bombHighlight,
        selected && styles.selected,
        selectedStyle,
        isBombCard && bombGlowStyle,
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
      </Animated.View>
    </TouchableOpacity>
  );

  if (isBombCard) {
    return (
      <Animated.View style={[styles.bombGlow, bombGlowStyle]}>
        {cardContent}
      </Animated.View>
    );
  }

  return cardContent;
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
    case 'dog': return '#78909c';
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
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#9b59b6',
    shadowColor: '#9b59b6',
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
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
    borderWidth: 3,
    borderColor: '#ffe066',
    shadowColor: '#ffe066',
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  faceDown: {
    backgroundColor: COLORS.cardBack,
    borderColor: '#8b0000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPattern: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 8,
  },
  backText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: FONT.lg,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  topLeft: {
    position: 'absolute',
    top: 3,
    left: 5,
    alignItems: 'center',
  },
  rank: {
    fontWeight: '800',
    fontSize: 18,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.08)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  rankSmall: {
    fontSize: 13,
    lineHeight: 15,
  },
  rankLarge: {
    fontSize: 22,
    lineHeight: 24,
  },
  suitTop: {
    fontSize: 16,
    lineHeight: 18,
  },
  suitTopSmall: {
    fontSize: 12,
  },
  suitCenter: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    fontSize: 32,
  },
  suitCenterSmall: {
    fontSize: 20,
    bottom: 3,
    right: 3,
  },
  suitCenterLarge: {
    fontSize: 40,
    bottom: 6,
    right: 6,
  },
  specialTopName: {
    position: 'absolute',
    top: 3,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  specialTopNameSmall: {
    fontSize: 10,
    top: 2,
  },
  specialIconCenter: {
    fontSize: 36,
    textAlign: 'center',
    marginTop: 24,
  },
  specialIconSmall: {
    fontSize: 26,
    marginTop: 18,
  },
  specialIconLarge: {
    fontSize: 48,
    marginTop: 26,
  },
});
