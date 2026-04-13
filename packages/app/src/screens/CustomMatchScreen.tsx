import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, Platform,
  TextInput, ScrollView, useWindowDimensions, SafeAreaView, Modal,
  KeyboardAvoidingView, Animated as RNAnimated, Easing, LayoutAnimation,
  UIManager,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, cmLayout } from '../utils/theme';
import { useGameStore } from '../stores/gameStore';
import { useUserStore } from '../stores/userStore';
import {
  adaptServerRooms, sortRooms, pinMyRooms, hasOpenSlot, isMyRoom,
  type Room, type RoomSortKey,
} from '../utils/roomDataAdapter';
import { BackgroundWatermark } from '../components/BackgroundWatermark';
import { CardView } from '../components/CardView';
import type { Card } from '@tichu/shared';

// Android: LayoutAnimation 활성화 (Phase 5 변경 9)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 빈 상태에 표시할 드래곤 카드 (CardView 에 전달)
const DRAGON_CARD: Card = { type: 'special', specialType: 'dragon' };

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

const SERIF = Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' });
const POLL_MS = 10_000;

/**
 * Custom Match — 풀스크린 페이지 (2차 리디자인)
 *
 * 변경 방향: "화려한 로비" → "빠르게 방 찾고 입장하는 도구"
 *
 * 구조:
 * - 상단바: 뒤로 + (선택적) 코인
 * - 섹션 헤더: 한글 타이틀 + 카운터 + "+ 방 만들기" 버튼
 * - 필터 바: 검색 + 빈자리만 + 비밀방 제외 + 정렬 + 새로고침
 * - 방 목록 (풀너비 풀프레스블 카드)
 * - 빈 상태 / 로딩 스켈레톤
 * - 방 만들기 모달 (중앙/시트)
 * - 비밀번호 모달
 */
