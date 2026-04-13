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
  const { isLandscape, isShort } = useResponsive();
  // 가로 + 세로 공간 부족할 때 로고를 축소하고 카드 옆에 배치
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
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 로고 — compact 에서는 공간 절약을 위해 작게만 표시 */}
          <Animated.View
            entering={ZoomIn.duration(500).springify()}
            style={[S.logoArea, compact && S.logoAreaCompact]}
          >
            <Text style={[S.title, compact && S.titleCompact]}>{'TICHU'}</Text>
            {!compact && <Text style={S.subtitle}>{'멀티플레이어 보드게임'}</Text>}
          </Animated.View>
          {/* 로그인 카드 */}
          <Animated.View entering={FadeIn.delay(300).duration(400)} style={S.card}>
            <Text style={S.cardTitle}>{'게임 시작'}</Text>
            <TextInput
              style={S.input}
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
                  style={[S.btn, S.guestBtn, !nickname.trim() && S.btnDisabled]}
                  onPress={() => nickname.trim().length >= 2 && onGuestLogin(nickname.trim())}
                  disabled={nickname.trim().length < 2}
                  activeOpacity={0.7}
                >
                  <Text style={S.guestIcon}>{'🎮'}</Text>
                  <Text style={S.btnText}>{'게스트로 시작'}</Text>
                </TouchableOpacity>
                <View style={S.divider}>
                  <View style={S.dividerLine} />
                  <Text style={S.dividerText}>{'또는'}</Text>
                  <View style={S.dividerLine} />
                </View>
                <TouchableOpacity style={[S.btn, S.googleBtn]} onPress={onGoogleLogin} activeOpacity={0.7}>
                  <Text style={S.googleIcon}>{'G'}</Text>
                  <Text style={S.googleText}>{'Google로 로그인'}</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
          {!compact && (
            <Text style={S.footer}>
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
  logoArea: { alignItems: 'center', marginBottom: 32 },
  logoAreaCompact: { marginBottom: 12 },
  title: { color: '#FFD700', fontSize: 52, fontWeight: '900', letterSpacing: 12, textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  titleCompact: { fontSize: 32, letterSpacing: 8 },
  subtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '600', letterSpacing: 4, marginTop: 4 },
  card: { width: '100%', maxWidth: 420, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
  error: { color: '#ef4444', fontSize: 12, textAlign: 'center', marginBottom: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14, gap: 10 },
  btnDisabled: { opacity: 0.4 },
  guestBtn: { backgroundColor: '#D97706' },
  guestIcon: { fontSize: 20 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  googleBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  googleIcon: { fontSize: 20, fontWeight: '900', color: '#4285F4' },
  googleText: { color: '#333', fontSize: 16, fontWeight: '700' },
  footer: { color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 17 },
  footerCompact: { marginTop: 12, fontSize: 10 },
});
