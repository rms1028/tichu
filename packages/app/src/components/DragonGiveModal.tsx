import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useGameStore } from '../stores/gameStore';
import { useTeamInfo } from '../hooks/useGame';
import { COLORS, FONT } from '../utils/theme';

interface DragonGiveModalProps {
  onGive: (targetSeat: number) => void;
}

export function DragonGiveModal({ onGive }: DragonGiveModalProps) {
  const dragonGiveRequired = useGameStore((s) => s.dragonGiveRequired);
  const players = useGameStore((s) => s.players);
  const { leftOpponent, rightOpponent } = useTeamInfo();

  if (!dragonGiveRequired) return null;

  const opponents = [leftOpponent, rightOpponent];

  return (
    <Modal transparent animationType="fade" visible>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
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