export function CustomMatchScreen({
  onBack, onJoin, onCreateCustomRoom, onListRooms,
}: Props) {
  const { width } = useWindowDimensions();
  const layout = cmLayout(width);
  const isMobile = layout === 'mobile';

  const serverRooms = useGameStore((s) => s.customRoomList);
  const savedPlayerId = useUserStore((s) => s.playerId);
  const savedNickname = useUserStore((s) => s.nickname);
  const userCoins = useUserStore((s) => s.coins);

  // ─── 로딩 / 새로고침 상태 ─────────────────────────────
  // 첫 진입 시 skeleton 표시. 서버 응답이 한 번이라도 오면 false.
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRotation = useRef(new RNAnimated.Value(0)).current;

  // ─── Polling ────────────────────────────────────────
  useEffect(() => {
    onListRooms?.();
    const id = setInterval(() => onListRooms?.(), POLL_MS);
    return () => clearInterval(id);
  }, [onListRooms]);

  // 서버 응답이 한 번이라도 오면 로딩 해제 (빈 배열이어도 OK)
  const serverRoomsLen = serverRooms?.length ?? -1;
  useEffect(() => {
    if (serverRooms !== undefined && serverRooms !== null) {
      // 빈 상태 ↔ 방 목록 전환 부드럽게 (Phase 3 변경 9)
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [serverRoomsLen, serverRooms]);

  // ─── 어댑터 ─────────────────────────────────────────
  const rooms: Room[] = useMemo(() => {
    if (!serverRooms) return [];
    return adaptServerRooms(serverRooms as any);
  }, [serverRooms]);

  // 진짜 빈 상태 (로딩 끝났고 방 0개)
  const isEmpty = !initialLoading && rooms.length === 0;

  // ─── 필터 / 검색 / 정렬 ──────────────────────────────
  const [search, setSearch] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [hideLocked, setHideLocked] = useState(false);
  const [sortKey, setSortKey] = useState<RoomSortKey>('recent');

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rooms.filter((r) => {
      if (onlyOpen && r.playerCount >= 4) return false;
      if (hideLocked && r.hasPassword) return false;
      if (q.length > 0) {
        const hay = `${r.roomName} ${r.hostName ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = sortRooms(list, sortKey);
    list = pinMyRooms(list, savedPlayerId);
    return list;
  }, [rooms, search, onlyOpen, hideLocked, sortKey, savedPlayerId]);

  // ─── 방 만들기 모달 ───────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);

  // ─── 비밀번호 모달 ────────────────────────────────────
  const [pwTarget, setPwTarget] = useState<Room | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwAttempts, setPwAttempts] = useState(0);
  const [pwBlockedUntil, setPwBlockedUntil] = useState(0);

  // ─── 입장 시도 메시지 (race condition 등) ─────────────
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // 검색 input ref (키보드 단축키 / 포커스용)
  const searchInputRef = useRef<TextInput | null>(null);

  // ─── 핸들러 ─────────────────────────────────────────
  const handleEnterRoom = useCallback((room: Room) => {
    if (!savedPlayerId || !savedNickname) return;
    if (room.playerCount >= 4) {
      setToast('한발 늦었어요! 방이 가득 찼습니다.');
      onListRooms?.();
      return;
    }
    if (room.hasPassword) {
      setPwInput('');
      setPwError('');
      setPwTarget(room);
      return;
    }
    onJoin(room.roomId, savedPlayerId, savedNickname);
  }, [savedPlayerId, savedNickname, onJoin, onListRooms]);

  const handleConfirmPassword = useCallback(() => {
    if (!pwTarget || !savedPlayerId || !savedNickname) return;
    const now = Date.now();
    if (pwBlockedUntil > now) {
      const sec = Math.ceil((pwBlockedUntil - now) / 1000);
      setPwError(`잠시 후 다시 시도해 주세요 (${sec}초)`);
      return;
    }
    if (!pwInput.trim()) {
      setPwError('비밀번호를 입력해 주세요.');
      return;
    }
    // 서버가 거절하면 invalid_play 등으로 알려줄 것이라고 가정.
    // 지금은 클라이언트에서 즉시 전송.
    onJoin(pwTarget.roomId, savedPlayerId, savedNickname, pwInput.trim());
    // 낙관적으로 모달 닫음. 서버가 거절하면 상위에서 토스트 등으로 알림.
    setPwTarget(null);
    setPwInput('');
    setPwError('');
    setPwAttempts(0);
  }, [pwTarget, pwInput, pwBlockedUntil, savedPlayerId, savedNickname, onJoin]);

  const closePasswordModal = useCallback(() => {
    setPwTarget(null);
    setPwInput('');
    setPwError('');
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    // 새로고침 버튼 회전 애니메이션 (1회 360°)
    refreshRotation.setValue(0);
    RNAnimated.timing(refreshRotation, {
      toValue: 1,
      duration: 900,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
    onListRooms?.();
    // 안전 타임아웃: 서버 응답 없어도 2초 뒤 스피너 해제
    setTimeout(() => setRefreshing(false), 2000);
  }, [onListRooms, refreshRotation]);

  // ─── 키보드 단축키 (PC 웹 전용) ─────────────────────
  // ESC 뒤로, / 또는 Ctrl+F 검색 포커스, N 방 만들기.
  // 방향키 포커스 이동은 복잡도 대비 이득이 작아 이번 phase 에서는 생략.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const g: any = (typeof globalThis !== 'undefined' ? globalThis : {}) as any;
    const w: any = g.window;
    if (!w || typeof w.addEventListener !== 'function') return;
    const onKey = (e: any) => {
      // 입력 필드 안에서는 ESC 를 제외한 단축키 비활성
      const tag = e?.target?.tagName?.toLowerCase?.() ?? '';
      const inInput = tag === 'input' || tag === 'textarea';
      if (e.key === 'Escape') {
        if (createOpen) { setCreateOpen(false); return; }
        if (pwTarget) { closePasswordModal(); return; }
        onBack();
        return;
      }
      if (inInput) return;
      if (createOpen || pwTarget) return;
      if (e.key === '/' || (e.key.toLowerCase?.() === 'f' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault?.();
        searchInputRef.current?.focus?.();
        return;
      }
      if (e.key.toLowerCase?.() === 'n') {
        e.preventDefault?.();
        setCreateOpen(true);
        return;
      }
    };
    w.addEventListener('keydown', onKey);
    return () => {
      try { w.removeEventListener('keydown', onKey); } catch { /* noop */ }
    };
  }, [createOpen, pwTarget, onBack, closePasswordModal]);

  const handleCreateRoom = useCallback((form: CreateRoomForm) => {
    if (!savedPlayerId || !savedNickname) return;
    const name = form.name.trim();
    if (name.length < 1 || name.length > 20) return;
    const pw = form.password.trim();
    if (pw && (pw.length < 4 || pw.length > 20)) return;
    onCreateCustomRoom?.(
      name,
      pw ? pw : undefined,
      savedPlayerId,
      savedNickname,
    );
    setCreateOpen(false);
    // TODO: server — 서버 API 가 scoreLimit/turnTimer/allowSpectators 를 받아들이면
    // 여기서 함께 전송. 현재 useSocket 시그니처는 (name, password, playerId, nickname).
  }, [savedPlayerId, savedNickname, onCreateCustomRoom]);

  // ─── 상단 바 ─────────────────────────────────────────
  const TopBar = () => {
    const inner = (
      <View style={S.topbarInner}>
        <TouchableOpacity onPress={onBack} style={S.backBtn} activeOpacity={0.7}>
          <Text style={S.backText}>{'← 뒤로'}</Text>
        </TouchableOpacity>
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

  // ─── 섹션 헤더 ───────────────────────────────────────
  const SectionHeader = () => (
    <View style={[S.sectionHead, isMobile && S.sectionHeadMobile]}>
      <View style={S.titleRow}>
        <LinearGradient
          colors={[COLORS.cmGold, COLORS.cmGoldDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[S.titleAccent, isMobile && S.titleAccentMobile]}
        />
        <Text style={[S.titleKo, isMobile && S.titleKoMobile]}>{'커스텀 매치'}</Text>
      </View>
      <View style={S.headerRight}>
        {!isMobile && !initialLoading && !isEmpty && (
          <View style={S.countRow}>
            <Text style={S.countText}>{'대기중 '}</Text>
            <Text style={S.countNum}>{rooms.length}</Text>
            <Text style={S.countText}>{' 방'}</Text>
          </View>
        )}
        {/* 빈 상태에서는 중앙 CTA 에 시선 집중 — 우상단 만들기 버튼 숨김 */}
        {!isEmpty && (
          <CreateButton
            isMobile={isMobile}
            onPress={() => setCreateOpen(true)}
          />
        )}
      </View>
    </View>
  );

  // ─── 필터 바 ────────────────────────────────────────
  const rotateStyle = {
    transform: [{
      rotate: refreshRotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
      }),
    }],
  };

  const FilterBar = () => (
    <View style={[S.filterBar, isMobile && S.filterBarMobile]}>
      <View style={[S.search, isMobile && S.searchMobile]}>
        <Text style={S.searchIcon}>{'🔍'}</Text>
        <TextInput
          ref={searchInputRef}
          value={search}
          onChangeText={setSearch}
          placeholder={'방 이름 검색'}
          placeholderTextColor={COLORS.cmInkMute}
          style={S.searchInput}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={S.chipsContent}
      >
        {/* 토글 그룹 */}
        <Chip label={'빈자리만'} active={onlyOpen} onPress={() => setOnlyOpen(!onlyOpen)} dot />
        <Chip label={'비밀방 제외'} active={hideLocked} onPress={() => setHideLocked(!hideLocked)} dot />
        {/* 시각적 구분선 */}
        <View style={S.chipDivider} />
        {/* 정렬 그룹 — 좌측 ↕ 아이콘으로 정렬임을 표시 */}
        <Chip label={'↕ 최신순'} active={sortKey === 'recent'} onPress={() => setSortKey('recent')} />
        <Chip label={'↕ 빈자리 많은 순'} active={sortKey === 'open'} onPress={() => setSortKey('open')} />
        <Chip label={'↕ 곧 시작'} active={sortKey === 'starting'} onPress={() => setSortKey('starting')} />
      </ScrollView>
      {/* 새로고침 버튼 + 우상단 자동 갱신 점 (한 컴포넌트로 통합) */}
      <View style={S.refreshWrap}>
        <TouchableOpacity onPress={handleRefresh} style={S.iconBtn} activeOpacity={0.7}>
          <RNAnimated.Text style={[S.iconBtnText, rotateStyle]}>{'⟳'}</RNAnimated.Text>
        </TouchableOpacity>
        <View style={S.refreshAutoDot} pointerEvents="none" />
      </View>
    </View>
  );

  // ─── 본문 (로딩 / 빈 / 리스트) ──────────────────────
  const body = initialLoading ? (
    <SkeletonList />
  ) : filteredRooms.length === 0 ? (
    <EmptyState
      hasRooms={rooms.length > 0}
      onCreate={() => setCreateOpen(true)}
    />
  ) : (
    <ScrollView
      style={S.rooms}
      contentContainerStyle={S.roomsContent}
      showsVerticalScrollIndicator={false}
    >
      {filteredRooms.map((r) => (
        <RoomCard
          key={r.roomId}
          room={r}
          isMobile={isMobile}
          isMine={isMyRoom(r, savedPlayerId)}
          onPress={() => handleEnterRoom(r)}
        />
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={S.root}>
      {/* 배경: 로비와 동일한 BackgroundWatermark (splash.png) 재사용 */}
      <BackgroundWatermark />

      <TopBar />

      <View style={[S.main, isMobile && S.mainMobile]}>
        <SectionHeader />
        {/* 빈 상태에서는 필터 바 숨김 */}
        {!isEmpty && <FilterBar />}
        {body}
      </View>

      {/* 토스트 */}
      {toast && (
        <View style={S.toastWrap} pointerEvents="none">
          <View style={S.toast}>
            <Text style={S.toastText}>{toast}</Text>
          </View>
        </View>
      )}

      {/* 방 만들기 모달 */}
      <CreateRoomModal
        visible={createOpen}
        isMobile={isMobile}
        defaultName={savedNickname ? `${savedNickname}의 방` : ''}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreateRoom}
      />

      {/* 비밀번호 모달 */}
      <PasswordModal
        room={pwTarget}
        value={pwInput}
        error={pwError}
        onChange={setPwInput}
        onClose={closePasswordModal}
        onSubmit={handleConfirmPassword}
      />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────
// CreateButton
// ────────────────────────────────────────────────────────
function CreateButton({
  isMobile, onPress,
}: {
  isMobile: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        S.createBtnWrap,
        isMobile && S.createBtnWrapMobile,
        pressed && S.createBtnWrapPressed,
      ]}
    >
      <LinearGradient
        colors={[COLORS.cmGold, COLORS.cmGoldSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={[S.createBtnText, isMobile && S.createBtnTextMobile]}>
        {isMobile ? '＋' : '＋  방 만들기'}
      </Text>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────
// Chip
// ────────────────────────────────────────────────────────
function Chip({
  label, active, onPress, dot,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  dot?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        S.chip,
        active && S.chipActive,
        pressed && S.chipPressed,
      ]}
    >
      {dot && <View style={[S.chipDot, active && S.chipDotActive]} />}
      <Text style={[S.chipText, active && S.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────
// RoomCard — 카드 전체가 Pressable. 클릭 = 입장 시도.
// ────────────────────────────────────────────────────────
function RoomCard({
  room, isMobile, isMine, onPress,
}: {
  room: Room;
  isMobile: boolean;
  isMine: boolean;
  onPress: () => void;
}) {
  const filled = room.playerCount;
  const isFull = filled >= 4;

  // 메타 정보 (서버가 보내주는 것만 표시)
  const metaItems: string[] = [];
  if (room.hostName) metaItems.push(`👤 ${room.hostName}`);
  if (room.scoreLimit) metaItems.push(`🎯 ${room.scoreLimit}점`);
  if (room.turnTimer != null) metaItems.push(`⏱ ${room.turnTimer}s`);
  else if (room.turnTimer === null) metaItems.push(`⏱ 무제한`);
  if (room.allowSpectators) metaItems.push(`👁 관전`);

  const nameRow = (
    <View style={S.nameRow}>
      {room.hasPassword && <Text style={S.lockIcon}>{'🔒'}</Text>}
      <Text style={S.roomName} numberOfLines={1}>{room.roomName}</Text>
      {isMine && (
        <View style={S.myBadge}>
          <Text style={S.myBadgeText}>{'내 방'}</Text>
        </View>
      )}
    </View>
  );

  const slotsDisplay = (
    <View style={S.slotsRow}>
      <View style={S.slots}>
        {[0, 1, 2, 3].map((i) => {
          const filledThis = i < filled;
          return (
            <View
              key={i}
              style={[
                S.slot,
                filledThis && S.slotFilled,
                isFull && S.slotFilledFull,
              ]}
            >
              {filledThis && !isFull && (
                <LinearGradient
                  colors={[COLORS.cmGold, COLORS.cmGoldDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              {filledThis && isFull && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.cmInkMute }]} />
              )}
            </View>
          );
        })}
      </View>
      <Text style={[S.slotCount, isFull && S.slotCountFull]}>
        {`${filled}/4${isFull ? ' FULL' : ''}`}
      </Text>
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={isFull}
      style={({ pressed }) => [
        S.room,
        isMobile && S.roomMobile,
        isMine && S.roomMine,
        pressed && !isFull && S.roomPressed,
        isFull && S.roomFull,
      ]}
    >
      {isMine && <View style={S.roomAccent} />}

      {isMobile ? (
        <>
          <View style={S.roomMobileTop}>
            {nameRow}
          </View>
          {metaItems.length > 0 && (
            <Text style={S.metaText} numberOfLines={1}>
              {metaItems.join(' · ')}
            </Text>
          )}
          <View style={S.roomMobileBottom}>
            {slotsDisplay}
          </View>
        </>
      ) : (
        <>
          <View style={S.roomInfo}>
            {nameRow}
            {metaItems.length > 0 && (
              <Text style={S.metaText} numberOfLines={1}>
                {metaItems.join(' · ')}
              </Text>
            )}
          </View>
          {slotsDisplay}
        </>
      )}
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────
// SkeletonList — 로딩 중 표시
// ────────────────────────────────────────────────────────
function SkeletonList() {
  const pulse = useRef(new RNAnimated.Value(0.4)).current;
  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={S.rooms}>
      <View style={S.roomsContent}>
        {[0, 1, 2, 3].map((i) => (
          <RNAnimated.View key={i} style={[S.skelCard, { opacity: pulse }]} />
        ))}
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────
// EmptyState
// ────────────────────────────────────────────────────────
function EmptyState({
  hasRooms, onCreate,
}: {
  hasRooms: boolean;  // 필터링으로 0개 vs 아예 0개 구분
  onCreate: () => void;
}) {
  return (
    <View style={S.emptyWrap}>
      {/* 게임 내 CardView 재사용 — Dragon 카드 (가장 상징적) + 골드 글로우 */}
      <View style={S.emptyCardWrap}>
        <CardView card={DRAGON_CARD} size="large" />
      </View>
      {hasRooms ? (
        <>
          <Text style={S.emptyTitle}>{'조건에 맞는 방이 없어요'}</Text>
          <Text style={S.emptyBody}>{'필터를 조정해 보세요.'}</Text>
        </>
      ) : (
        <>
          <Text style={S.emptyTitle}>{'아직 대기중인 방이 없어요'}</Text>
          <Text style={S.emptyBody}>{'첫 번째 방을 만들어 친구들을 초대해보세요'}</Text>
          <Pressable
            onPress={onCreate}
            style={({ pressed }) => [S.emptyCta, pressed && S.emptyCtaPressed]}
          >
            <LinearGradient
              colors={[COLORS.cmGold, COLORS.cmGoldSoft]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={S.emptyCtaText}>{'＋ 방 만들기'}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────────
// CreateRoomModal
// ────────────────────────────────────────────────────────
export interface CreateRoomForm {
  name: string;
  password: string;
  scoreLimit: 500 | 1000 | 1500;
  turnTimer: number | null;
  allowSpectators: boolean;
}

function CreateRoomModal({
  visible, isMobile, defaultName, onClose, onSubmit,
}: {
  visible: boolean;
  isMobile: boolean;
  defaultName: string;
  onClose: () => void;
  onSubmit: (form: CreateRoomForm) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState('');
  const [scoreLimit, setScoreLimit] = useState<CreateRoomForm['scoreLimit']>(1000);
  const [turnTimer, setTurnTimer] = useState<number | null>(30);
  const [allowSpectators, setAllowSpectators] = useState(true);

  // visible 이 true 가 될 때마다 기본값 리셋
  useEffect(() => {
    if (visible) {
      setName(defaultName);
      setPassword('');
      setScoreLimit(1000);
      setTurnTimer(30);
      setAllowSpectators(true);
    }
  }, [visible, defaultName]);

  const trimmedName = name.trim();
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= 20;
  const trimmedPw = password.trim();
  const pwValid = trimmedPw.length === 0 || (trimmedPw.length >= 4 && trimmedPw.length <= 20);
  const canSubmit = nameValid && pwValid;

  function submit() {
    if (!canSubmit) return;
    onSubmit({ name, password, scoreLimit, turnTimer, allowSpectators });
  }

  const body = (
    <ScrollView
      style={S.formBody}
      contentContainerStyle={S.formBodyContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={S.formGroup}>
        <Text style={S.formLabel}>{'방 이름'}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={'예: 초보 환영! 즐겜만'}
          placeholderTextColor={COLORS.cmInkMute}
          style={[S.formInput, !nameValid && S.formInputError]}
          maxLength={20}
          autoFocus={!isMobile}
        />
        <Text style={S.formHint}>{`${trimmedName.length}/20`}</Text>
      </View>

      <View style={S.formGroup}>
        <Text style={S.formLabel}>{'점수 한도'}</Text>
        <View style={S.formChipRow}>
          <FormChip label={'500'} active={scoreLimit === 500} onPress={() => setScoreLimit(500)} />
          <FormChip label={'1000'} active={scoreLimit === 1000} onPress={() => setScoreLimit(1000)} />
          <FormChip label={'1500'} active={scoreLimit === 1500} onPress={() => setScoreLimit(1500)} />
        </View>
      </View>

      <View style={S.formGroup}>
        <Text style={S.formLabel}>{'턴 타이머'}</Text>
        <View style={S.formChipRow}>
          <FormChip label={'15s'} active={turnTimer === 15} onPress={() => setTurnTimer(15)} />
          <FormChip label={'20s'} active={turnTimer === 20} onPress={() => setTurnTimer(20)} />
          <FormChip label={'30s'} active={turnTimer === 30} onPress={() => setTurnTimer(30)} />
          <FormChip label={'무제한'} active={turnTimer === null} onPress={() => setTurnTimer(null)} />
        </View>
      </View>

      <View style={S.formGroup}>
        <ToggleRow label={'관전 허용'} value={allowSpectators} onChange={setAllowSpectators} />
      </View>

      <View style={S.formGroup}>
        <Text style={S.formLabel}>{'비밀번호 (선택)'}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={'4~20자'}
          placeholderTextColor={COLORS.cmInkMute}
          style={[S.formInput, !pwValid && S.formInputError]}
          secureTextEntry
          maxLength={20}
        />
        {!pwValid && <Text style={S.formError}>{'비밀번호는 4~20자여야 합니다.'}</Text>}
      </View>

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        style={({ pressed }) => [
          S.submitBtnWrap,
          pressed && canSubmit && S.submitBtnWrapPressed,
          !canSubmit && S.submitBtnWrapDisabled,
        ]}
      >
        <LinearGradient
          colors={canSubmit ? [COLORS.cmGold, COLORS.cmGoldSoft] : ['#555', '#333']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={S.submitBtn}
        >
          <Text style={[S.submitBtnText, !canSubmit && S.submitBtnTextDisabled]}>
            {'방  만  들  기'}
          </Text>
        </LinearGradient>
      </Pressable>
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType={isMobile ? 'slide' : 'fade'}
      transparent={!isMobile}
      onRequestClose={onClose}
    >
      {isMobile ? (
        <SafeAreaView style={S.sheetRoot}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={S.sheetHeader}>
              <TouchableOpacity onPress={onClose} style={S.backBtn}>
                <Text style={S.backText}>{'← 닫기'}</Text>
              </TouchableOpacity>
              <Text style={S.sheetTitle}>{'방 만들기'}</Text>
              <View style={{ width: 60 }} />
            </View>
            {body}
          </KeyboardAvoidingView>
        </SafeAreaView>
      ) : (
        <View style={S.pwBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={S.createModalCard}
          >
            <View style={S.createModalHeader}>
              <Text style={S.createModalTitle}>{'방 만들기'}</Text>
              <TouchableOpacity onPress={onClose} style={S.createModalClose}>
                <Text style={S.createModalCloseText}>{'✕'}</Text>
              </TouchableOpacity>
            </View>
            {body}
          </KeyboardAvoidingView>
        </View>
      )}
    </Modal>
  );
}

function FormChip({
  label, active, onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        S.formChip,
        active && S.formChipActive,
        pressed && S.chipPressed,
      ]}
    >
      <Text style={[S.formChipText, active && S.formChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  label, value, onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [S.toggleRow, pressed && S.chipPressed]}
    >
      <Text style={S.toggleLabel}>{label}</Text>
      <View style={[S.toggleBox, value && S.toggleBoxOn]}>
        <Text style={[S.toggleBoxText, value && S.toggleBoxTextOn]}>
          {value ? 'ON' : 'OFF'}
        </Text>
      </View>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────
// PasswordModal
// ────────────────────────────────────────────────────────
function PasswordModal({
  room, value, error, onChange, onClose, onSubmit,
}: {
  room: Room | null;
  value: string;
  error: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      visible={room !== null}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={S.pwBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={S.pwCard}
        >
          <Text style={S.pwTitle}>{'🔒 비밀번호 입력'}</Text>
          {room && (
            <Text style={S.pwSubtitle} numberOfLines={2}>{room.roomName}</Text>
          )}
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={'비밀번호'}
            placeholderTextColor={COLORS.cmInkMute}
            style={S.formInput}
            secureTextEntry
            autoFocus
            onSubmitEditing={onSubmit}
            returnKeyType="done"
            maxLength={20}
          />
          {!!error && <Text style={S.formError}>{error}</Text>}
          <View style={S.pwBtnRow}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [S.pwBtnGhost, pressed && S.chipPressed]}
            >
              <Text style={S.pwBtnGhostText}>{'취소'}</Text>
            </Pressable>
            <Pressable
              onPress={onSubmit}
              disabled={!value.trim()}
              style={({ pressed }) => [
                S.pwBtnPrimary,
                pressed && value.trim() && S.chipPressed,
                !value.trim() && S.submitBtnWrapDisabled,
              ]}
            >
              <LinearGradient
                colors={value.trim() ? [COLORS.cmGold, COLORS.cmGoldSoft] : ['#555', '#333']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={[S.pwBtnPrimaryText, !value.trim() && S.submitBtnTextDisabled]}>
                {'입장'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── 스타일 ──────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.cmBg0 },

  // Topbar
  topbar: {
    height: 64, zIndex: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.cmLine,
  },
  topbarSolid: { backgroundColor: COLORS.cmTopbarSolid },
  topbarInner: {
    flex: 1, paddingHorizontal: 24, flexDirection: 'row',
    alignItems: 'center', gap: 16,
  },
  backBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    minHeight: 44, justifyContent: 'center',
  },
  backText: { color: COLORS.cmInkDim, fontSize: 14, fontWeight: '500' },
  spacer: { flex: 1 },
  coinsPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.cmLine,
    backgroundColor: 'rgba(0,0,0,0.3)', minHeight: 32,
  },
  coinDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.cmGold },
  coinText: { color: COLORS.cmGold, fontSize: 13, fontWeight: '700' },

  // Main
  main: {
    flex: 1, zIndex: 5,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16,
    maxWidth: 1100, width: '100%', alignSelf: 'center',
  },
  mainMobile: { paddingHorizontal: 12, paddingTop: 12 },

  // Section head
  sectionHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16, gap: 12,
  },
  sectionHeadMobile: { marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  titleAccent: { width: 6, height: 30, borderRadius: 2 },
  titleAccentMobile: { width: 5, height: 24 },
  titleKo: { fontSize: 26, fontWeight: '900', color: COLORS.cmInk, letterSpacing: 1 },
  titleKoMobile: { fontSize: 22 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  countRow: { flexDirection: 'row', alignItems: 'center' },
  countText: { fontSize: 13, color: COLORS.cmInkDim },
  countNum: { fontSize: 15, color: COLORS.cmGold, fontWeight: '700' },

  // Create button
  createBtnWrap: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    minHeight: 44, minWidth: 44,
    shadowColor: COLORS.cmGold, shadowOpacity: 0.35,
    shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  createBtnWrapMobile: {
    width: 44, height: 44, borderRadius: 22, paddingHorizontal: 0, paddingVertical: 0,
  },
  createBtnWrapPressed: { opacity: 0.88, transform: [{ translateY: -1 }] },
  createBtnText: {
    color: COLORS.cmBg0, fontWeight: '900', fontSize: 14, letterSpacing: 1,
  },
  createBtnTextMobile: { fontSize: 22, lineHeight: 24 },

  // Filter bar
  filterBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1, borderColor: COLORS.cmLine,
    borderRadius: 12, marginBottom: 14,
  },
  filterBarMobile: {
    flexDirection: 'column', alignItems: 'stretch',
    padding: 10, gap: 8,
  },
  search: {
    flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1, borderColor: COLORS.cmLine,
    borderRadius: 8, minHeight: 44,
  },
  searchMobile: { minWidth: 0, width: '100%' },
  searchIcon: { color: COLORS.cmInkMute, fontSize: 14 },
  searchInput: {
    flex: 1, color: COLORS.cmInk, fontSize: 14, padding: 0,
  },
  chipsContent: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.cmLine,
    backgroundColor: 'rgba(0,0,0,0.3)', minHeight: 36,
  },
  chipActive: {
    borderColor: COLORS.cmGold, backgroundColor: 'rgba(255,210,74,0.12)',
  },
  chipPressed: { opacity: 0.7 },
  chipText: { color: COLORS.cmInkDim, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: COLORS.cmGold },
  chipDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cmInkMute,
  },
  chipDotActive: {
    backgroundColor: COLORS.cmGold,
    shadowColor: COLORS.cmGold, shadowOpacity: 0.8,
    shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  chipDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.cmLine,
    marginHorizontal: 6,
    alignSelf: 'center',
  },
  refreshWrap: {
    position: 'relative',
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1, borderColor: COLORS.cmLine,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnText: { color: COLORS.cmInkDim, fontSize: 18, fontWeight: '700' },
  refreshAutoDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.cmPingGood,
    borderWidth: 2,
    borderColor: COLORS.cmBg0,
    shadowColor: COLORS.cmPingGood,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },

  // Rooms list
  rooms: { flex: 1 },
  roomsContent: { paddingBottom: 90, gap: 10 },

  // Room card
  room: {
    flexDirection: 'row', alignItems: 'center', gap: 18,
    padding: 16, paddingHorizontal: 20,
    backgroundColor: 'rgba(26,71,42,0.5)',
    borderWidth: 1, borderColor: COLORS.cmLine,
    borderRadius: 12, overflow: 'hidden', position: 'relative',
  },
  roomMobile: {
    flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 14,
  },
  roomPressed: {
    backgroundColor: 'rgba(34,89,58,0.7)',
    borderColor: COLORS.cmLineStrong,
    shadowColor: COLORS.cmGold, shadowOpacity: 0.35,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  roomFull: {
    opacity: 0.55,
    backgroundColor: 'rgba(10,31,18,0.5)',
  },
  roomMine: {
    borderColor: COLORS.cmGold,
    shadowColor: COLORS.cmGold, shadowOpacity: 0.25,
    shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  roomAccent: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
    backgroundColor: COLORS.cmGold,
  },

  roomInfo: { flex: 1, minWidth: 0, gap: 4 },
  roomMobileTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomMobileBottom: { flexDirection: 'row', justifyContent: 'flex-end' },

  nameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1,
  },
  lockIcon: { fontSize: 14 },
  roomName: {
    fontSize: 16, fontWeight: '700', color: COLORS.cmInk,
    flexShrink: 1,
  },
  myBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    borderWidth: 1, borderColor: COLORS.cmGold,
    backgroundColor: 'rgba(255,210,74,0.15)',
  },
  myBadgeText: {
    color: COLORS.cmGold, fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
  },

  metaText: { fontSize: 12, color: COLORS.cmInkMute },

  // Slots
  slotsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slot: {
    width: 14, height: 18, borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1, borderColor: COLORS.cmLine,
    overflow: 'hidden',
  },
  slotFilled: {
    borderColor: COLORS.cmGold,
    shadowColor: COLORS.cmGold, shadowOpacity: 0.4,
    shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 3,
  },
  slotFilledFull: {
    borderColor: COLORS.cmInkMute, shadowOpacity: 0,
  },
  slotCount: {
    fontSize: 13, fontWeight: '700', color: COLORS.cmGold, minWidth: 40,
  },
  slotCountFull: { color: COLORS.cmInkMute },

  // Skeleton
  skelCard: {
    height: 80, borderRadius: 12, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: COLORS.cmLine,
  },

  // Empty state
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 40, gap: 14,
  },
  emptyCardWrap: {
    marginBottom: 12,
    // 골드 글로우 (Android elevation 으로 근사)
    shadowColor: COLORS.cmGold,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  emptyTitle: {
    fontSize: 20, fontWeight: '800', color: COLORS.cmInk,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 14, color: COLORS.cmInkMute, textAlign: 'center',
    marginBottom: 16,
  },
  emptyCta: {
    paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    minHeight: 52, minWidth: 200,
    shadowColor: COLORS.cmGold, shadowOpacity: 0.4,
    shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  emptyCtaPressed: { opacity: 0.9, transform: [{ translateY: -1 }] },
  emptyCtaText: {
    color: COLORS.cmBg0, fontSize: 16, fontWeight: '900',
    letterSpacing: 1,
  },

  // Toast
  toastWrap: {
    position: 'absolute', top: 80, left: 0, right: 0,
    alignItems: 'center', zIndex: 100,
  },
  toast: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1, borderColor: COLORS.cmDangerBorder,
    borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.4,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  toastText: { color: COLORS.cmInk, fontSize: 13, fontWeight: '600' },

  // Create modal (desktop: centered card)
  createModalCard: {
    width: '90%', maxWidth: 440,
    backgroundColor: COLORS.cmBg1,
    borderWidth: 1, borderColor: COLORS.cmGold,
    borderRadius: 14,
    maxHeight: '85%',
    shadowColor: COLORS.cmGold, shadowOpacity: 0.3,
    shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12,
    overflow: 'hidden',
  },
  createModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.cmLine,
  },
  createModalTitle: {
    color: COLORS.cmGold, fontSize: 18, fontWeight: '800', letterSpacing: 1,
  },
  createModalClose: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  createModalCloseText: { color: COLORS.cmInkDim, fontSize: 18 },

  // Form body (shared between mobile sheet and desktop modal)
  formBody: { flex: 1 },
  formBodyContent: { padding: 20, gap: 18 },
  formGroup: { gap: 8 },
  formLabel: {
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
    color: COLORS.cmInkMute, fontWeight: '700', fontFamily: SERIF,
  },
  formInput: {
    color: COLORS.cmInk, fontSize: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1, borderColor: COLORS.cmLine,
    borderRadius: 8, minHeight: 44,
  },
  formInputError: { borderColor: COLORS.cmDanger },
  formHint: { color: COLORS.cmInkMute, fontSize: 11, textAlign: 'right' },
  formError: { color: COLORS.cmDangerSoft, fontSize: 12 },
  formChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.cmLine,
    backgroundColor: 'rgba(0,0,0,0.3)',
    minHeight: 40, alignItems: 'center', justifyContent: 'center',
  },
  formChipActive: {
    borderColor: COLORS.cmGold, backgroundColor: 'rgba(255,210,74,0.12)',
  },
  formChipText: { color: COLORS.cmInkDim, fontSize: 13, fontWeight: '600' },
  formChipTextActive: { color: COLORS.cmGold },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1, borderColor: COLORS.cmLine,
    borderRadius: 8, minHeight: 44,
  },
  toggleLabel: { color: COLORS.cmInk, fontSize: 14, fontWeight: '600' },
  toggleBox: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.cmLine,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  toggleBoxOn: {
    borderColor: COLORS.cmGold, backgroundColor: 'rgba(255,210,74,0.15)',
  },
  toggleBoxText: {
    color: COLORS.cmInkMute, fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
  },
  toggleBoxTextOn: { color: COLORS.cmGold },

  submitBtnWrap: {
    marginTop: 6, borderRadius: 10, overflow: 'hidden',
    shadowColor: COLORS.cmGold, shadowOpacity: 0.3,
    shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  submitBtnWrapPressed: { opacity: 0.9, transform: [{ translateY: -1 }] },
  submitBtnWrapDisabled: { shadowOpacity: 0, elevation: 0 },
  submitBtn: {
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
    minHeight: 52,
  },
  submitBtnText: {
    color: COLORS.cmBg0, fontWeight: '900', fontSize: 15,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  submitBtnTextDisabled: { color: '#999' },

  // Mobile sheet
  sheetRoot: { flex: 1, backgroundColor: COLORS.cmBg0 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.cmLine,
  },
  sheetTitle: {
    color: COLORS.cmGold, fontSize: 16, fontWeight: '700',
    fontFamily: SERIF, letterSpacing: 1,
  },

  // Password modal
  pwBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  pwCard: {
    width: '100%', maxWidth: 360,
    backgroundColor: COLORS.cmBg1,
    borderWidth: 1, borderColor: COLORS.cmGold,
    borderRadius: 14, padding: 24, gap: 14,
    shadowColor: COLORS.cmGold, shadowOpacity: 0.3,
    shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  pwTitle: {
    color: COLORS.cmGold, fontSize: 18, fontWeight: '700', textAlign: 'center',
  },
  pwSubtitle: {
    color: COLORS.cmInkDim, fontSize: 13, textAlign: 'center',
  },
  pwBtnRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  pwBtnGhost: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.cmLine,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center', minHeight: 44,
  },
  pwBtnGhostText: { color: COLORS.cmInkDim, fontSize: 14, fontWeight: '600' },
  pwBtnPrimary: {
    flex: 1, borderRadius: 8, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', minHeight: 44,
  },
  pwBtnPrimaryText: {
    color: COLORS.cmBg0, fontSize: 14, fontWeight: '900', letterSpacing: 1,
  },
});
