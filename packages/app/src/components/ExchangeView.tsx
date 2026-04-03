import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { Card } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { sortHand } from '../hooks/useGame';
import { CardView } from './CardView';
import { COLORS, FONT } from '../utils/theme';
import { isMobile, mob } from '../utils/responsive';

function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') return a.specialType === b.specialType;
  if (a.type === 'normal' && b.type === 'normal') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

interface ExchangeViewProps {
  onExchange: (left: Card, partner: Card, right: Card) => void;
  onDeclareTichu?: (type: 'small') => void;
}

export function ExchangeView({ onExchange, onDeclareTichu }: ExchangeViewProps) {
  const myHand = useGameStore((s) => s.myHand);
  const phase = useGameStore((s) => s.phase);
  const exchangeReceived = useGameStore((s) => s.exchangeReceived);
  const canDeclareTichu = useGameStore((s) => s.canDeclareTichu);
  const tichuDeclarations = useGameStore((s) => s.tichuDeclarations);
  const mySeat = useGameStore((s) => s.mySeat);
  const players = useGameStore((s) => s.players);
  const myTichu = tichuDeclarations[mySeat];
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

  const labels = ['← 왼쪽', '↑ 파트너', '→ 오른쪽'];
  const n = sorted.length;
  // PC/모바일 모두 2줄 배치 (9장 이상)
  const useTwoRows = n >= 9;
  const cardSize = isMobile ? 'normal' : 'normal';
  const slotSize = 'normal';
  const cardW = isMobile ? 56 : 80;
  const rowWidth = isMobile ? 360 : 750;

  const renderCardRow = (cards: Card[]) => {
    const ov = cards.length > 1 ? -Math.max(isMobile ? 12 : 16, cardW - (rowWidth - cardW) / (cards.length - 1)) : 0;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.hand}>
        {cards.map((card, i) => {
          const isSelected = selected.some(c => cardEquals(c, card));
          return (
            <View key={i} style={{ marginLeft: i === 0 ? 0 : ov, zIndex: i }}>
              <CardView card={card} selected={isSelected} size={cardSize} onPress={() => toggleCard(card)} />
            </View>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <View style={S.root}>
      {/* 타이틀 + 타이머 */}
      <View style={S.titleRow}>
        <Text style={S.title}>카드 교환</Text>
        <View style={[S.timerBadge, remaining <= 10 && S.timerUrgent]}>
          <Text style={[S.timerText, remaining <= 10 && S.timerTextUrgent]}>{remaining}초</Text>
        </View>
      </View>
      <Text style={S.subtitle}>3장을 선택하세요 (왼쪽, 파트너, 오른쪽 순)</Text>
      {/* 스몰 티츄 + 선언 현황 */}
      <View style={S.tichuRow}>
        {myTichu ? (
          <View style={[S.tichuBadge, myTichu === 'large' && S.tichuBadgeLarge]}>
            <Text style={S.tichuBadgeText}>{myTichu === 'large' ? '🔥 라지 티츄' : '⭐ 스몰 티츄'} 선언!</Text>
          </View>
        ) : canDeclareTichu && onDeclareTichu ? (
          <TouchableOpacity style={S.tichuBtn} onPress={() => onDeclareTichu('small')}>
            <Text style={S.tichuBtnText}>⭐ 스몰 티츄 선언</Text>
          </TouchableOpacity>
        ) : null}
        {[0, 1, 2, 3].map(seat => {
          const decl = tichuDeclarations[seat];
          if (!decl || seat === mySeat) return null;
          const name = players[seat]?.nickname ?? `P${seat + 1}`;
          return (
            <View key={seat} style={[S.otherTichuBadge, decl === 'large' && S.otherTichuLarge]}>
              <Text style={S.otherTichuText}>{decl === 'large' ? '🔥' : '⭐'} {name}</Text>
            </View>
          );
        })}
      </View>
      {/* 교환 슬롯 */}
      <View style={S.slotRow}>
        {[0, 1, 2].map(i => (
          <View key={i} style={S.slot}>
            <Text style={S.slotLabel}>{labels[i]}</Text>
            {selected[i] ? (
              <CardView card={selected[i]!} size={slotSize} onPress={() => toggleCard(selected[i]!)} />
            ) : (
              <View style={S.emptySlot} />
            )}
          </View>
        ))}
      </View>
      {/* 손패 — 2줄 또는 1줄 */}
      {useTwoRows ? (
        <View style={S.twoRowWrap}>
          {renderCardRow(sorted.slice(0, Math.ceil(n / 2)))}
          {renderCardRow(sorted.slice(Math.ceil(n / 2)))}
        </View>
      ) : (
        renderCardRow(sorted)
      )}
      {/* 버튼 */}
      {submitted && exchangeReceived ? (
        <View style={S.receivedWrap}>
          <Text style={S.receivedTitle}>받은 카드</Text>
          <View style={S.slotRow}>
            {[
              { l: '← 왼쪽', c: exchangeReceived.fromLeft },
              { l: '↑ 파트너', c: exchangeReceived.fromPartner },
              { l: '→ 오른쪽', c: exchangeReceived.fromRight },
            ].map((r, i) => (
              <View key={i} style={S.slot}>
                <Text style={S.slotLabel}>{r.l}</Text>
                <CardView card={r.c} size={slotSize} />
              </View>
            ))}
          </View>
        </View>
      ) : submitted ? (
        <Text style={S.waitText}>교환 완료! 대기 중...</Text>
      ) : (
        <TouchableOpacity
          style={[S.confirmBtn, selected.length !== 3 && S.disabled]}
          onPress={handleConfirm}
          disabled={selected.length !== 3}
        >
          <Text style={S.confirmText}>교환 확정 ({selected.length}/3)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: mob(4, 24),
    gap: mob(6, 10),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: mob(10, 14),
  },
  title: { color: COLORS.text, fontSize: mob(24, 32), fontWeight: '900' },
  timerBadge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: mob(10, 16), paddingVertical: mob(4, 6) },
  timerUrgent: { backgroundColor: 'rgba(239,68,68,0.2)' },
  timerText: { color: 'rgba(255,255,255,0.6)', fontSize: mob(18, 22), fontWeight: '800' },
  timerTextUrgent: { color: '#ef4444' },
  subtitle: { color: COLORS.textDim, fontSize: mob(15, 18) },
  slotRow: { flexDirection: 'row', gap: mob(12, 24) },
  slot: { alignItems: 'center' },
  slotLabel: { color: COLORS.textDim, fontSize: mob(13, 16), marginBottom: mob(3, 6), fontWeight: '600' },
  emptySlot: {
    width: mob(56, 80),
    height: mob(78, 112),
    borderWidth: mob(1, 2),
    borderStyle: 'dashed',
    borderColor: COLORS.textDim,
    borderRadius: mob(8, 10),
  },
  twoRowWrap: { gap: mob(2, 4) },
  hand: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: mob(4, 16),
    paddingVertical: mob(2, 4),
    minWidth: '100%',
  },
  confirmBtn: {
    backgroundColor: COLORS.success,
    paddingHorizontal: mob(32, 40),
    paddingVertical: mob(12, 14),
    borderRadius: 12,
  },
  disabled: { opacity: 0.4 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: mob(16, 20) },
  waitText: { color: COLORS.accent, fontSize: mob(16, 20), fontWeight: 'bold' },
  // 스몰 티츄
  tichuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: mob(6, 10), flexWrap: 'wrap' },
  tichuBtn: { backgroundColor: 'rgba(243,156,18,0.15)', borderWidth: 1.5, borderColor: 'rgba(243,156,18,0.5)', borderRadius: 10, paddingHorizontal: mob(12, 18), paddingVertical: mob(6, 8) },
  tichuBtnText: { color: '#F59E0B', fontSize: mob(13, 16), fontWeight: '800' },
  tichuBadge: { backgroundColor: 'rgba(243,156,18,0.2)', borderWidth: 1, borderColor: '#f39c12', borderRadius: 8, paddingHorizontal: mob(10, 14), paddingVertical: mob(3, 5) },
  tichuBadgeLarge: { backgroundColor: 'rgba(231,76,60,0.2)', borderColor: '#e74c3c' },
  tichuBadgeText: { color: '#fff', fontSize: mob(12, 15), fontWeight: '800' },
  otherTichuBadge: { backgroundColor: 'rgba(243,156,18,0.1)', borderRadius: 6, paddingHorizontal: mob(6, 10), paddingVertical: mob(2, 3) },
  otherTichuLarge: { backgroundColor: 'rgba(231,76,60,0.1)' },
  otherTichuText: { color: 'rgba(255,255,255,0.7)', fontSize: mob(10, 13), fontWeight: '700' },
  receivedWrap: { alignItems: 'center', gap: mob(4, 8) },
  receivedTitle: { color: COLORS.accent, fontSize: mob(16, 20), fontWeight: 'bold' },
});
