import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  const [current, setCurrent] = useState<EventDisplay | null>(null);
  const queueRef = useRef<EventDisplay[]>([]);
  const showingRef = useRef(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastPlayEvent = useGameStore((s) => s.lastPlayEvent);
  const tichuDeclarations = useGameStore((s) => s.tichuDeclarations);
  const finishOrder = useGameStore((s) => s.finishOrder);
  const roundResult = useGameStore((s) => s.roundResult);
  const dragonGiveCompleted = useGameStore((s) => s.dragonGiveCompleted);
  const prevTichuRef = useRef<Record<number, string | null>>({});

  // 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (nextTimerRef.current) clearTimeout(nextTimerRef.current);
    };
  }, []);

  // 큐에서 다음 이벤트 표시
  const processQueue = useCallback(() => {
    if (showingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    showingRef.current = true;
    setCurrent(next);
    showTimerRef.current = setTimeout(() => {
      setCurrent(null);
      showingRef.current = false;
      // 큐에 남은 이벤트 처리
      nextTimerRef.current = setTimeout(() => processQueue(), 200);
    }, 2500);
  }, []);

  function enqueueEvent(e: Omit<EventDisplay, 'id'>) {
    const id = ++eventId;
    queueRef.current.push({ ...e, id });
    processQueue();
  }

  // 폭탄 감지
  useEffect(() => {
    if (!lastPlayEvent) return;
    const type = lastPlayEvent.hand.type;
    if (type === 'four_bomb' || type === 'straight_flush_bomb') {
      enqueueEvent({
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
        enqueueEvent({
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
  useEffect(() => {
    if (!dragonGiveCompleted) return;
    const { fromSeat, targetSeat } = dragonGiveCompleted;
    const players = useGameStore.getState().players;
    const fromName = players[fromSeat]?.nickname ?? '?';
    const toName = players[targetSeat]?.nickname ?? '?';
    enqueueEvent({
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
      enqueueEvent({
        emoji: '🎉',
        title: '원투 피니시!',
        subtitle: '200점 획득!',
        color: '#FFD700',
        particleType: 'onetwo',
      });
    }
  }, [roundResult]);

  if (!current) return null;

  return (
    <View style={S.overlay} pointerEvents="none">
      <ParticleEffect type={current.particleType} count={15} />
      <View style={S.box}>
        <Text style={S.emoji}>{current.emoji}</Text>
        <Text style={[S.title, { color: current.color }]}>{current.title}</Text>
        <Text style={S.subtitle}>{current.subtitle}</Text>
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
