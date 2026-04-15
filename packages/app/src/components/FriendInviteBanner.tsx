import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native';
import { useGameStore } from '../stores/gameStore';
import { useUserStore } from '../stores/userStore';
import { COLORS } from '../utils/theme';

// Android 카메라홀 회피 inset — absolute overlay 는 부모 padding 을 상속하지
// 않으므로 배너 자체에 top inset 을 적용.
const ANDROID_TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;

interface Props {
  onAccept: (roomId: string) => void;
}

/**
 * 친구 초대 배너 — 로비에서만 표시. gameStore.friendInvite 상태를 구독해서
 * 초대 수신 시 상단 배너로 알림. 15초 후 자동 사라짐.
 *
 * CLAUDE.md §14.2: native <Modal> 금지 → absolute overlay View 사용.
 */
export function FriendInviteBanner({ onAccept }: Props) {
  const invite = useGameStore((s) => s.friendInvite);
  const clearInvite = () => useGameStore.setState({ friendInvite: null });

  // 15초 후 자동 dismiss
  useEffect(() => {
    if (!invite) return;
    const t = setTimeout(() => clearInvite(), 15000);
    return () => clearTimeout(t);
  }, [invite]);

  if (!invite) return null;

  const handleAccept = () => {
    const myId = useUserStore.getState().playerId;
    if (!myId) return;
    const roomId = invite.roomId;
    clearInvite();
    onAccept(roomId);
  };

  const handleDecline = () => clearInvite();

  return (
    <View style={S.root} pointerEvents="box-none">
      <View style={S.banner}>
        <View style={S.iconWrap}>
          <Text style={S.icon}>{'👥'}</Text>
        </View>
        <View style={S.textWrap}>
          <Text style={S.title} numberOfLines={1}>{`${invite.fromNickname}님의 초대`}</Text>
          <Text style={S.subtitle} numberOfLines={1}>{'게임에 참가하시겠습니까?'}</Text>
        </View>
        <View style={S.btnRow}>
          <TouchableOpacity style={S.declineBtn} onPress={handleDecline} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={S.declineText}>{'거절'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.acceptBtn} onPress={handleAccept} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={S.acceptText}>{'참가'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 8 + ANDROID_TOP_INSET,
    paddingHorizontal: 12,
    zIndex: 9999,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(20,32,20,0.97)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
    maxWidth: 520,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245,158,11,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  textWrap: { flex: 1, gap: 2 },
  title: { color: '#fff', fontSize: 14, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 6 },
  declineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  declineText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700' },
  acceptBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  acceptText: { color: '#0a1910', fontSize: 13, fontWeight: '900' },
});
