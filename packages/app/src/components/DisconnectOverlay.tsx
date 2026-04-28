import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useGameStore } from '../stores/gameStore';
import { COLORS } from '../utils/theme';

interface Props {
  onLobby: () => void;
}

export function DisconnectOverlay({ onLobby }: Props) {
  const connected = useGameStore((s) => s.connected);
  const phase = useGameStore((s) => s.phase);
  const [seconds, setSeconds] = useState(0);

  // 게임 중 연결 끊겼을 때만 표시
  const visible = !connected && phase !== 'WAITING_FOR_PLAYERS' && phase !== 'GAME_OVER';

  useEffect(() => {
    if (!visible) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.title}>{'연결이 끊겼습니다'}</Text>
        <Text style={styles.desc}>{'재연결 중입니다...'}</Text>
        <Text style={styles.timer}>{`${seconds}초 경과`}</Text>
        <Text style={styles.hint}>{'네트워크 상태를 확인해 주세요.\n자동으로 다시 연결됩니다.'}</Text>
        <TouchableOpacity style={styles.btn} onPress={onLobby}>
          <Text style={styles.btnText}>{'로비로 나가기'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9998,
  },
  box: {
    backgroundColor: COLORS.surface,
    paddingVertical: 28,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 280,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginTop: 14 },
  desc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },
  timer: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 10, fontWeight: '600' },
  hint: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 14, textAlign: 'center', lineHeight: 16 },
  btn: { marginTop: 18, backgroundColor: COLORS.danger ?? '#e74c3c', paddingVertical: 10, paddingHorizontal: 28, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
