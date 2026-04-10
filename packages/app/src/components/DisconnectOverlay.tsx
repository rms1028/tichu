import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useGameStore } from '../stores/gameStore';
import { COLORS } from '../utils/theme';

interface Props {
  onLobby: () => void;
}

export function DisconnectOverlay({ onLobby }: Props) {
  const connected = useGameStore((s) => s.connected);
  const phase = useGameStore((s) => s.phase);

  // 게임 중 연결 끊겼을 때만 표시
  if (connected || phase === 'WAITING_FOR_PLAYERS' || phase === 'GAME_OVER') return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.title}>Connection Lost</Text>
        <Text style={styles.desc}>Reconnecting...</Text>
        <TouchableOpacity style={styles.btn} onPress={onLobby}>
          <Text style={styles.btnText}>Back to Lobby</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9998,
  },
  box: {
    backgroundColor: COLORS.surface,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    minWidth: 240,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 8,
  },
  desc: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  btn: {
    marginTop: 8,
    backgroundColor: COLORS.danger ?? '#e74c3c',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
