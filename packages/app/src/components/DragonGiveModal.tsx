import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useGameStore } from '../stores/gameStore';
import { useTeamInfo } from '../hooks/useGame';
import { COLORS, FONT } from '../utils/theme';

interface DragonGiveModalProps {
  onGive: (targetSeat: number) => void;
}

export function DragonGiveModal({ onGive }: DragonGiveModalProps) {
  const dragonGiveRequired = useGameStore((s) => s.dragonGiveRequired);
  const players = useGameStore((s) => s.players);
  const finishOrder = useGameStore((s) => s.finishOrder);
  const { leftOpponent, rightOpponent } = useTeamInfo();

  if (!dragonGiveRequired) return null;

  // 이미 나간 플레이어는 양도 대상에서 제외
  const opponents = [leftOpponent, rightOpponent].filter(s => !finishOrder.includes(s));

  // 상대 모두 나�� → 서버에서 자동 처리
  if (opponents.length === 0) return null;

  // In-tree overlay (not RN <Modal>) — see commit 05fabec for why.
  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <Text style={styles.title}>용 트릭 양도</Text>
        <Text style={styles.subtitle}>상대팀 1명에게 카드 더미를 양도하세요</Text>
        <View style={styles.buttonRow}>
          {opponents.map((seat) => (
            <TouchableOpacity
              key={seat}
              style={styles.giveButton}
              onPress={() => onGive(seat)}
            >
              <Text style={styles.giveText}>
                {players[seat]?.nickname ?? `Seat ${seat}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 280,
  },
  title: {
    color: COLORS.accent,
    fontSize: FONT.xl,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: COLORS.textDim,
    fontSize: FONT.md,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  giveButton: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  giveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: FONT.lg,
  },
});
