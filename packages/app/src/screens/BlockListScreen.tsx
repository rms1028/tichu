import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Platform, StatusBar, Alert } from 'react-native';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';
import { useGameStore } from '../stores/gameStore';
import { SHOP_AVATARS } from '../stores/userStore';

const ANDROID_TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;

interface Props {
  onBack: () => void;
  onRefresh: () => void;
  onUnblock: (targetId: string) => void;
}

function avatarEmoji(id: string | null): string {
  return SHOP_AVATARS.find(a => a.id === id)?.emoji ?? '👤';
}

export function BlockListScreen({ onBack, onRefresh, onUnblock }: Props) {
  const blockedUsers = useGameStore((s) => s.blockedUsers);

  useEffect(() => { onRefresh(); }, [onRefresh]);

  const confirmUnblock = (id: string, nickname: string) => {
    const message = `'${nickname}' 님의 차단을 해제하시겠습니까?`;
    if (typeof globalThis.confirm === 'function') {
      if (globalThis.confirm(message)) onUnblock(id);
    } else {
      Alert.alert('차단 해제', message,
        [{ text: '취소', style: 'cancel' }, { text: '해제', onPress: () => onUnblock(id) }]
      );
    }
  };

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      <View style={S.header}>
        <TouchableOpacity onPress={onBack}><Text style={S.back}>{'<- 뒤로'}</Text></TouchableOpacity>
        <Text style={S.title}>{'🚫 차단된 사용자'}</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView style={S.scroll} contentContainerStyle={S.content}>
        {blockedUsers.length === 0 ? (
          <View style={S.empty}>
            <Text style={S.emptyEmoji}>{'😌'}</Text>
            <Text style={S.emptyText}>{'차단한 사용자가 없습니다'}</Text>
            <Text style={S.emptySub}>{'게임 중 다른 플레이어를 신고/차단하면 이 곳에 표시됩니다.'}</Text>
          </View>
        ) : (
          blockedUsers.map((u) => (
            <View key={u.id} style={S.row}>
              <Text style={S.avatar}>{avatarEmoji(u.equippedAvatar)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={S.nick} numberOfLines={1}>{u.nickname || '(이름 없음)'}</Text>
                <Text style={S.subText}>{'차단됨'}</Text>
              </View>
              <TouchableOpacity style={S.unblockBtn} onPress={() => confirmUnblock(u.id, u.nickname)}>
                <Text style={S.unblockText}>{'해제'}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, paddingTop: ANDROID_TOP_INSET },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 10 },
  back: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
  title: { color: '#FFD700', fontSize: 18, fontWeight: '900' },
  scroll: { flex: 1, zIndex: 5 },
  content: { paddingHorizontal: 20, paddingBottom: 30, maxWidth: 700, alignSelf: 'center', width: '100%' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 64 },
  emptyText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '700' },
  emptySub: { color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', paddingHorizontal: 30, lineHeight: 19 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  avatar: { fontSize: 28, width: 38, textAlign: 'center' },
  nick: { color: '#fff', fontSize: 15, fontWeight: '700' },
  subText: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 },
  unblockBtn: { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: '#F59E0B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  unblockText: { color: '#F59E0B', fontSize: 13, fontWeight: '800' },
});
