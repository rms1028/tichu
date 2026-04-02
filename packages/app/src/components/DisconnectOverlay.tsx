import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useGameStore } from '../stores/gameStore';
import { COLORS } from '../utils/theme';

interface Props { onLobby: () => void; }

const RECONNECT_TIMEOUT = 30; // 30초

export function DisconnectOverlay({ onLobby }: Props) {
  const connected = useGameStore((s) => s.connected);
  const roomId = useGameStore((s) => s.roomId);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (connected || !roomId) { setElapsed(0); return; }
    const iv = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [connected, roomId]);

  if (connected || !roomId) return null;

  const timedOut = elapsed >= RECONNECT_TIMEOUT;

  return (
    <View style={S.overlay}>
      <View style={S.box}>
        {!timedOut ? (
          <>
            <ActivityIndicator color="#F59E0B" size="large" />
            <Text style={S.title}>{'연결이 끊겼습니다'}</Text>
            <Text style={S.desc}>{`재접속 시도 중... (${elapsed}초)`}</Text>
          </>
        ) : (
          <>
            <Text style={S.timeoutIcon}>{'⚠️'}</Text>
            <Text style={S.title}>{'재접속 실패'}</Text>
            <Text style={S.desc}>{'서버에 연결할 수 없습니다'}</Text>
          </>
        )}
        <View style={S.btnRow}>
          <TouchableOpacity style={S.btn} onPress={onLobby}>
            <Text style={S.btnText}>{'로비로'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 500 },
  box: { backgroundColor: COLORS.bgDark, borderRadius: 20, padding: 28, alignItems: 'center', width: 280 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 16 },
  desc: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, marginBottom: 20 },
  timeoutIcon: { fontSize: 36 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  btnText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
});
