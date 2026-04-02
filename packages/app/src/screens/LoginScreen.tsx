import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

interface LoginScreenProps {
  onGuestLogin: (nickname: string) => void;
  onGoogleLogin: () => void;
  loading: boolean;
  error: string | null;
}

export function LoginScreen({ onGuestLogin, onGoogleLogin, loading, error }: LoginScreenProps) {
  const [nickname, setNickname] = useState('');

  return (
    <View style={S.root}>
      <BackgroundWatermark />
      <View style={S.content}>
        {/* 로고 */}
        <Animated.View entering={ZoomIn.duration(500).springify()} style={S.logoArea}>
          <Text style={S.title}>{'TICHU'}</Text>
          <Text style={S.subtitle}>{'멀티플레이어 보드게임'}</Text>
        </Animated.View>

        {/* 로그인 카드 */}
        <Animated.View entering={FadeIn.delay(300).duration(400)} style={S.card}>
          <Text style={S.cardTitle}>{'게임 시작'}</Text>

          {/* 닉네임 입력 */}
          <TextInput
            style={S.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder={'닉네임 입력 (2~12자)'}
            placeholderTextColor="rgba(255,255,255,0.3)"
            maxLength={12}
          />

          {error && <Text style={S.error}>{error}</Text>}

          {loading ? (
            <ActivityIndicator color="#F59E0B" size="large" style={{ marginVertical: 20 }} />
          ) : (
            <>
              {/* 게스트 로그인 */}
              <TouchableOpacity
                style={[S.btn, S.guestBtn, !nickname.trim() && S.btnDisabled]}
                onPress={() => nickname.trim().length >= 2 && onGuestLogin(nickname.trim())}
                disabled={nickname.trim().length < 2}
                activeOpacity={0.7}
              >
                <Text style={S.guestIcon}>{'🎮'}</Text>
                <Text style={S.btnText}>{'게스트로 시작'}</Text>
              </TouchableOpacity>

              {/* 구분선 */}
              <View style={S.divider}>
                <View style={S.dividerLine} />
                <Text style={S.dividerText}>{'또는'}</Text>
                <View style={S.dividerLine} />
              </View>

              {/* Google 로그인 */}
              <TouchableOpacity style={[S.btn, S.googleBtn]} onPress={onGoogleLogin} activeOpacity={0.7}>
                <Text style={S.googleIcon}>{'G'}</Text>
                <Text style={S.googleText}>{'Google로 로그인'}</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        <Text style={S.footer}>{'게스트 데이터는 기기에만 저장됩니다.\nGoogle 로그인 시 다른 기기에서도 이어 플레이할 수 있습니다.'}</Text>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, zIndex: 5 },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  title: { color: '#FFD700', fontSize: 52, fontWeight: '900', letterSpacing: 12, textShadowColor: 'rgba(255,215,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },
  subtitle: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '600', letterSpacing: 4, marginTop: 4 },
  card: { width: '100%', maxWidth: 380, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 16 },
  error: { color: '#ef4444', fontSize: 12, textAlign: 'center', marginBottom: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14, gap: 10 },
  btnDisabled: { opacity: 0.4 },
  guestBtn: { backgroundColor: '#D97706' },
  guestIcon: { fontSize: 20 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  googleBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  googleIcon: { fontSize: 20, fontWeight: '900', color: '#4285F4' },
  googleText: { color: '#333', fontSize: 16, fontWeight: '700' },
  footer: { color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 17 },
});
