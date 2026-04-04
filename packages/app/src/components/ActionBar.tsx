import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  Easing,
  ZoomIn,
} from 'react-native-reanimated';
import type { Card, Rank } from '@tichu/shared';
import { isMahjong, isPhoenix, isNormalCard, mustFulfillWish, validateHand, canBeat, inferPhoenixAs } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { COLORS, FONT } from '../utils/theme';
import { mob, isMobile } from '../utils/responsive';

interface ActionBarProps {
  onPlay: (cards: Card[], phoenixAs?: Rank, wish?: Rank) => void;
  onPass: () => void;
  onDeclareTichu: (type: 'small') => void;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function ActionBar({ onPlay, onPass, onDeclareTichu }: ActionBarProps) {
  const selectedCards = useGameStore((s) => s.selectedCards);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const tableCards = useGameStore((s) => s.tableCards);
  const myHand = useGameStore((s) => s.myHand);
  const wish = useGameStore((s) => s.wish);
  const canDeclareTichu = useGameStore((s) => s.canDeclareTichu);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const phase = useGameStore((s) => s.phase);
  const [showWishPicker, setShowWishPicker] = useState(false);

  useEffect(() => {
    if (phase !== 'TRICK_PLAY') setShowWishPicker(false);
  }, [phase]);

  const isLead = tableCards === null;
  const hasSelection = selectedCards.length > 0;

  // 소원 강제: 소원 카드를 낼 수 있으면 패스 불가
  const wishForcesPlay = (() => {
    if (!wish || isLead) return false;
    const wr = mustFulfillWish(myHand, tableCards, wish, false);
    return wr.mustPlay && wr.validPlaysWithWish.length > 0;
  })();
  const hasMahjong = selectedCards.some(isMahjong);
  const hasPhoenix = selectedCards.some(isPhoenix);

  // 선택한 카드가 유효한 족보인지 + 바닥을 이길 수 있는지 검증 (메모이제이션)
  const isValidPlay = useMemo(() => {
    if (!hasSelection) return false;
    const phoenixAs = hasPhoenix && selectedCards.length > 1 ? inferPhoenixAs(selectedCards) : undefined;
    const hand = validateHand(selectedCards, phoenixAs);
    if (!hand) return false;
    return canBeat(tableCards, hand);
  }, [selectedCards, tableCards, hasSelection, hasPhoenix]);

  const canPlay = hasSelection && isMyTurn && isValidPlay;

  // Play 버튼 글로우 펄스
  const playGlow = useSharedValue(0);
  const playScale = useSharedValue(1);
  useEffect(() => {
    if (canPlay) {
      playGlow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ), -1, false,
      );
      playScale.value = withSpring(1.05, { damping: 10, stiffness: 100 });
    } else {
      playGlow.value = withTiming(0, { duration: 200 });
      playScale.value = withSpring(1, { damping: 10, stiffness: 100 });
    }
  }, [canPlay]);

  const playAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
    shadowOpacity: canPlay ? 0.3 + playGlow.value * 0.5 : 0,
  }));

  const getPhoenixAs = (): Rank | undefined => {
    if (hasPhoenix && selectedCards.length > 1) return inferPhoenixAs(selectedCards);
    return undefined;
  };

  const handlePlay = () => {
    if (!canPlay) return;
    if (hasMahjong) {
      setShowWishPicker(true);
      return;
    }
    onPlay(selectedCards, getPhoenixAs());
    clearSelection();
  };

  const handleWishSelect = (wish?: Rank) => {
    setShowWishPicker(false);
    onPlay(selectedCards, getPhoenixAs(), wish);
    clearSelection();
  };

  if (phase !== 'TRICK_PLAY') return null;

  const WISH_RANKS: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, hasSelection ? styles.clearButton : styles.clearButtonDisabled]}
        onPress={clearSelection}
        disabled={!hasSelection}
        activeOpacity={0.7}
      >
        <Text style={[styles.clearText, !hasSelection && styles.clearTextDisabled]}>초기화</Text>
      </TouchableOpacity>
      {!isLead && (
        <TouchableOpacity
          style={[styles.button, (isMyTurn && !wishForcesPlay) ? styles.passButton : styles.passButtonDisabled]}
          onPress={onPass}
          disabled={!isMyTurn || wishForcesPlay}
          activeOpacity={0.7}
        >
          <Text style={[styles.passText, (!isMyTurn || wishForcesPlay) && styles.passTextDisabled]}>
            {wishForcesPlay ? '소원!' : '패스'}
          </Text>
        </TouchableOpacity>
      )}
      <AnimatedTouchable
        style={[styles.playButton, !canPlay && styles.disabledPlay, playAnimStyle]}
        onPress={handlePlay}
        disabled={!canPlay}
        activeOpacity={0.8}
      >
        <Text style={styles.playText}>내기</Text>
      </AnimatedTouchable>
      {/* 소원 선택 그리드 */}
      {showWishPicker && (
        <Animated.View
          entering={ZoomIn.duration(200).springify()}
          style={styles.wishOverlay}
          pointerEvents="box-none"
        >
          <View style={styles.wishBox}>
            <Text style={styles.wishTitle}>{'소원 숫자 선택'}</Text>
            <View style={styles.wishGrid}>
              <TouchableOpacity style={[styles.wishBtn, styles.wishBtnSkip]} onPress={() => handleWishSelect(undefined)}>
                <Text style={styles.wishBtnSkipText}>{'안 함'}</Text>
              </TouchableOpacity>
              {WISH_RANKS.map(rank => (
                <TouchableOpacity key={rank} style={styles.wishBtn} onPress={() => handleWishSelect(rank)}>
                  <Text style={styles.wishBtnText}>{rank}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    gap: mob(14, 18),
    position: 'relative',
  },
  button: {
    paddingHorizontal: mob(16, 26),
    paddingVertical: mob(11, 15),
    borderRadius: mob(12, 16),
    minWidth: mob(60, 88),
    minHeight: mob(46, 50),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  clearButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.25)',
  },
  clearButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  clearText: {
    color: '#fff',
    fontSize: mob(13, 16),
    fontWeight: '700',
  },
  clearTextDisabled: {
    color: 'rgba(255,255,255,0.2)',
  },
  passButton: {
    backgroundColor: 'rgba(59,130,246,0.7)',
    borderColor: 'rgba(96,165,250,0.8)',
  },
  passButtonDisabled: {
    backgroundColor: 'rgba(100,116,139,0.08)',
    borderColor: 'rgba(100,116,139,0.15)',
  },
  passText: {
    color: '#fff',
    fontSize: mob(13, 16),
    fontWeight: '800',
  },
  passTextDisabled: {
    color: 'rgba(255,255,255,0.2)',
  },
  playButton: {
    backgroundColor: '#D97706',
    borderRadius: mob(14, 16),
    paddingHorizontal: mob(36, 50),
    paddingVertical: mob(14, 16),
    minWidth: mob(100, 130),
    minHeight: mob(48, 50),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  playText: {
    color: '#fff',
    fontSize: mob(18, 20),
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  disabledPlay: {
    backgroundColor: 'rgba(217,119,6,0.3)',
    borderColor: 'rgba(245,158,11,0.3)',
    shadowOpacity: 0,
    opacity: 0.4,
  },

  // 소원 선택 그리드
  wishOverlay: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    marginBottom: 8,
  },
  wishBox: {
    backgroundColor: 'rgba(15,45,26,0.95)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 15,
    maxWidth: isMobile ? 300 : 400,
    width: '100%',
  },
  wishTitle: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  wishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  wishBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 42,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishBtnSkip: {
    backgroundColor: 'rgba(148,163,184,0.15)',
    borderColor: 'rgba(148,163,184,0.3)',
  },
  wishBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  wishBtnSkipText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
});
