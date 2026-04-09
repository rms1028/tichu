import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { ZoomIn, FadeOut, FadeIn } from 'react-native-reanimated';
import { useGameStore } from '../stores/gameStore';
import { ParticleEffect } from './ParticleEffect';

interface EventDisplay {
  id: number;
  emoji: string;
  title: string;
  subtitle: string;
  color: string;
  particleType: 'victory' | 'bomb' | 'tichu' | 'onetwo';
}

let eventId = 0;

export function GameEventOverlay() {
  const [event, setEvent] = useState<EventDisplay | null>(null);
  const lastPlayEvent = useGameStore((s) => s.lastPlayEvent);
  const tichuDeclarations = useGameStore((s) => s.tichuDeclarations);
  const finishOrder = useGameStore((s) => s.finishOrder);
  const roundResult = useGameStore((s) => s.roundResult);
  const prevTichuRef = React.useRef<Record<number, string | null>>({});
  const prevFinishRef = React.useRef(0);

  // 폭탄 감지
  useEffect(() => {
    if (!lastPlayEvent) return;
    const type = lastPlayEvent.hand.type;
    if (type === 'four_bomb' || type === 'straight_flush_bomb') {
      showEvent({
        emoji: '💣',
        title: type === 'straight_flush_bomb' ? 'SF 폭탄!!' : '폭탄!',
        subtitle: `${useGameStore.getState().players[lastPlayEvent.seat]?.nickname ?? '?'}`,
        color: '#9b59b6',
        particleType: 'bomb',
      });
    }
  }, [lastPlayEvent]);

  // 티츄 선언 감지
  useEffect(() => {
    for (const seat of [0, 1, 2, 3]) {
      const decl = tichuDeclarations[seat];
      if (decl && !prevTichuRef.current[seat]) {
        const name = useGameStore.getState().players[seat]?.nickname ?? '?';
        showEvent({
          emoji: decl === 'large' ? '🔥' : '⭐',
          title: decl === 'large' ? '라지 티츄!' : '스몰 티츄!',
          subtitle: name,
          color: decl === 'large' ? '#e74c3c' : '#F59E0B',
          particleType: 'tichu',
        });
      }
      prevTichuRef.current[seat] = decl ?? null;
    }
  }, [tichuDeclarations]);

  // 용 양도 완료 감지
  const dragonGiveCompleted = useGameStore((s) => s.dragonGiveCompleted);
  useEffect(() => {
    if (!dragonGiveCompleted) return;
    const { fromSeat, targetSeat } = dragonGiveCompleted;
    const players = useGameStore.getState().players;
    const fromName = players[fromSeat]?.nickname ?? '?';
    const toName = players[targetSeat]?.nickname ?? '?';
    showEvent({
      emoji: '🐉',
      title: '용 트릭 양도',
      subtitle: `${fromName} → ${toName}`,
      color: '#E74C3C',
      particleType: 'bomb',
    });
    useGameStore.setState({ dragonGiveCompleted: null });
  }, [dragonGiveCompleted]);

  // 원투 피니시 감지
  useEffect(() => {
    if (roundResult?.details?.oneTwoFinish && finishOrder.length >= 2) {
      showEvent({
        emoji: '🎉',
        title: '원투 피니시!',
        subtitle: '200점 획득!',
        color: '#FFD700',
        particleType: 'onetwo',
      });
    }
  }, [roundResult]);

  function showEvent(e: Omit<EventDisplay, 'id'>) {
    const id = ++eventId;
    setEvent({ ...e, id });
    setTimeout(() => setEvent(prev => prev?.id === id ? null : prev), 2500);
  }

  if (!event) return null;

  return (
    <View style={S.overlay} pointerEvents="none">
      <ParticleEffect type={event.particleType} count={15} />
      <View style={S.box}>
        <Text style={S.emoji}>{event.emoji}</Text>
        <Text style={[S.title, { color: event.color }]}>{event.title}</Text>
        <Text style={S.subtitle}>{event.subtitle}</Text>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', zIndex: 80,
  },
  box: {
    alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20, paddingHorizontal: 32, paddingVertical: 20,
  },
  emoji: { fontSize: 48, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600', marginTop: 4 },
});
