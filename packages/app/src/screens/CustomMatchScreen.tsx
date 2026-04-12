import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  useWindowDimensions, SafeAreaView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, cmLayout } from '../utils/theme';
import { useGameStore } from '../stores/gameStore';
import { useUserStore } from '../stores/userStore';
import {
  adaptServerRooms, generateMockRooms, countWaitingPlayers,
  type FullRoom,
} from '../utils/roomDataAdapter';

interface Props {
  onBack: () => void;
  onJoin: (roomId: string, playerId: string, nickname: string, password?: string) => void;
  onCreateCustomRoom?: (
    roomName: string,
    password: string | undefined,
    playerId: string,
    nickname: string,
  ) => void;
  onListRooms?: () => void;
}

/**
 * Custom Match — 풀스크린 페이지
 *
 * Phase 2: 골격 (상단바, 반응형 grid, 배경 龍/鳳, 좌/우 placeholder, 라우팅)
 * Phase 3+: 좌측 방 목록, 우측 상세 패널 등 채워짐
 */
export function CustomMatchScreen({
  onBack, onJoin, onCreateCustomRoom, onListRooms,
}: Props) {
  const { width } = useWindowDimensions();
  const layout = cmLayout(width);
  const isDesktop = layout === 'desktop';
  const isTablet = layout === 'tablet';
  const isMobile = layout === 'mobile';

  // 서버 방 목록 (기존 store/socket 재사용)
  const serverRooms = useGameStore((s) => s.customRoomList);
  const savedPlayerId = useUserStore((s) => s.playerId);
  const savedNickname = useUserStore((s) => s.nickname);
  const userCoins = useUserStore((s) => s.coins);

  // 진입 시 1회 + 10초 polling
  useEffect(() => {
    onListRooms?.();
    const id = setInterval(() => onListRooms?.(), 10_000);
    return () => clearInterval(id);
  }, [onListRooms]);

  // 어댑터: 서버 응답이 비었으면 mock 데모 방 사용 (개발/첫 진입시)
  // TODO: server 보강 후 generateMockRooms 호출 제거
  const rooms: FullRoom[] = useMemo(() => {
    if (serverRooms && serverRooms.length > 0) return adaptServerRooms(serverRooms);
    return generateMockRooms();
  }, [serverRooms]);

  // 첫 방 자동 선택
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  useEffect(() => {
    if (rooms.length > 0 && !selectedRoomId) {
      setSelectedRoomId(rooms[0]!.id);
    }
    // 선택된 방이 더 이상 목록에 없으면 첫 방으로
    if (selectedRoomId && !rooms.find(r => r.id === selectedRoomId)) {
      setSelectedRoomId(rooms[0]?.id ?? null);
    }
  }, [rooms]);

  const totalPlayers = countWaitingPlayers(rooms);

  // ─── 상단 바 ─────────────────────────────────────────────
  // iOS 는 BlurView, Android 는 단색 fallback (Platform 분기)
  const TopBar = () => {
    const inner = (
      <View style={S.topbarInner}>
        <TouchableOpacity onPress={onBack} style={S.backBtn} activeOpacity={0.7}>
          <Text style={S.backText}>{'← 뒤로'}</Text>
        </TouchableOpacity>

        {!isMobile && (
          <View style={S.crumbs}>
            <Text style={S.crumb}>{'HOME'}</Text>
            <Text style={S.crumbSep}>{'/'}</Text>
            <Text style={S.crumb}>{'PLAY'}</Text>
            <Text style={S.crumbSep}>{'/'}</Text>
            <Text style={[S.crumb, S.crumbActive]}>{'CUSTOM MATCH'}</Text>
          </View>
        )}

        <View style={S.spacer} />

        <View style={S.coinsPill}>
          <View style={S.coinDot} />
          <Text style={S.coinText}>{userCoins}</Text>
        </View>
      </View>
    );

    if (Platform.OS === 'ios') {
      return (
        <BlurView intensity={20} tint="dark" style={S.topbar}>
          {inner}
        </BlurView>
      );
    }
    return <View style={[S.topbar, S.topbarSolid]}>{inner}</View>;
  };

  // ─── 좌측: Phase 3 에서 채움 ────────────────────────────
  const LeftPanel = (
    <View style={S.leftPanel}>
      <Text style={S.placeholderText}>{'[좌측 방 목록 영역 — Phase 3]'}</Text>
      <Text style={S.placeholderSub}>{`방 ${rooms.length}개 · 플레이어 ${totalPlayers}명 (${layout})`}</Text>
    </View>
  );

  // ─── 우측: Phase 4 에서 채움 ────────────────────────────
  const RightPanel = (
    <View style={[S.rightPanel, isDesktop && S.rightPanelDesktop, isTablet && S.rightPanelTablet]}>
      <Text style={S.placeholderText}>{'[우측 상세 패널 — Phase 4]'}</Text>
      <Text style={S.placeholderSub}>{selectedRoomId ?? '(선택 없음)'}</Text>
    </View>
  );

  return (
    <SafeAreaView style={S.root}>
      {/* 배경 레이어 */}
      <View style={S.bg} pointerEvents="none">
        <LinearGradient
          colors={['#0a1f12', '#0e2e1a', '#061509']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* 한자 龍 / 鳳 (양옆) */}
        {!isMobile && (
          <>
            <Text style={[S.dragon, S.dragonLeft]}>{'龍'}</Text>
            <Text style={[S.dragon, S.dragonRight]}>{'鳳'}</Text>
          </>
        )}
      </View>

      {/* 상단 바 */}
      <TopBar />

      {/* 메인 영역 */}
      <View
        style={[
          S.main,
          isDesktop && S.mainDesktop,
          isTablet && S.mainTablet,
          isMobile && S.mainMobile,
        ]}
      >
        {LeftPanel}
        {/* 데스크톱/태블릿: 우측 패널 즉시 표시. 모바일은 Phase 5 에서 슬라이드업 시트로 처리 */}
        {!isMobile && RightPanel}
      </View>
    </SafeAreaView>
  );
}

