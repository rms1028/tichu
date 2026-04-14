import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';
import { useResponsive } from '../utils/responsive';

interface LoginScreenProps {
  onGuestLogin: (nickname: string) => void;
  onGoogleLogin: () => void;
  loading: boolean;
  error: string | null;
}

export function LoginScreen({ onGuestLogin, onGoogleLogin, loading, error }: LoginScreenProps) {
  const [nickname, setNickname] = useState('');
  const { isLandscape, isShort, isDesktop } = useResponsive();
  // 가로 + 세로 공간 부족할 때 로고를 축소하고 카드 옆에 배치 (모바일 레거시)
  const compact = isLandscape || isShort;

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            S.scroll,
            compact && S.scrollCompact,
            isDesktop && S.scrollDesktop,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 로고 — compact 에서는 공간 절약을 위해 작게만 표시 */}
          <Animated.View
            entering={ZoomIn.duration(500).springify()}
            style={[S.logoArea, compact && S.logoAreaCompact, isDesktop && S.logoAreaDesktop]}
          >
            <Text style={[S.title, compact && S.titleCompact, isDesktop && S.titleDesktop]}>{'TICHU'}</Text>
            {!compact && <Text style={[S.subtitle, isDesktop && S.subtitleDesktop]}>{'멀티플레이어 보드게임'}</Text>}
          </Animated.View>
          {/* 로그인 카드 */}
          <Animated.View entering={FadeIn.delay(300).duration(400)} style={[S.card, isDesktop && S.cardDesktop]}>
            <Text style={[S.cardTitle, isDesktop && S.cardTitleDesktop]}>{'게임 시작'}</Text>
            <TextInput
              style={[S.input, isDesktop && S.inputDesktop]}
              value={nickname}
              onChangeText={setNickname}
              placeholder={'닉네임 입력 (2~12자)'}
              placeholderTextColor="rgba(255,255,255,0.3)"
              maxLength={12}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={() => {
                if (nickname.trim().length >= 2) onGuestLogin(nickname.trim());
              }}
              // Android landscape: disable OS extract-view fullscreen keyboard
              // so the input stays in place and only the on-screen keyboard
              // slides up from the bottom.
              disableFullscreenUI
            />
            {error && <Text style={S.error}>{error}</Text>}
            {loading ? (
              <ActivityIndicator color="#F59E0B" size="large" style={{ marginVertical: 20 }} />
            ) : (
              <>
                <TouchableOpacity
                  style={[S.btn, S.guestBtn, isDesktop && S.guestBtnDesktop, !nickname.trim() && S.btnDisabled]}
                  onPress={() => nickname.trim().length >= 2 && onGuestLogin(nickname.trim())}
                  disabled={nickname.trim().length < 2}
                  activeOpacity={0.7}
                >
                  <Text style={[S.guestIcon, isDesktop && S.iconDesktop]}>{'🎮'}</Text>
                  <Text style={[S.btnText, isDesktop && S.btnTextDesktop]}>{'게스트로 시작'}</Text>
                </TouchableOpacity>
                <View style={[S.divider, isDesktop && S.dividerDesktop]}>
                  <View style={S.dividerLine} />
                  <Text style={[S.dividerText, isDesktop && S.dividerTextDesktop]}>{'또는'}</Text>
                  <View style={S.dividerLine} />
                </View>
                <TouchableOpacity style={[S.btn, S.googleBtn, isDesktop && S.googleBtnDesktop]} onPress={onGoogleLogin} activeOpacity={0.7}>
                  <Text style={[S.googleIcon, isDesktop && S.iconDesktop]}>{'G'}</Text>
                  <Text style={[S.googleText, isDesktop && S.googleTextDesktop]}>{'Google로 로그인'}</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
          {!compact && (
            <Text style={[S.footer, isDesktop && S.footerDesktop]}>
              {'게스트 데이터는 기기에만 저장됩니다.\nGoogle 로그인 시 다른 기기에서도 이어 플레이할 수 있습니다.'}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  // ScrollView contentContainerStyle — min-height: 100% so background fills
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    zIndex: 5,
  },
  // 가로 / 세로 공간 부족: 위쪽 정렬 + 여백 축소
  scrollCompact: {
    justifyContent: 'flex-start',
    paddingVertical: 12,
    paddingTop: 16,
  },
  // desktop: 3차 — flex-start 기준 + 명시적 paddingTop + logoArea marginBottom
  // 으로 로고↔카드 갭 제어. 2차의 space-around 는 갭이 너무 커서 폐기.
  // 로고 위치: paddingTop 100 → 약 9% 지점. 로고↔카드 갭: marginBottom 48.
  scrollDesktop: {
    justifyContent: 'flex-start',
    paddingTop: 100,
    paddingBottom: 60,
  },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logoAreaCompact: { marginBottom: 12 },
  // 3차: 갭을 절반으로 (기존 space-around ~100 → 48).
  logoAreaDesktop: { marginBottom: 48 },
  title: { color: '#FFD700', fontSize: 52, fontWeight: '900', letterSpacing: 12, textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  titleCompact: { fontSize: 32, letterSpacing: 8 },
  // desktop: 52 → 76 (~1.46x). 사용자 스펙 1.3~1.5배 범위 상단. 3차에서 건드리지 마라.
  titleDesktop: { fontSize: 76, letterSpacing: 16, textShadowRadius: 18 },
  subtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '600', letterSpacing: 4, marginTop: 4 },
  subtitleDesktop: { fontSize: 19, letterSpacing: 7, marginTop: 8 },
  card: { width: '100%', maxWidth: 420, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  // desktop 3차: 내부 요소 가독성을 위해 폰트/높이/간격 모두 키움.
  //   좌우 padding 56 / 상하 padding 48 / maxWidth 600 유지.
  cardDesktop: { maxWidth: 600, paddingVertical: 48, paddingHorizontal: 56, borderRadius: 24 },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  // 3차: 제목 크기 32 + fontWeight 600 (사용자 스펙). marginBottom 32 로 input 과 갭.
  cardTitleDesktop: { fontSize: 32, fontWeight: '600', marginBottom: 32 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
  // 3차: height 64 고정 + fontSize 22. paddingVertical 제거 (height 가 처리).
  //   marginBottom 20 → guest 버튼과 갭.
  inputDesktop: { paddingHorizontal: 22, paddingVertical: 0, height: 64, fontSize: 22, borderRadius: 14, marginBottom: 20 },
  error: { color: '#ef4444', fontSize: 12, textAlign: 'center', marginBottom: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14, gap: 10 },
  // 3차: btn 공통 desktop 제거. 대신 guest/google 각각 높이 다르게 지정.
  guestBtnDesktop: { paddingVertical: 0, height: 68, borderRadius: 14, gap: 14 },
  googleBtnDesktop: { paddingVertical: 0, height: 64, borderRadius: 14, gap: 14 },
  btnDisabled: { opacity: 0.4 },
  guestBtn: { backgroundColor: '#D97706' },
  guestIcon: { fontSize: 20 },
  iconDesktop: { fontSize: 28 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  // 3차: guest 버튼 텍스트 22 + fontWeight 600.
  btnTextDesktop: { fontSize: 22, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  // 3차: divider 상하 24 씩 → guest↔divider 24, divider↔google 24.
  dividerDesktop: { marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  dividerTextDesktop: { fontSize: 16 },
  googleBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  googleIcon: { fontSize: 20, fontWeight: '900', color: '#4285F4' },
  googleText: { color: '#333', fontSize: 16, fontWeight: '700' },
  // 3차: google 버튼 텍스트 20 + fontWeight 600.
  googleTextDesktop: { fontSize: 20, fontWeight: '600', color: '#333' },
  footer: { color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 17 },
  footerCompact: { marginTop: 12, fontSize: 10 },
  footerDesktop: { fontSize: 14, lineHeight: 22, marginTop: 36 },
});
