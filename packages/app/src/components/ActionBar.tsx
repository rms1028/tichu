import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { Card, Rank } from '@tichu/shared';
import { isMahjong, isPhoenix, isNormalCard } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { COLORS, FONT } from '../utils/theme';
import { mob, isMobile } from '../utils/responsive';

interface ActionBarProps {
  onPlay: (cards: Card[], phoenixAs?: Rank, wish?: Rank) => void;
  onPass: () => void;
  onDeclareTichu: (type: 'small') => void;
}

function inferPhoenixAs(cards: Card[]): Rank | undefined {
  const normals = cards.filter(isNormalCard);
  if (normals.length === 0) return undefined;
  const values = normals.map(c => c.value);
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length === 1) return valueToRank(sorted[0]!);
  for (let v = sorted[0]!; v <= sorted[sorted.length - 1]!; v++) {
    if (!values.includes(v)) return valueToRank(v);
  }
  return valueToRank(sorted[sorted.length - 1]!);
}

function valueToRank(v: number): Rank {
  const map: Record<number, Rank> = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
  return map[v] ?? '2';
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
    if (phase !== 'TRICK_PLAY') setShowWishPicker(false);
  }, [phase]);

  const isLead = tableCards === null;
  const hasSelection = selectedCards.length > 0;
  const hasMahjong = selectedCards.some(isMahjong);
  const hasPhoenix = selectedCards.some(isPhoenix);

  const getPhoenixAs = (): Rank | undefined => {
    if (hasPhoenix && selectedCards.length > 1) return inferPhoenixAs(selectedCards);
    return undefined;
  };

  const handlePlay = () => {
    if (!hasSelection || !isMyTurn) return;
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

      {/* 소원 선택 오버레이 */}
      {showWishPicker && (
        <View style={styles.wishOverlay} pointerEvents="box-none">
          <View style={styles.wishBox}>
            <Text style={styles.wishTitle}>{'소원 숫자 선택'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wishScroll}>
              <TouchableOpacity style={[styles.wishBtn, styles.wishBtnSkip]} onPress={() => handleWishSelect(undefined)}>
                <Text style={styles.wishBtnSkipText}>{'안 함'}</Text>
              </TouchableOpacity>
              {(['2','3','4','5','6','7','8','9','10','J','Q','K','A'] as Rank[]).map(rank => (
                <TouchableOpacity key={rank} style={styles.wishBtn} onPress={() => handleWishSelect(rank)}>
                  <Text style={styles.wishBtnText}>{rank}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  clearText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: mob(13, 16),
    fontWeight: '700',
  },
  passButton: {
    backgroundColor: 'rgba(100,116,139,0.2)',
    borderColor: 'rgba(148,163,184,0.4)',
  },
  passText: {
    color: '#94a3b8',
    fontSize: mob(13, 16),
    fontWeight: '800',
  },
  disabledSub: {
    opacity: 0.3,
  },
  playButton: {
    backgroundColor: 'rgba(217,119,6,0.9)',
    borderRadius: mob(12, 16),
    paddingHorizontal: mob(24, 40),
    paddingVertical: mob(12, 16),
    minWidth: mob(70, 100),
    minHeight: mob(46, 50),
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(245,158,11,0.6)',
  },
  playText: {
    color: '#fff',
    fontSize: mob(15, 18),
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

  // 소원 선택 — 절대 위치 오버레이
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
    maxWidth: isMobile ? 320 : 500,
    width: '100%',
  },
  wishTitle: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  wishScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 4,
  },
  wishBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 44,
    minHeight: 44,
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
