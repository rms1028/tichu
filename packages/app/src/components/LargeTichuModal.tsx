import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import Animated, { ZoomIn, FadeIn } from 'react-native-reanimated';
import { useGameStore } from '../stores/gameStore';
import { COLORS } from '../utils/theme';
import { isMobile, mob } from '../utils/responsive';
import { CardView } from './CardView';
import { sortHand } from '../hooks/useGame';

const LARGE_TICHU_TIMEOUT = 15;

interface LargeTichuModalProps {
  onDeclare: () => void;
  onPass: () => void;
}

export function LargeTichuModal({ onDeclare, onPass }: LargeTichuModalProps) {
  const phase = useGameStore((s) => s.phase);
  const myHand = useGameStore((s) => s.myHand);
  const [remaining, setRemaining] = useState(LARGE_TICHU_TIMEOUT);
  const [responded, setResponded] = useState(false);

  useEffect(() => {
    if (phase !== 'LARGE_TICHU_WINDOW') { setRemaining(LARGE_TICHU_TIMEOUT); setResponded(false); return; }
    setRemaining(LARGE_TICHU_TIMEOUT);
    setResponded(false);
    const iv = setInterval(() => setRemaining(r => { if (r <= 1) { clearInterval(iv); return 0; } return r - 1; }), 1000);
    return () => clearInterval(iv);
  }, [phase]);
  // 타임아웃 시 자동 패스
  useEffect(() => {
    if (remaining <= 0 && phase === 'LARGE_TICHU_WINDOW' && !responded) {
      setResponded(true);
      onPass();
    }
  }, [remaining, phase, responded]);

  if (phase !== 'LARGE_TICHU_WINDOW' || responded) return null;

  const sorted = sortHand(myHand);
  const urgent = remaining <= 5;

  const handleDeclare = () => {
    if (responded) return;
    setResponded(true);
    onDeclare();
  };

  const handlePass = () => {
    if (responded) return;
    setResponded(true);
    onPass();
  };

  return (
    <View style={S.overlay} pointerEvents="box-none">
      <View style={S.backdrop} pointerEvents="auto">
        <View style={S.modal}>
          <View style={S.headerRow}>
            <Text style={S.icon}>{'🔥'}</Text>
            <View style={[S.timerBadge, urgent && S.timerUrgent]}>
              <Text style={[S.timerText, urgent && S.timerTextUrgent]}>{remaining}{'초'}</Text>
            </View>
          </View>
          <Text style={S.title}>{'라지 티츄 선언'}</Text>
          <Text style={S.desc}>{'8장을 확인했습니다. 라지 티츄를 선언하시겠습니까?'}</Text>
          {isMobile ? (
            <View style={S.cardsTwoRow}>
              <View style={S.cardsRow}>
                {sorted.slice(0, 4).map((card, i) => (
                  <View key={i} style={i > 0 ? S.cardOverlap : undefined}>
                    <CardView card={card} size="normal" disabled />
                  </View>
                ))}
              </View>
              <View style={S.cardsRow}>
                {sorted.slice(4).map((card, i) => (
                  <View key={i} style={i > 0 ? S.cardOverlap : undefined}>
                    <CardView card={card} size="normal" disabled />
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={S.cardsRow}>
              {sorted.map((card, i) => (
                <View key={i} style={i > 0 ? S.cardOverlap : undefined}>
                  <CardView card={card} size="normal" disabled />
                </View>
              ))}
            </View>
          )}
          <View style={S.scoreRow}>
            <Text style={S.scoreGood}>{'성공 +200'}</Text>
            <Text style={S.scoreSep}>{'/'}</Text>
            <Text style={S.scoreBad}>{'실패 -200'}</Text>
          </View>
          <View style={S.btnRow}>
            <TouchableOpacity style={S.passBtn} onPress={handlePass} activeOpacity={0.7}>
              <Text style={S.passBtnText}>{'패스'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.declareBtn} onPress={handleDeclare} activeOpacity={0.7}>
              <Text style={S.declareBtnText}>{'🔥 라지 티츄!'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 999,
  },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12,
  },
  modal: { backgroundColor: COLORS.bgDark, borderRadius: 22, padding: mob(20, 32), alignItems: 'center', width: mob('90%', '100%') as any, maxWidth: mob(500, 600), borderWidth: 2, borderColor: 'rgba(231,76,60,0.4)', shadowColor: '#e74c3c', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: mob(10, 14), marginBottom: mob(4, 6) },
  icon: { fontSize: mob(36, 48) },
  timerBadge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: mob(10, 14), paddingVertical: mob(4, 6) },
  timerUrgent: { backgroundColor: 'rgba(239,68,68,0.2)' },
  timerText: { color: 'rgba(255,255,255,0.6)', fontSize: mob(18, 20), fontWeight: '800' },
  timerTextUrgent: { color: '#ef4444' },
  title: { color: '#e74c3c', fontSize: mob(22, 30), fontWeight: '900', marginBottom: mob(4, 8), textShadowColor: 'rgba(231,76,60,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  desc: { color: 'rgba(255,255,255,0.6)', fontSize: mob(15, 18), textAlign: 'center', lineHeight: mob(20, 26), marginBottom: mob(8, 16) },
  cardsTwoRow: { gap: 4, alignItems: 'center' },
  cardsRow: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: mob(8, 12), paddingVertical: mob(2, 10) },
  cardOverlap: { marginLeft: mob(-4, -14) },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: mob(8, 12), marginTop: mob(6, 10), marginBottom: mob(10, 18) },
  scoreGood: { color: '#10b981', fontSize: mob(16, 20), fontWeight: '800' },
  scoreSep: { color: 'rgba(255,255,255,0.3)', fontSize: mob(14, 18) },
  scoreBad: { color: '#ef4444', fontSize: mob(16, 20), fontWeight: '800' },
  btnRow: { flexDirection: 'row', gap: mob(10, 16), width: '100%' },
  passBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingVertical: mob(14, 16), alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  passBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: mob(16, 20), fontWeight: '700' },
  declareBtn: { flex: 1, backgroundColor: '#e74c3c', borderRadius: 12, paddingVertical: mob(14, 16), alignItems: 'center', shadowColor: '#e74c3c', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6 },
  declareBtnText: { color: '#fff', fontSize: mob(16, 20), fontWeight: '900' },
});
