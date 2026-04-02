import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { mob } from '../utils/responsive';
import type { Card, Rank } from '@tichu/shared';
import { isPhoenix, isMahjong, inferPhoenixAs } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { COLORS, FONT } from '../utils/theme';

interface ActionBarProps {
  onPlay: (cards: Card[], phoenixAs?: Rank, wish?: Rank) => void;
  onPass: () => void;
  onDeclareTichu: (type: 'small') => void;
}

export function ActionBar({ onPlay, onPass, onDeclareTichu }: ActionBarProps) {
  const selectedCards = useGameStore((s) => s.selectedCards);
  const isMyTurn = useGameStore((s) => s.isMyTurn);
  const tableCards = useGameStore((s) => s.tableCards);
  const canDeclareTichu = useGameStore((s) => s.canDeclareTichu);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const phase = useGameStore((s) => s.phase);
  const [showWishPicker, setShowWishPicker] = useState(false);

  useEffect(() => {
    if (phase !== 'TRICK_PLAY') {
      setShowWishPicker(false);
    }
  }, [phase]);

  const isLead = tableCards === null;
  const hasSelection = selectedCards.length > 0;
  const hasMahjong = selectedCards.some(isMahjong);
  const hasPhoenix = selectedCards.some(isPhoenix);

  const getPhoenixAs = (): Rank | undefined => {
    if (hasPhoenix && selectedCards.length > 1) {
      return inferPhoenixAs(selectedCards);
    }
    return undefined;
  };

  const handlePlay = () => {
    if (!hasSelection) return;
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

  if (showWishPicker) {
    return <WishPicker onSelect={handleWishSelect} />;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, styles.clearButton, !hasSelection && styles.disabledSub]}
        onPress={clearSelection}
        disabled={!hasSelection}
        activeOpacity={0.7}
      >
        <Text style={styles.clearText}>초기화</Text>
      </TouchableOpacity>

      {!isLead && (
        <TouchableOpacity
          style={[styles.button, styles.passButton, !isMyTurn && styles.disabledSub]}
          onPress={onPass}
          disabled={!isMyTurn}
          activeOpacity={0.7}
        >
          <Text style={styles.passText}>패스</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.playButton, (!hasSelection || !isMyTurn) && styles.disabledPlay]}
        onPress={handlePlay}
        disabled={!hasSelection || !isMyTurn}
        activeOpacity={0.8}
      >
        <Text style={styles.playText}>내기</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── 소원 선택기 ──────────────────────────────────────────────

const WISH_RANKS: (Rank | undefined)[] = [
  undefined, '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];

function WishPicker({ onSelect }: { onSelect: (wish?: Rank) => void }) {
  return (
    <View style={styles.wishContainer}>
      <Text style={styles.wishTitle}>소원 선택 (선택사항)</Text>
      <View style={styles.wishGrid}>
        {WISH_RANKS.map((rank, i) => (
          <TouchableOpacity
            key={i}
            style={styles.wishButton}
            onPress={() => onSelect(rank)}
          >
            <Text style={styles.wishButtonText}>
              {rank ?? '안 함'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
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
  },
  // 공통 보조 버튼
  button: {
    paddingHorizontal: mob(16, 26),
    paddingVertical: mob(11, 15),
    borderRadius: mob(12, 16),
    minWidth: mob(60, 88),
    minHeight: mob(46, 50),
    alignItems: 'center',
    borderWidth: 1.5,
  },

  // 스몰 티츄 — 골드/앰버
  tichuButton: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderColor: 'rgba(245,158,11,0.7)',
  },
  tichuText: {
    color: '#fbbf24',
    fontWeight: '800',
    fontSize: FONT.md,
  },

  // 초기화 — 밝은 회색
  clearButton: {
    backgroundColor: 'rgba(100,116,139,0.3)',
    borderColor: 'rgba(148,163,184,0.6)',
  },
  clearText: {
    color: '#f1f5f9',
    fontWeight: '700',
    fontSize: FONT.md,
  },

  // 패스 — 어두운 남색
  passButton: {
    backgroundColor: 'rgba(30,58,95,0.7)',
    borderColor: 'rgba(59,130,246,0.4)',
  },
  passText: {
    color: '#93c5fd',
    fontWeight: '800',
    fontSize: FONT.md,
  },

  // 내기 — 메인 CTA, 골드/오렌지
  playButton: {
    backgroundColor: '#D97706',
    borderRadius: 18,
    paddingHorizontal: 34,
    paddingVertical: 15,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 2,
    borderTopColor: '#F59E0B',
    borderLeftColor: '#F59E0B',
    borderRightColor: '#B45309',
    borderBottomColor: '#92400E',
    shadowColor: 'rgba(245,158,11,0.4)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 10,
  },
  playText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: FONT.lg,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  disabledSub: {
    opacity: 0.35,
  },
  disabledPlay: {
    backgroundColor: 'rgba(217,119,6,0.3)',
    borderColor: 'rgba(245,158,11,0.3)',
    shadowOpacity: 0,
    opacity: 0.4,
  },

  // Wish picker
  wishContainer: {
    alignItems: 'center',
    padding: 8,
  },
  wishTitle: {
    color: COLORS.text,
    fontSize: FONT.md,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  wishGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  wishButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  wishButtonText: {
    color: '#fff',
    fontSize: FONT.sm,
    fontWeight: 'bold',
  },
});
