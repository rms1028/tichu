import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import type { Card } from '@tichu/shared';
import { useGameStore } from '../stores/gameStore';
import { sortHand } from '../hooks/useGame';
import { CardView } from './CardView';
import { COLORS } from '../utils/theme';
import { isMobile, mob } from '../utils/responsive';

function cardEquals(a: Card, b: Card): boolean {
  if (a.type === 'special' && b.type === 'special') return a.specialType === b.specialType;
  if (a.type === 'normal' && b.type === 'normal') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

type Target = 'left' | 'partner' | 'right';

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

  const [assignments, setAssignments] = useState<{ left: Card | null; partner: Card | null; right: Card | null }>({
    left: null, partner: null, right: null,
  });
  const [activeTarget, setActiveTarget] = useState<Target | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [remaining, setRemaining] = useState(30);

  useEffect(() => {
    if (phase !== 'PASSING') { setRemaining(30); return; }
    setRemaining(30);
    const iv = setInterval(() => setRemaining(r => { if (r <= 1) { clearInterval(iv); return 0; } return r - 1; }), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  if (phase !== 'PASSING') return null;

  const leftSeat = (mySeat + 3) % 4;
  const partnerSeat = (mySeat + 2) % 4;
  const rightSeat = (mySeat + 1) % 4;
  const avatars = ['🐲', '🦁', '🐻', '🦊'];

  const sorted = sortHand(myHand);
  const assignedCards = [assignments.left, assignments.partner, assignments.right].filter(Boolean) as Card[];
  const allAssigned = assignments.left !== null && assignments.partner !== null && assignments.right !== null;

  // 플레이어 아바타 클릭 → 타겟 선택
  const handleTargetPress = (target: Target) => {
    if (submitted) return;
    // 이미 배정된 카드가 있으면 해제
    if (assignments[target] !== null) {
      setAssignments(prev => ({ ...prev, [target]: null }));
      setActiveTarget(target);
      return;
    }
    setActiveTarget(prev => prev === target ? null : target);
  };

  // 카드 클릭 → 활성 타겟에 배정
  const handleCardPress = (card: Card) => {
    if (submitted) return;

    // 이미 배정된 카드를 클릭하면 해제
    for (const key of ['left', 'partner', 'right'] as Target[]) {
      if (assignments[key] && cardEquals(assignments[key]!, card)) {
        setAssignments(prev => ({ ...prev, [key]: null }));
        return;
      }
    }

    // 타겟이 선택되어 있으면 배정
    if (activeTarget && assignments[activeTarget] === null) {
      setAssignments(prev => ({ ...prev, [activeTarget]: card }));
      // 다음 빈 슬롯으로 자동 이동
      const order: Target[] = ['left', 'partner', 'right'];
      const nextEmpty = order.find(t => t !== activeTarget && assignments[t] === null);
      setActiveTarget(nextEmpty ?? null);
      return;
    }

    // 타겟 없으면 첫 번째 빈 슬롯에 자동 배정
    const order: Target[] = ['left', 'partner', 'right'];
    const firstEmpty = order.find(t => assignments[t] === null);
    if (firstEmpty) {
      setAssignments(prev => ({ ...prev, [firstEmpty]: card }));
      const nextEmpty = order.find(t => t !== firstEmpty && assignments[t] === null);
      setActiveTarget(nextEmpty ?? null);
    }
  };

  const handleConfirm = () => {
    if (!allAssigned) return;
    onExchange(assignments.left!, assignments.partner!, assignments.right!);
    setSubmitted(true);
  };

  const handleReset = () => {
    setAssignments({ left: null, partner: null, right: null });
    setActiveTarget(null);
  };

  const n = sorted.length;
  const useTwoRows = n >= 9;
  const cardW = isMobile ? 56 : 80;
  const rowWidth = isMobile ? 360 : 750;
  const slotSize = 'normal';

  const renderPlayerSlot = (target: Target, seat: number, label: string) => {
    const p = players[seat];
    if (!p) return null;
    const decl = tichuDeclarations[seat];
    const isTeam1 = seat === 0 || seat === 2;
    const isActive = activeTarget === target;
    const card = assignments[target];

    return (
      <TouchableOpacity
        key={target}
        style={[S.playerSlot, isActive && S.playerSlotActive]}
        onPress={() => handleTargetPress(target)}
        activeOpacity={0.7}
      >
        <View style={[
          S.avatarLg,
          { borderColor: isTeam1 ? '#3B82F6' : '#EF4444' },
          isActive && S.avatarActive,
        ]}>
          <Text style={S.avatarLgEmoji}>{avatars[seat]}</Text>
        </View>
        <Text style={[S.playerNick, isActive && S.playerNickActive]} numberOfLines={1}>
          {label} {p.nickname}
        </Text>
        {decl ? (
          <View style={[S.tichuTag, decl === 'large' && S.tichuTagLarge]}>
            <Text style={S.tichuTagText}>{decl === 'large' ? '🔥라지' : '⭐스몰'}</Text>
          </View>
        ) : null}
        {/* 카드 슬롯 */}
        <View style={S.cardSlotWrap}>
          {card ? (
            <CardView card={card} size={slotSize} onPress={() => handleTargetPress(target)} />
          ) : (
            <View style={[S.emptySlot, isActive && S.emptySlotActive]}>
              {isActive ? (
                <Text style={S.emptySlotText}>{'카드를\n선택'}</Text>
              ) : (
                <Text style={S.emptySlotPlus}>+</Text>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderCardRow = (cards: Card[]) => {
    const ov = cards.length > 1 ? -Math.max(isMobile ? 12 : 16, cardW - (rowWidth - cardW) / (cards.length - 1)) : 0;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.hand}>
        {cards.map((card, i) => {
          const isAssigned = assignedCards.some(c => cardEquals(c, card));
          return (
            <View key={i} style={[{ marginLeft: i === 0 ? 0 : ov, zIndex: i }, isAssigned && S.cardAssigned]}>
              <CardView
                card={card}
                selected={!isAssigned && activeTarget !== null}
                size={isMobile ? 'normal' : 'normal'}
                onPress={() => handleCardPress(card)}
                disabled={isAssigned}
              />
              {isAssigned && <View style={S.cardAssignedOverlay} />}
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
      <Text style={S.subtitle}>
        {activeTarget
          ? `${activeTarget === 'left' ? '← 왼쪽' : activeTarget === 'partner' ? '↑ 파트너' : '→ 오른쪽'}에게 줄 카드를 선택하세요`
          : '플레이어를 터치하고 카드를 배정하세요'}
      </Text>

      {/* 3명의 플레이어 + 카드 슬롯 */}
      <View style={S.playersArea}>
        {/* 파트너 (상단 중앙) */}
        <View style={S.partnerRow}>
          {renderPlayerSlot('partner', partnerSeat, '\u2191')}
        </View>
        {/* 왼쪽 / 오른쪽 (좌우) */}
        <View style={S.sidesRow}>
          {renderPlayerSlot('left', leftSeat, '\u2190')}
          {renderPlayerSlot('right', rightSeat, '\u2192')}
        </View>
      </View>

      {/* 스몰 티츄 선언 */}
      {!myTichu && canDeclareTichu && onDeclareTichu && (
        <TouchableOpacity style={S.tichuBtn} onPress={() => onDeclareTichu('small')}>
          <Text style={S.tichuBtnText}>⭐ 스몰 티츄 선언</Text>
        </TouchableOpacity>
      )}
      {myTichu && (
        <View style={[S.tichuBadge, myTichu === 'large' && S.tichuBadgeLarge]}>
          <Text style={S.tichuBadgeText}>
            {myTichu === 'large' ? '🔥 라지 티츄' : '⭐ 스몰 티츄'} 선언 완료!
          </Text>
        </View>
      )}

      {/* 손패 */}
      {useTwoRows ? (
        <View style={S.twoRowWrap}>
          {renderCardRow(sorted.slice(0, Math.ceil(n / 2)))}
          {renderCardRow(sorted.slice(Math.ceil(n / 2)))}
        </View>
      ) : (
        renderCardRow(sorted)
      )}

      {/* 하단 버튼 */}
      {submitted && exchangeReceived ? (
        <View style={S.receivedWrap}>
          <Text style={S.receivedTitle}>받은 카드</Text>
          <View style={S.receivedRow}>
            {[
              { l: '← 왼쪽', c: exchangeReceived.fromLeft },
              { l: '↑ 파트너', c: exchangeReceived.fromPartner },
              { l: '→ 오른쪽', c: exchangeReceived.fromRight },
            ].map((r, i) => (
              <View key={i} style={S.receivedSlot}>
                <Text style={S.receivedSlotLabel}>{r.l}</Text>
                <CardView card={r.c} size={slotSize} />
              </View>
            ))}
          </View>
        </View>
      ) : submitted ? (
        <Text style={S.waitText}>교환 완료! 대기 중...</Text>
      ) : (
        <View style={S.btnRow}>
          {(assignments.left || assignments.partner || assignments.right) && (
            <TouchableOpacity style={S.resetBtn} onPress={handleReset} activeOpacity={0.7}>
              <Text style={S.resetText}>초기화</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[S.confirmBtn, !allAssigned && S.disabled]}
            onPress={handleConfirm}
            disabled={!allAssigned}
            activeOpacity={0.7}
          >
            <Text style={S.confirmText}>
              교환 확정 ({[assignments.left, assignments.partner, assignments.right].filter(Boolean).length}/3)
            </Text>
          </TouchableOpacity>
        </View>
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
  subtitle: { color: COLORS.textDim, fontSize: mob(14, 18), textAlign: 'center' },

  // 플레이어 영역
  playersArea: { gap: mob(6, 12), alignItems: 'center', width: '100%' },
  partnerRow: { alignItems: 'center' },
  sidesRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: mob(20, 60) },

  // 플레이어 슬롯 (아바타 + 이름 + 카드)
  playerSlot: {
    alignItems: 'center',
    gap: mob(2, 4),
    padding: mob(6, 10),
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  playerSlotActive: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.1)',
  },
  avatarLg: {
    width: mob(38, 50),
    height: mob(38, 50),
    borderRadius: mob(19, 25),
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  avatarActive: {
    borderColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarLgEmoji: { fontSize: mob(18, 24) },
  playerNick: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: mob(10, 13),
    fontWeight: '700',
    maxWidth: mob(70, 100),
    textAlign: 'center',
  },
  playerNickActive: { color: '#F59E0B' },

  // 카드 슬롯
  cardSlotWrap: { marginTop: mob(2, 4) },
  emptySlot: {
    width: mob(56, 80),
    height: mob(78, 112),
    borderWidth: mob(1, 2),
    borderStyle: 'dashed',
    borderColor: COLORS.textDim,
    borderRadius: mob(8, 10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySlotActive: {
    borderColor: '#F59E0B',
    borderWidth: 2,
    backgroundColor: 'rgba(245,158,11,0.05)',
  },
  emptySlotText: {
    color: '#F59E0B',
    fontSize: mob(10, 13),
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySlotPlus: {
    color: COLORS.textDim,
    fontSize: mob(24, 32),
    fontWeight: '300',
  },

  // 티츄 태그
  tichuTag: { backgroundColor: 'rgba(243,156,18,0.25)', borderRadius: 6, paddingHorizontal: mob(4, 8), paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(243,156,18,0.5)' },
  tichuTagLarge: { backgroundColor: 'rgba(231,76,60,0.25)', borderColor: 'rgba(231,76,60,0.5)' },
  tichuTagText: { color: '#fff', fontSize: mob(8, 11), fontWeight: '800' },
  tichuBtn: { backgroundColor: 'rgba(243,156,18,0.15)', borderWidth: 1.5, borderColor: 'rgba(243,156,18,0.5)', borderRadius: 10, paddingHorizontal: mob(12, 18), paddingVertical: mob(6, 8) },
  tichuBtnText: { color: '#F59E0B', fontSize: mob(13, 16), fontWeight: '800' },
  tichuBadge: { backgroundColor: 'rgba(243,156,18,0.2)', borderWidth: 1, borderColor: '#f39c12', borderRadius: 8, paddingHorizontal: mob(10, 14), paddingVertical: mob(3, 5) },
  tichuBadgeLarge: { backgroundColor: 'rgba(231,76,60,0.2)', borderColor: '#e74c3c' },
  tichuBadgeText: { color: '#fff', fontSize: mob(12, 15), fontWeight: '800' },

  // 손패
  twoRowWrap: { gap: mob(2, 4) },
  hand: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: mob(4, 16),
    paddingVertical: mob(2, 4),
    minWidth: '100%',
  },
  cardAssigned: { opacity: 0.3 },
  cardAssignedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: mob(8, 10),
  },

  // 하단 버튼
  btnRow: { flexDirection: 'row', gap: mob(10, 16), alignItems: 'center' },
  resetBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: mob(20, 28),
    paddingVertical: mob(12, 14),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  resetText: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: mob(14, 18) },
  confirmBtn: {
    backgroundColor: COLORS.success,
    paddingHorizontal: mob(32, 40),
    paddingVertical: mob(12, 14),
    borderRadius: 12,
  },
  disabled: { opacity: 0.4 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: mob(16, 20) },
  waitText: { color: COLORS.accent, fontSize: mob(16, 20), fontWeight: 'bold' },
  receivedWrap: { alignItems: 'center', gap: mob(4, 8) },
  receivedTitle: { color: COLORS.accent, fontSize: mob(16, 20), fontWeight: 'bold' },
  receivedRow: { flexDirection: 'row', gap: mob(12, 24) },
  receivedSlot: { alignItems: 'center' },
  receivedSlotLabel: { color: COLORS.textDim, fontSize: mob(13, 16), marginBottom: mob(3, 6), fontWeight: '600' },
});
