import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Card } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { sortHand } from '../hooks/useGame';
import { CardView } from './CardView';
import { COLORS, FONT } from '../utils/theme';

function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') return a.specialType === b.specialType;
  if (a.type === 'normal' && b.type === 'normal') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

interface ExchangeViewProps {
  onExchange: (left: Card, partner: Card, right: Card) => void;
}

export function ExchangeView({ onExchange }: ExchangeViewProps) {
  const myHand = useGameStore((s) => s.myHand);
  const phase = useGameStore((s) => s.phase);
  const exchangeReceived = useGameStore((s) => s.exchangeReceived);
  const [selected, setSelected] = useState<Card[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [remaining, setRemaining] = useState(30);

  useEffect(() => {
    if (phase !== 'PASSING') { setRemaining(30); return; }
    setRemaining(30);
    const iv = setInterval(() => setRemaining(r => { if (r <= 1) { clearInterval(iv); return 0; } return r - 1; }), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  if (phase !== 'PASSING') return null;

  const sorted = sortHand(myHand);

  const toggleCard = (card: Card) => {
    const idx = selected.findIndex(c => cardEquals(c, card));
    if (idx >= 0) {
      setSelected(selected.filter((_, i) => i !== idx));
    } else if (selected.length < 3) {
      setSelected([...selected, card]);
    }
  };

  const handleConfirm = () => {
    if (selected.length !== 3) return;
    onExchange(selected[0]!, selected[1]!, selected[2]!);
    setSubmitted(true);
  };

  const labels = ['← 왼쪽 상대', '↑ 파트너', '→ 오른쪽 상대'];

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>카드 교환</Text>
        <View style={[styles.timerBadge, remaining <= 10 && styles.timerUrgent]}>
          <Text style={[styles.timerText, remaining <= 10 && styles.timerTextUrgent]}>{remaining}초</Text>
        </View>
      </View>
      <Text style={styles.subtitle}>3장을 선택하세요 (왼쪽상대, 파트너, 오른쪽상대 순)</Text>

      <View style={styles.selectedRow}>
        {[0, 1, 2].map(i => (
          <View key={i} style={styles.selectedSlot}>
            <Text style={styles.slotLabel}>{labels[i]}</Text>
            {selected[i] ? (
              <CardView card={selected[i]!} size="normal" onPress={() => toggleCard(selected[i]!)} />
            ) : (
              <View style={styles.emptySlot} />
            )}
          </View>
        ))}
      </View>

      <View style={styles.handRow}>
        {sorted.map((card, i) => {
          const isSelected = selected.some(c => cardEquals(c, card));
          return (
            <CardView
              key={i}
              card={card}
              selected={isSelected}
              size="normal"
              onPress={() => toggleCard(card)}
            />
          );
        })}
      </View>

      {submitted && exchangeReceived ? (
        <View style={styles.receivedContainer}>
          <Text style={styles.receivedTitle}>교환 완료!</Text>
          <Text style={styles.receivedSubtitle}>받은 카드:</Text>
          <View style={styles.receivedRow}>
            <View style={styles.receivedSlot}>
              <Text style={styles.slotLabel}>← 왼쪽에서</Text>
              <CardView card={exchangeReceived.fromLeft} size="normal" />
            </View>
            <View style={styles.receivedSlot}>
              <Text style={styles.slotLabel}>↑ 파트너에서</Text>
              <CardView card={exchangeReceived.fromPartner} size="normal" />
            </View>
            <View style={styles.receivedSlot}>
              <Text style={styles.slotLabel}>→ 오른쪽에서</Text>
              <CardView card={exchangeReceived.fromRight} size="normal" />
            </View>
          </View>
        </View>
      ) : submitted ? (
        <Text style={styles.waitingText}>교환 완료! 다른 플레이어 대기 중...</Text>
      ) : (
        <TouchableOpacity
          style={[styles.confirmBtn, selected.length !== 3 && styles.disabled]}
          onPress={handleConfirm}
          disabled={selected.length !== 3}
        >
          <Text style={styles.confirmText}>교환 확정</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT.xl,
    fontWeight: 'bold',
  },
  timerBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timerUrgent: {
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  timerText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '800',
  },
  timerTextUrgent: {
    color: '#ef4444',
  },
  subtitle: {
    color: COLORS.textDim,
    fontSize: FONT.sm,
    marginBottom: 16,
  },
  selectedRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  selectedSlot: {
    alignItems: 'center',
  },
  slotLabel: {
    color: COLORS.textDim,
    fontSize: 10,
    marginBottom: 4,
  },
  emptySlot: {
    width: 42,
    height: 60,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.textDim,
    borderRadius: 6,
  },
  handRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmBtn: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  disabled: {
    opacity: 0.4,
  },
  confirmText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: FONT.lg,
  },
  waitingText: {
    color: COLORS.accent,
    fontSize: FONT.md,
    fontWeight: 'bold',
  },
  receivedContainer: {
    alignItems: 'center',
  },
  receivedTitle: {
    color: COLORS.accent,
    fontSize: FONT.lg,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  receivedSubtitle: {
    color: COLORS.textDim,
    fontSize: FONT.sm,
    marginBottom: 8,
  },
  receivedRow: {
    flexDirection: 'row',
    gap: 16,
  },
  receivedSlot: {
    alignItems: 'center',
  },
});