// ─── 스타일 ──────────────────────────────────────────────
const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.cmBg0,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  dragon: {
    position: 'absolute',
    fontSize: 520,
    fontFamily: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' }),
    fontWeight: '700',
    color: 'rgba(255,210,74,0.025)',
    lineHeight: 520,
    top: '50%',
    marginTop: -260,
  },
  dragonLeft: { left: '8%' },
  dragonRight: { right: '8%' },

  // ─── Topbar ─────
  topbar: {
    height: 64,
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cmLine,
  },
  topbarSolid: {
    backgroundColor: COLORS.cmTopbarSolid,
  },
  topbarInner: {
    flex: 1,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  backBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    color: COLORS.cmInkDim,
    fontSize: 14,
    fontWeight: '500',
  },
  crumbs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  crumb: {
    fontSize: 13,
    letterSpacing: 2,
    color: COLORS.cmInkMute,
    fontFamily: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' }),
    fontWeight: '600',
  },
  crumbSep: {
    color: COLORS.cmInkMute,
    opacity: 0.4,
  },
  crumbActive: {
    color: COLORS.cmGold,
  },
  spacer: { flex: 1 },
  coinsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    backgroundColor: 'rgba(0,0,0,0.3)',
    minHeight: 32,
  },
  coinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.cmGold,
  },
  coinText: {
    color: COLORS.cmGold,
    fontSize: 13,
    fontWeight: '700',
  },

  // ─── Main grid ─────
  main: {
    flex: 1,
    zIndex: 5,
  },
  mainDesktop: {
    flexDirection: 'row',
    gap: 24,
    padding: 24,
    paddingHorizontal: 28,
  },
  mainTablet: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
  },
  mainMobile: {
    flexDirection: 'column',
    padding: 12,
  },

  leftPanel: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  rightPanel: {
    backgroundColor: 'rgba(14,46,26,0.85)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  rightPanelDesktop: {
    width: 420,
  },
  rightPanelTablet: {
    width: 360,
  },

  placeholderText: {
    color: COLORS.cmInkDim,
    fontSize: 14,
    marginBottom: 6,
  },
  placeholderSub: {
    color: COLORS.cmInkMute,
    fontSize: 12,
  },
});
