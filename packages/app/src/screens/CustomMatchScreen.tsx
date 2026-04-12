import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable, Platform,
  TextInput, ScrollView, useWindowDimensions, SafeAreaView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, cmLayout } from '../utils/theme';
import { useGameStore } from '../stores/gameStore';
import { useUserStore } from '../stores/userStore';
import {
  adaptServerRooms, generateMockRooms, countWaitingPlayers, pingQuality,
  type FullRoom, type FullRoomMode,
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

type ModeFilter = 'all' | 'normal' | 'ranked';
type RightTab = 'info' | 'create';

const SERIF = Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' });

/**
 * Custom Match — 풀스크린 페이지
 *
 * Phase 3 까지 구현 범위:
 * - 상단바 (뒤로/브레드크럼/코인)
 * - 배경 (gradient + 龍鳳)
 * - 메인 grid 반응형
 * - 좌측 섹션 헤더 + 필터 바 + 방 목록(가로/세로 카드)
 * - 우측은 placeholder (Phase 4 에서 교체)
 */
export function CustomMatchScreen({
  onBack, onJoin, onCreateCustomRoom, onListRooms,
}: Props) {
  const { width } = useWindowDimensions();
  const layout = cmLayout(width);
  const isDesktop = layout === 'desktop';
  const isTablet = layout === 'tablet';
  const isMobile = layout === 'mobile';

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

  // 어댑터: 서버 응답이 비었으면 mock 데모 방 사용
  // TODO: server 보강 후 generateMockRooms 호출 제거
  const allRooms: FullRoom[] = useMemo(() => {
    if (serverRooms && serverRooms.length > 0) return adaptServerRooms(serverRooms);
    return generateMockRooms();
  }, [serverRooms]);

  // 필터 / 검색 상태
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [hideLocked, setHideLocked] = useState(false);

  const rooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRooms.filter((r) => {
      if (modeFilter !== 'all' && r.mode !== modeFilter) return false;
      const filledCount = r.players.filter(Boolean).length;
      if (onlyOpen && filledCount >= 4) return false;
      if (hideLocked && r.hasPassword) return false;
      if (q.length > 0) {
        const hay = (r.name + ' ' + r.host.name).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRooms, search, modeFilter, onlyOpen, hideLocked]);

  // 첫 방 자동 선택
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  useEffect(() => {
    if (rooms.length > 0 && (!selectedRoomId || !rooms.find(r => r.id === selectedRoomId))) {
      setSelectedRoomId(rooms[0]!.id);
    }
    if (rooms.length === 0) setSelectedRoomId(null);
  }, [rooms]);

  const selectedRoom = useMemo(
    () => rooms.find(r => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const totalPlayers = countWaitingPlayers(allRooms);

  // 비밀번호 입력 모달 (Phase 5 에서 풀 통합 — 임시 placeholder)
  const [pwTarget, setPwTarget] = useState<FullRoom | null>(null);

  // 우측 패널 탭
  const [rightTab, setRightTab] = useState<RightTab>('info');

  function handleEnterRoom(room: FullRoom) {
    if (!savedPlayerId || !savedNickname) return;
    if (room.hasPassword) {
      setPwTarget(room);
      return;
    }
    onJoin(room.id, savedPlayerId, savedNickname);
  }

  function handleRefresh() {
    onListRooms?.();
  }

  function handleCreateRoom(form: CreateRoomForm) {
    if (!savedPlayerId || !savedNickname) return;
    if (!form.name.trim()) return;
    onCreateCustomRoom?.(
      form.name.trim(),
      form.password.trim() ? form.password.trim() : undefined,
      savedPlayerId,
      savedNickname,
    );
    // TODO: server — mode/scoreLimit/turnTimer/allowSpectators/aiFill 도 같이 보내려면
    // useSocket의 createCustomRoom 시그니처 확장 필요. 지금은 이름+비번만 전송.
  }

  // ─── 상단 바 ─────────────────────────────────────────────
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

  // ─── 좌측 섹션 ──────────────────────────────────────────
  const LeftSection = (
    <View style={S.left}>
      {/* 섹션 헤더 */}
      <View style={[S.sectionHead, isMobile && S.sectionHeadMobile]}>
        <View style={S.titleRow}>
          <LinearGradient
            colors={[COLORS.cmGold, COLORS.cmGoldDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={S.titleAccent}
          />
          <Text style={[S.titleEn, isMobile && S.titleEnMobile]}>{'Custom Match'}</Text>
          {!isMobile && <Text style={S.titleKo}>{'커스텀 매치'}</Text>}
        </View>
        <View style={S.countRow}>
          <Text style={S.countText}>{'대기중 '}</Text>
          <Text style={S.countNum}>{rooms.length}</Text>
          <Text style={S.countText}>{' 방 · 플레이어 '}</Text>
          <Text style={S.countNum}>{totalPlayers}</Text>
          <Text style={S.countText}>{'명'}</Text>
        </View>
      </View>

      {/* 필터 바 */}
      <View style={[S.filterBar, isMobile && S.filterBarMobile]}>
        <View style={[S.search, isMobile && S.searchMobile]}>
          <Text style={S.searchIcon}>{'🔍'}</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={'방 이름 또는 방장 검색...'}
            placeholderTextColor={COLORS.cmInkMute}
            style={S.searchInput}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={S.chipsScroll}
          contentContainerStyle={S.chipsContent}
        >
          <Chip label={'전체'} active={modeFilter === 'all'} onPress={() => setModeFilter('all')} />
          <Chip label={'일반전'} active={modeFilter === 'normal'} onPress={() => setModeFilter('normal')} />
          <Chip label={'랭크'} active={modeFilter === 'ranked'} onPress={() => setModeFilter('ranked')} />
          <Chip label={'빈자리만'} active={onlyOpen} onPress={() => setOnlyOpen(!onlyOpen)} dot />
          <Chip label={'비밀방 제외'} active={hideLocked} onPress={() => setHideLocked(!hideLocked)} dot />
        </ScrollView>
        <TouchableOpacity onPress={handleRefresh} style={S.iconBtn} activeOpacity={0.7}>
          <Text style={S.iconBtnText}>{'⟳'}</Text>
        </TouchableOpacity>
      </View>

      {/* 방 목록 */}
      <ScrollView
        style={S.rooms}
        contentContainerStyle={S.roomsContent}
        showsVerticalScrollIndicator={false}
      >
        {rooms.length === 0 && (
          <View style={S.emptyState}>
            <Text style={S.emptyText}>{'조건에 맞는 방이 없습니다.'}</Text>
            <Text style={S.emptySub}>{'필터를 조정하거나 방을 만들어 보세요.'}</Text>
          </View>
        )}
        {rooms.map((r) => (
          <RoomCard
            key={r.id}
            room={r}
            selected={r.id === selectedRoomId}
            isMobile={isMobile}
            onPress={() => setSelectedRoomId(r.id)}
            onEnter={() => handleEnterRoom(r)}
          />
        ))}
      </ScrollView>
    </View>
  );

  // ─── 우측 상세 패널 ────────────────────────────────────
  const RightPanel = (
    <View style={[
      S.rightPanel,
      isDesktop && S.rightPanelDesktop,
      isTablet && S.rightPanelTablet,
    ]}>
      <View style={S.rightTabs}>
        <Pressable
          onPress={() => setRightTab('info')}
          style={({ pressed }) => [
            S.rightTab,
            rightTab === 'info' && S.rightTabActive,
            pressed && S.rightTabPressed,
          ]}
        >
          <Text style={[S.rightTabText, rightTab === 'info' && S.rightTabTextActive]}>
            {'방 정보'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setRightTab('create')}
          style={({ pressed }) => [
            S.rightTab,
            rightTab === 'create' && S.rightTabActive,
            pressed && S.rightTabPressed,
          ]}
        >
          <Text style={[S.rightTabText, rightTab === 'create' && S.rightTabTextActive]}>
            {'＋ 방 만들기'}
          </Text>
        </Pressable>
      </View>

      {rightTab === 'info' ? (
        <RoomInfoTab
          room={selectedRoom}
          onEnter={() => selectedRoom && handleEnterRoom(selectedRoom)}
        />
      ) : (
        <RoomCreateTab onSubmit={handleCreateRoom} />
      )}
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
        {!isMobile && (
          <>
            <Text style={[S.dragon, S.dragonLeft]}>{'龍'}</Text>
            <Text style={[S.dragon, S.dragonRight]}>{'鳳'}</Text>
          </>
        )}
      </View>

      <TopBar />

      <View
        style={[
          S.main,
          isDesktop && S.mainDesktop,
          isTablet && S.mainTablet,
          isMobile && S.mainMobile,
        ]}
      >
        {LeftSection}
        {!isMobile && RightPanel}
      </View>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────
// Chip 컴포넌트
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
      {dot && (
        <View style={[S.chipDot, active && S.chipDotActive]} />
      )}
      <Text style={[S.chipText, active && S.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────
// RoomCard 컴포넌트 (가로/세로 분기)
// ────────────────────────────────────────────────────────
function RoomCard({
  room, selected, isMobile, onPress, onEnter,
}: {
  room: FullRoom;
  selected: boolean;
  isMobile: boolean;
  onPress: () => void;
  onEnter: () => void;
}) {
  const filled = room.players.filter(Boolean).length;
  const isFull = filled >= 4;
  const ping = pingQuality(room.ping);

  // 아바타
  const avatar = (
    <View style={S.avatar}>
      <LinearGradient
        colors={[COLORS.cmGold, COLORS.cmGoldDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={S.avatarChar}>{room.host.avatarChar}</Text>
      <View style={S.avatarLvl}>
        <Text style={S.avatarLvlText}>{room.host.level}</Text>
      </View>
    </View>
  );

  // 방 이름 + 뱃지
  const nameRow = (
    <View style={S.nameRow}>
      <Text style={S.roomName} numberOfLines={1}>{room.name}</Text>
      <Badge mode={room.mode} />
      {room.hasPassword && <BadgeLock />}
    </View>
  );

  // 메타 정보
  const metaItems: { icon: string; text: string }[] = [
    { icon: '👤', text: room.host.name },
    { icon: '⭐', text: room.host.rating.toLocaleString() },
    { icon: '🎯', text: `${room.scoreLimit}점` },
  ];
  if (room.turnTimer) metaItems.push({ icon: '⏱', text: `${room.turnTimer}s/턴` });
  if (room.allowSpectators) metaItems.push({ icon: '👁', text: '관전허용' });
  if (room.aiFill) metaItems.push({ icon: '🤖', text: 'AI 채움' });

  const meta = (
    <View style={[S.metaRow, isMobile && S.metaRowMobile]}>
      {metaItems.map((m, i) => (
        <View key={i} style={S.metaItem}>
          <Text style={S.metaIcon}>{m.icon}</Text>
          <Text style={S.metaText}>{m.text}</Text>
        </View>
      ))}
    </View>
  );

  // 슬롯 표시
  const slots = (
    <View style={S.slots}>
      {[0, 1, 2, 3].map((i) => {
        const filledThis = i < filled;
        return (
          <View key={i} style={[S.slot, filledThis && S.slotFilled]}>
            {filledThis && (
              <LinearGradient
                colors={[COLORS.cmGold, COLORS.cmGoldDeep]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>
        );
      })}
    </View>
  );

  // 핑 표시
  const pingDisplay = (
    <View style={S.ping}>
      <View style={[S.pingBar, { height: 6 }, ping === 'good' && S.pingBarGood]} />
      <View style={[S.pingBar, { height: 9 }, ping === 'good' && S.pingBarGood]} />
      <View style={[S.pingBar, { height: 12 }, ping === 'good' && S.pingBarGood]} />
      <Text style={[S.pingText, ping === 'good' && S.pingTextGood]}>{room.ping}ms</Text>
    </View>
  );

  // 입장 버튼
  const enterBtn = (
    <Pressable
      onPress={onEnter}
      style={({ pressed }) => [
        S.enterMini,
        pressed && S.enterMiniPressed,
        isFull && S.enterMiniSpectate,
      ]}
    >
      <Text style={[S.enterMiniText, isFull && S.enterMiniTextSpectate]}>
        {isFull ? '관전' : '입장'}
      </Text>
    </Pressable>
  );

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        S.room,
        isMobile && S.roomMobile,
        selected && S.roomSelected,
        pressed && !selected && S.roomPressed,
      ]}
    >
      {/* 좌측 골드 액센트 바 (selected 시 표시) */}
      {selected && <View style={S.roomAccent} />}

      {isMobile ? (
        // 모바일: 세로 배치
        <>
          <View style={S.roomMobileTop}>
            {avatar}
            <View style={S.roomMobileTopInfo}>
              {nameRow}
            </View>
          </View>
          {meta}
          <View style={S.roomMobileBottom}>
            {slots}
            <View style={S.roomMobileBottomRight}>
              {pingDisplay}
              {enterBtn}
            </View>
          </View>
        </>
      ) : (
        // 데스크톱/태블릿: 가로 배치
        <>
          {avatar}
          <View style={S.roomInfo}>
            {nameRow}
            {meta}
          </View>
          {slots}
          {pingDisplay}
          {enterBtn}
        </>
      )}
    </Pressable>
  );
}

// ────────────────────────────────────────────────────────
// RoomInfoTab — 우측 패널의 "방 정보" 탭
// ────────────────────────────────────────────────────────
function RoomInfoTab({ room, onEnter }: { room: FullRoom | null; onEnter: () => void }) {
  if (!room) {
    return (
      <View style={S.rightBody}>
        <View style={S.emptyState}>
          <Text style={S.emptyText}>{'방을 선택해 주세요'}</Text>
          <Text style={S.emptySub}>{'좌측 목록에서 방을 클릭하면\n상세 정보가 표시됩니다.'}</Text>
        </View>
      </View>
    );
  }

  const filled = room.players.filter(Boolean).length;
  const team1Slots: (typeof room.players[number])[] = [
    room.players[0] ?? null,
    room.players[2] ?? null,
  ];
  const team2Slots: (typeof room.players[number])[] = [
    room.players[1] ?? null,
    room.players[3] ?? null,
  ];

  return (
    <ScrollView
      style={S.rightBody}
      contentContainerStyle={S.rightBodyContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Preview head */}
      <View style={S.previewHead}>
        <View style={S.previewAvatar}>
          <LinearGradient
            colors={[COLORS.cmGold, COLORS.cmGoldDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={S.previewAvatarChar}>{room.host.avatarChar}</Text>
          <View style={S.avatarLvl}>
            <Text style={S.avatarLvlText}>{room.host.level}</Text>
          </View>
        </View>
        <View style={S.previewMeta}>
          <Text style={S.previewName} numberOfLines={2}>{room.name}</Text>
          <Text style={S.previewHost}>
            {`방장 · ${room.host.name} · ⭐ ${room.host.rating.toLocaleString()}`}
          </Text>
        </View>
      </View>

      {/* Info grid 2x2 */}
      <View style={S.infoGrid}>
        <InfoCell label={'Mode'} value={room.mode === 'ranked' ? '랭크' : '일반전'} />
        <InfoCell
          label={'Score'}
          value={`${room.scoreLimit.toLocaleString()} 점`}
          gold
        />
        <InfoCell
          label={'Turn Timer'}
          value={room.turnTimer ? `${room.turnTimer} 초` : '무제한'}
        />
        <InfoCell
          label={'Spectators'}
          value={
            room.allowSpectators
              ? room.spectatorCount > 0
                ? `허용 · ${room.spectatorCount}명 관전중`
                : '허용'
              : '비허용'
          }
        />
      </View>

      {/* Players section */}
      <View>
        <View style={S.playersTitle}>
          <Text style={S.playersTitleText}>{'플레이어'}</Text>
          <Text style={S.playersTitleText}>{`${filled} / 4`}</Text>
        </View>
        <View style={S.teams}>
          <TeamBox label={'▲ 팀 1'} variant={'t1'} slots={team1Slots} />
          <TeamBox label={'▼ 팀 2'} variant={'t2'} slots={team2Slots} />
        </View>
      </View>

      {/* Enter button */}
      <Pressable
        onPress={onEnter}
        style={({ pressed }) => [
          S.enterBtnWrap,
          pressed && S.enterBtnWrapPressed,
        ]}
      >
        <LinearGradient
          colors={[COLORS.cmGold, COLORS.cmGoldSoft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={S.enterBtn}
        >
          <Text style={S.enterBtnText}>{filled >= 4 ? '관 전 하 기' : '입 장 하 기'}</Text>
        </LinearGradient>
      </Pressable>

      <Text style={S.footnote}>{`평균 핑 ${room.ping}ms · 한국 서버`}</Text>
    </ScrollView>
  );
}

function InfoCell({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <View style={S.infoCell}>
      <Text style={S.infoCellLabel}>{label}</Text>
      <Text style={[S.infoCellValue, gold && S.infoCellValueGold]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function TeamBox({
  label, variant, slots,
}: {
  label: string;
  variant: 't1' | 't2';
  slots: (FullRoom['players'][number] | null)[];
}) {
  return (
    <View style={S.team}>
      <Text style={[S.teamLabel, variant === 't1' ? S.teamLabelT1 : S.teamLabelT2]}>
        {label}
      </Text>
      <View style={S.teamSlots}>
        {slots.map((p, i) => (
          <View
            key={i}
            style={[
              S.playerSlot,
              p ? S.playerSlotFilled : S.playerSlotEmpty,
            ]}
          >
            {p ? (
              <>
                <View style={S.miniAvatar}>
                  <LinearGradient
                    colors={[COLORS.cmGold, COLORS.cmGoldDeep]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={S.miniAvatarChar}>{p.avatarChar}</Text>
                </View>
                <Text style={S.playerSlotName} numberOfLines={1}>{p.name}</Text>
              </>
            ) : (
              <Text style={S.playerSlotEmptyText}>{'＋ 빈자리'}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ────────────────────────────────────────────────────────
// RoomCreateTab — "방 만들기" 탭
// ────────────────────────────────────────────────────────
export interface CreateRoomForm {
  name: string;
  password: string;
  mode: FullRoomMode;
  scoreLimit: 500 | 1000 | 1500;
  turnTimer: number | null;
  allowSpectators: boolean;
  aiFill: boolean;
}

function RoomCreateTab({ onSubmit }: { onSubmit: (form: CreateRoomForm) => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<FullRoomMode>('normal');
  const [scoreLimit, setScoreLimit] = useState<CreateRoomForm['scoreLimit']>(1000);
  const [turnTimer, setTurnTimer] = useState<number | null>(20);
  const [allowSpectators, setAllowSpectators] = useState(true);
  const [aiFill, setAiFill] = useState(false);

  const canSubmit = name.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    onSubmit({ name, password, mode, scoreLimit, turnTimer, allowSpectators, aiFill });
  }

  return (
    <ScrollView
      style={S.rightBody}
      contentContainerStyle={S.rightBodyContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 방 이름 */}
      <View style={S.formGroup}>
        <Text style={S.formLabel}>{'방 이름'}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={'예: 초보 환영, 즐겜만!'}
          placeholderTextColor={COLORS.cmInkMute}
          style={S.formInput}
          maxLength={30}
        />
      </View>

      {/* 모드 */}
      <View style={S.formGroup}>
        <Text style={S.formLabel}>{'모드'}</Text>
        <View style={S.formChipRow}>
          <FormChip label={'일반전'} active={mode === 'normal'} onPress={() => setMode('normal')} />
          <FormChip label={'랭크'} active={mode === 'ranked'} onPress={() => setMode('ranked')} />
        </View>
      </View>

      {/* 점수 한도 */}
      <View style={S.formGroup}>
        <Text style={S.formLabel}>{'점수 한도'}</Text>
        <View style={S.formChipRow}>
          <FormChip label={'500'} active={scoreLimit === 500} onPress={() => setScoreLimit(500)} />
          <FormChip label={'1000'} active={scoreLimit === 1000} onPress={() => setScoreLimit(1000)} />
          <FormChip label={'1500'} active={scoreLimit === 1500} onPress={() => setScoreLimit(1500)} />
        </View>
      </View>

      {/* 턴 타이머 */}
      <View style={S.formGroup}>
        <Text style={S.formLabel}>{'턴 타이머'}</Text>
        <View style={S.formChipRow}>
          <FormChip label={'15s'} active={turnTimer === 15} onPress={() => setTurnTimer(15)} />
          <FormChip label={'20s'} active={turnTimer === 20} onPress={() => setTurnTimer(20)} />
          <FormChip label={'30s'} active={turnTimer === 30} onPress={() => setTurnTimer(30)} />
          <FormChip label={'무제한'} active={turnTimer === null} onPress={() => setTurnTimer(null)} />
        </View>
      </View>

      {/* 토글들 */}
      <View style={S.formGroup}>
        <ToggleRow
          label={'관전 허용'}
          value={allowSpectators}
          onChange={setAllowSpectators}
        />
        <ToggleRow
          label={'AI로 빈자리 채움'}
          value={aiFill}
          onChange={setAiFill}
        />
      </View>

      {/* 비밀번호 */}
      <View style={S.formGroup}>
        <Text style={S.formLabel}>{'비밀번호 (선택)'}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={'비워두면 공개방'}
          placeholderTextColor={COLORS.cmInkMute}
          style={S.formInput}
          secureTextEntry
          maxLength={20}
        />
      </View>

      {/* 제출 버튼 */}
      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        style={({ pressed }) => [
          S.enterBtnWrap,
          pressed && canSubmit && S.enterBtnWrapPressed,
          !canSubmit && S.enterBtnWrapDisabled,
        ]}
      >
        <LinearGradient
          colors={canSubmit ? [COLORS.cmGold, COLORS.cmGoldSoft] : ['#555', '#333']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={S.enterBtn}
        >
          <Text style={[S.enterBtnText, !canSubmit && S.enterBtnTextDisabled]}>
            {'방  만  들  기'}
          </Text>
        </LinearGradient>
      </Pressable>
    </ScrollView>
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
      style={({ pressed }) => [
        S.toggleRow,
        pressed && S.chipPressed,
      ]}
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

function Badge({ mode }: { mode: FullRoomMode }) {
  if (mode === 'ranked') {
    return (
      <View style={[S.badge, S.badgeRank]}>
        <Text style={S.badgeRankText}>{'랭크'}</Text>
      </View>
    );
  }
  return (
    <View style={[S.badge, S.badgeNormal]}>
      <Text style={S.badgeNormalText}>{'일반'}</Text>
    </View>
  );
}

function BadgeLock() {
  return (
    <View style={[S.badge, S.badgeLock]}>
      <Text style={S.badgeLockText}>{'🔒'}</Text>
    </View>
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
    fontFamily: SERIF,
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
  topbarSolid: { backgroundColor: COLORS.cmTopbarSolid },
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
    fontFamily: SERIF,
    fontWeight: '600',
  },
  crumbSep: { color: COLORS.cmInkMute, opacity: 0.4 },
  crumbActive: { color: COLORS.cmGold },
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

  // ─── Main ─────
  main: { flex: 1, zIndex: 5 },
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

  // ─── Left ─────
  left: { flex: 1, minWidth: 0 },

  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  sectionHeadMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  titleAccent: {
    width: 6,
    height: 32,
    borderRadius: 2,
  },
  titleEn: {
    fontFamily: SERIF,
    fontSize: 34,
    fontWeight: '700',
    color: COLORS.cmInk,
    letterSpacing: 2,
  },
  titleEnMobile: { fontSize: 26 },
  titleKo: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.cmInkMute,
    marginLeft: 4,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countText: { fontSize: 13, color: COLORS.cmInkDim },
  countNum: { fontSize: 15, color: COLORS.cmGold, fontWeight: '700' },

  // ─── Filters ─────
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    borderRadius: 12,
    marginBottom: 16,
  },
  filterBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: 10,
    gap: 8,
  },
  search: {
    flex: 1,
    minWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    borderRadius: 8,
    minHeight: 44,
  },
  searchMobile: {
    minWidth: 0,
    width: '100%',
  },
  searchIcon: {
    color: COLORS.cmInkMute,
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    color: COLORS.cmInk,
    fontSize: 14,
    padding: 0,
  },
  chipsScroll: {
    flexShrink: 1,
  },
  chipsContent: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    backgroundColor: 'rgba(0,0,0,0.3)',
    minHeight: 36,
  },
  chipActive: {
    borderColor: COLORS.cmGold,
    backgroundColor: 'rgba(255,210,74,0.12)',
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipText: {
    color: COLORS.cmInkDim,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.cmGold,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.cmInkMute,
  },
  chipDotActive: {
    backgroundColor: COLORS.cmGold,
    shadowColor: COLORS.cmGold,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    color: COLORS.cmInkDim,
    fontSize: 18,
    fontWeight: '700',
  },

  // ─── Rooms list ─────
  rooms: {
    flex: 1,
  },
  roomsContent: {
    paddingBottom: 12,
    gap: 10,
  },

  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.cmInkDim,
    fontSize: 14,
    marginBottom: 6,
  },
  emptySub: {
    color: COLORS.cmInkMute,
    fontSize: 12,
  },

  // 가로 카드 (데스크톱/태블릿)
  room: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    padding: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(26,71,42,0.5)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  roomMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    padding: 14,
  },
  roomSelected: {
    borderColor: COLORS.cmGold,
    backgroundColor: 'rgba(34,89,58,0.7)',
    shadowColor: COLORS.cmGold,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  roomPressed: {
    backgroundColor: 'rgba(34,89,58,0.6)',
    borderColor: COLORS.cmLineStrong,
  },
  roomAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: COLORS.cmGold,
  },

  // 아바타
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'visible',
    borderWidth: 2,
    borderColor: COLORS.cmLineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarChar: {
    fontFamily: SERIF,
    fontWeight: '700',
    color: COLORS.cmBg0,
    fontSize: 18,
  },
  avatarLvl: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: COLORS.cmBg0,
    borderWidth: 1,
    borderColor: COLORS.cmGold,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  avatarLvlText: {
    color: COLORS.cmGold,
    fontSize: 9,
    fontWeight: '700',
  },

  roomInfo: {
    flex: 1,
    minWidth: 0,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  roomName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.cmInk,
    flexShrink: 1,
  },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'center',
  },
  metaRowMobile: {
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaIcon: {
    fontSize: 11,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.cmInkMute,
  },

  // Badges
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  badgeNormal: {
    backgroundColor: COLORS.cmNormalBg,
    borderColor: COLORS.cmNormalBorder,
  },
  badgeNormalText: {
    color: COLORS.cmNormalSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  badgeRank: {
    backgroundColor: COLORS.cmRankBg,
    borderColor: COLORS.cmRankBorder,
  },
  badgeRankText: {
    color: COLORS.cmRankSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  badgeLock: {
    backgroundColor: COLORS.cmDangerBg,
    borderColor: COLORS.cmDangerBorder,
  },
  badgeLockText: {
    color: COLORS.cmDangerSoft,
    fontSize: 10,
    fontWeight: '700',
  },

  // Slots
  slots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slot: {
    width: 14,
    height: 18,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    overflow: 'hidden',
  },
  slotFilled: {
    borderColor: COLORS.cmGold,
    shadowColor: COLORS.cmGold,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },

  // Ping
  ping: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  pingBar: {
    width: 3,
    borderRadius: 1,
    backgroundColor: COLORS.cmInkMute,
  },
  pingBarGood: {
    backgroundColor: COLORS.cmPingGood,
  },
  pingText: {
    fontSize: 11,
    color: COLORS.cmInkMute,
    marginLeft: 4,
  },
  pingTextGood: {
    color: COLORS.cmPingGood,
  },

  // Enter mini button
  enterMini: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cmLineStrong,
    backgroundColor: 'rgba(255,210,74,0.1)',
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterMiniPressed: {
    backgroundColor: COLORS.cmGold,
  },
  enterMiniSpectate: {
    opacity: 0.5,
  },
  enterMiniText: {
    color: COLORS.cmGold,
    fontSize: 12,
    fontWeight: '700',
  },
  enterMiniTextSpectate: {
    color: COLORS.cmGold,
  },

  // 모바일 카드 내부 분기
  roomMobileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roomMobileTopInfo: {
    flex: 1,
    minWidth: 0,
  },
  roomMobileBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  roomMobileBottomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // ─── Right ─────
  rightPanel: {
    backgroundColor: 'rgba(14,46,26,0.85)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    borderRadius: 14,
    overflow: 'hidden',
  },
  rightPanelDesktop: { width: 420 },
  rightPanelTablet: { width: 360 },

  rightTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cmLine,
  },
  rightTab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    minHeight: 44,
  },
  rightTabActive: {
    borderBottomColor: COLORS.cmGold,
    backgroundColor: 'rgba(255,210,74,0.05)',
  },
  rightTabPressed: {
    opacity: 0.7,
  },
  rightTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.cmInkMute,
    letterSpacing: 0.5,
  },
  rightTabTextActive: {
    color: COLORS.cmGold,
  },

  rightBody: {
    flex: 1,
  },
  rightBodyContent: {
    padding: 24,
    gap: 20,
  },

  // ─── RoomInfoTab ─────
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cmLine,
  },
  previewAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: COLORS.cmLineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  previewAvatarChar: {
    fontFamily: SERIF,
    fontWeight: '700',
    color: COLORS.cmBg0,
    fontSize: 22,
  },
  previewMeta: {
    flex: 1,
    minWidth: 0,
  },
  previewName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.cmInk,
  },
  previewHost: {
    fontSize: 12,
    color: COLORS.cmInkMute,
    marginTop: 3,
  },

  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoCell: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    borderRadius: 8,
  },
  infoCellLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: COLORS.cmInkMute,
    fontWeight: '700',
    fontFamily: SERIF,
    marginBottom: 6,
  },
  infoCellValue: {
    fontSize: 15,
    color: COLORS.cmInk,
    fontWeight: '600',
  },
  infoCellValueGold: {
    color: COLORS.cmGold,
  },

  playersTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  playersTitleText: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: COLORS.cmInkMute,
    fontWeight: '700',
    fontFamily: SERIF,
  },

  teams: {
    flexDirection: 'column',
    gap: 14,
  },
  team: {
    padding: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
  },
  teamLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  teamLabelT1: { color: COLORS.cmDangerSoft },
  teamLabelT2: { color: COLORS.cmNormalSoft },

  teamSlots: {
    flexDirection: 'row',
    gap: 10,
  },
  playerSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    minHeight: 40,
  },
  playerSlotFilled: {
    borderWidth: 1,
    borderColor: COLORS.cmLineStrong,
    backgroundColor: 'rgba(255,210,74,0.05)',
  },
  playerSlotEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.cmLine,
    justifyContent: 'center',
  },
  playerSlotName: {
    flex: 1,
    fontSize: 12,
    color: COLORS.cmInk,
  },
  playerSlotEmptyText: {
    fontSize: 12,
    color: COLORS.cmInkMute,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  miniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  miniAvatarChar: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.cmBg0,
    fontFamily: SERIF,
  },

  enterBtnWrap: {
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: COLORS.cmGold,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  enterBtnWrapPressed: {
    opacity: 0.9,
    transform: [{ translateY: -1 }],
  },
  enterBtnWrapDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  enterBtn: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  enterBtnText: {
    color: COLORS.cmBg0,
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  enterBtnTextDisabled: {
    color: '#999',
  },

  footnote: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.cmInkMute,
    paddingTop: 8,
  },

  // ─── RoomCreateTab ─────
  formGroup: {
    gap: 10,
  },
  formLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: COLORS.cmInkMute,
    fontWeight: '700',
    fontFamily: SERIF,
  },
  formInput: {
    color: COLORS.cmInk,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    borderRadius: 8,
    minHeight: 44,
  },
  formChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    backgroundColor: 'rgba(0,0,0,0.3)',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formChipActive: {
    borderColor: COLORS.cmGold,
    backgroundColor: 'rgba(255,210,74,0.12)',
  },
  formChipText: {
    color: COLORS.cmInkDim,
    fontSize: 13,
    fontWeight: '600',
  },
  formChipTextActive: {
    color: COLORS.cmGold,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    borderRadius: 8,
    minHeight: 44,
    marginBottom: 8,
  },
  toggleLabel: {
    color: COLORS.cmInk,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleBox: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cmLine,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  toggleBoxOn: {
    borderColor: COLORS.cmGold,
    backgroundColor: 'rgba(255,210,74,0.15)',
  },
  toggleBoxText: {
    color: COLORS.cmInkMute,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  toggleBoxTextOn: {
    color: COLORS.cmGold,
  },
});
