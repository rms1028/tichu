import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence,
  Easing, ZoomIn, FadeIn,
} from 'react-native-reanimated';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

interface Props {
  mode: 'quick' | 'custom';
  roomCode?: string;
  nickname: string;
  onCancel: () => void;
  onStart: () => void;
}

interface Slot { name: string | null; avatar: string; tier: string; ready: boolean; }

export function MatchmakingScreen({ mode, roomCode, nickname, onCancel, onStart }: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([
    { name: nickname || 'Guest', avatar: '\uD83D\uDC32', tier: '\uD83E\uDD48', ready: false },
    { name: null, avatar: '', tier: '', ready: false },
    { name: null, avatar: '', tier: '', ready: false },
    { name: null, avatar: '', tier: '', ready: false },
  ]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [myReady, setMyReady] = useState(false);
  const [copied, setCopied] = useState(false);

  // 경과 시간
  useEffect(() => {
    const iv = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // 빠른 매칭: 봇 순차 채워짐
  useEffect(() => {
    if (mode !== 'quick') return;
    const bots = [
      { name: 'Bot-A', avatar: '\uD83E\uDD81', tier: '\uD83E\uDD49' },
      { name: 'Bot-B', avatar: '\uD83D\uDC3B', tier: '\uD83E\uDD48' },
      { name: 'Bot-C', avatar: '\uD83E\uDD8A', tier: '\uD83E\uDD49' },
    ];
    const timers = bots.map((b, i) => setTimeout(() => {
      setSlots(prev => { const n = [...prev]; n[i + 1] = { ...b, ready: true }; return n; });
    }, 1200 + i * 900));
    return () => timers.forEach(clearTimeout);
  }, [mode]);

  // 전원 채워지면 카운트다운
  useEffect(() => {
    const allFilled = slots.every(s => s.name !== null);
    if (allFilled && countdown === null) setCountdown(3);
  }, [slots]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) { onStart(); return; }
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // 스피너
  const spin = useSharedValue(0);
  useEffect(() => { spin.value = withRepeat(withTiming(360, { duration: 2500, easing: Easing.linear }), -1, false); }, []);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));

  // 로딩 dots
  const dotOpacity = useSharedValue(0.3);
  useEffect(() => { dotOpacity.value = withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0.3, { duration: 600 })), -1, false); }, []);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const toggleReady = () => {
    setMyReady(!myReady);
    setSlots(prev => { const n = [...prev]; n[0] = { ...n[0]!, ready: !myReady }; return n; });
  };

  const handleCopy = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const renderSlot = (slot: Slot, idx: number) => {
    const isTeam1 = idx < 2;
    const teamColor = isTeam1 ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)';
    const borderColor = slot.name ? (isTeam1 ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)') : 'rgba(255,255,255,0.1)';

    return (
      <Animated.View key={idx} entering={slot.name ? ZoomIn.delay(idx * 200).duration(350).springify() : undefined} style={[S.slot, { backgroundColor: teamColor, borderColor }]}>
        {slot.name ? (
          <>
            <Text style={S.slotAvatar}>{slot.avatar}</Text>
            <Text style={S.slotName} numberOfLines={1}>{slot.name}</Text>
            <Text style={S.slotTier}>{slot.tier}</Text>
            {slot.ready && <View style={S.readyMark}><Text style={S.readyMarkText}>{'\u2713'}</Text></View>}
          </>
        ) : (
          <>
            <View style={S.emptyCircle}><Animated.Text style={[S.emptyDots, dotStyle]}>...</Animated.Text></View>
            <Text style={S.emptyText}>{'\uC0C1\uB300\uB97C \uCC3E\uB294 \uC911...'}</Text>
          </>
        )}
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />

      {/* 카운트다운 오버레이 */}
      {countdown !== null && countdown > 0 && (
        <Animated.View entering={ZoomIn.duration(300).springify()} style={S.cdOverlay}>
          <Text style={S.cdNum}>{countdown}</Text>
        </Animated.View>
      )}
      {countdown !== null && countdown <= 0 && (
        <Animated.View entering={ZoomIn.duration(300).springify()} style={S.cdOverlay}>
          <Text style={S.cdGo}>{'\uAC8C\uC784 \uC2DC\uC791!'}</Text>
        </Animated.View>
      )}

      <View style={S.content}>
        {/* 상단 */}
        <View style={S.header}>
          <Text style={S.headerTitle}>{mode === 'quick' ? '\uB9E4\uCE6D \uC911...' : '\uCEE4\uC2A4\uD140 \uB9E4\uCE58'}</Text>
          {mode === 'custom' && roomCode && (
            <TouchableOpacity style={S.codeBox} onPress={handleCopy} activeOpacity={0.7}>
              <Text style={S.codeText}>{roomCode}</Text>
              <Text style={S.codeCopy}>{copied ? '\u2713 \uBCF5\uC0AC\uB428' : '\uD83D\uDCCB'}</Text>
            </TouchableOpacity>
          )}
          <View style={S.timerRow}>
            <Animated.Text style={[S.spinSymbol, spinStyle]}>{'\u2660'}</Animated.Text>
            <Text style={S.elapsed}>{fmt(elapsed)}</Text>
            <Animated.Text style={[S.spinSymbol, spinStyle]}>{'\u2665'}</Animated.Text>
          </View>
        </View>

        {/* 슬롯 */}
        <View style={S.slotsArea}>
          <View style={S.teamHeader}>
            <View style={S.teamLabelRow}><View style={[S.teamDot, { backgroundColor: '#3B82F6' }]} /><Text style={S.teamLabel}>Team 1</Text></View>
            <View style={S.teamLabelRow}><Text style={S.teamLabel}>Team 2</Text><View style={[S.teamDot, { backgroundColor: '#EF4444' }]} /></View>
          </View>
          <View style={S.slotsGrid}>
            <View style={S.teamCol}>{[0, 1].map(i => renderSlot(slots[i]!, i))}</View>
            <View style={S.vsCol}><Text style={S.vsText}>VS</Text></View>
            <View style={S.teamCol}>{[2, 3].map(i => renderSlot(slots[i]!, i))}</View>
          </View>
        </View>

        {/* 하단 */}
        <View style={S.bottom}>
          {mode === 'custom' && (
            <View style={S.customBtns}>
              <TouchableOpacity style={[S.readyBtn, myReady && S.readyBtnOn]} onPress={toggleReady}>
                <Text style={S.readyBtnText}>{myReady ? '\u2713 \uC900\uBE44 \uC644\uB8CC' : '\uC900\uBE44'}</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity style={S.cancelBtn} onPress={onCancel}>
            <Text style={S.cancelText}>{mode === 'quick' ? '\uB9E4\uCE6D \uCDE8\uC18C' : '\uB098\uAC00\uAE30'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, zIndex: 5 },

  // 상단
  header: { alignItems: 'center', gap: 8 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  spinSymbol: { color: 'rgba(255,255,255,0.2)', fontSize: 18 },
  elapsed: { color: 'rgba(255,255,255,0.5)', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  codeText: { color: '#F59E0B', fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  codeCopy: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },

  // 슬롯
  slotsArea: { flex: 1, justifyContent: 'center' },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
  teamLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  teamLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700' },
  slotsGrid: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamCol: { flex: 1, gap: 8 },
  vsCol: { width: 40, alignItems: 'center' },
  vsText: { color: 'rgba(255,255,255,0.15)', fontSize: 18, fontWeight: '900' },

  slot: {
    borderRadius: 16, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 8,
    minHeight: 120, position: 'relative',
  },
  slotAvatar: { fontSize: 34 },
  slotName: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 4, maxWidth: 100, textAlign: 'center' },
  slotTier: { fontSize: 14, marginTop: 2 },
  readyMark: { position: 'absolute', top: 6, right: 6, backgroundColor: '#10b981', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  readyMarkText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  emptyCircle: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  emptyDots: { color: 'rgba(255,255,255,0.3)', fontSize: 20, fontWeight: '900' },
  emptyText: { color: 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 6, textAlign: 'center' },

  // 카운트다운
  cdOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 },
  cdNum: { color: '#FFD700', fontSize: 80, fontWeight: '900', textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 20 },
  cdGo: { color: '#FFD700', fontSize: 36, fontWeight: '900', textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 16 },

  // 하단
  bottom: { alignItems: 'center', gap: 10 },
  customBtns: { flexDirection: 'row', gap: 10 },
  readyBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 },
  readyBtnOn: { backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 1, borderColor: '#10b981' },
  readyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: { borderRadius: 12, paddingHorizontal: 28, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  cancelText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '600' },
});
