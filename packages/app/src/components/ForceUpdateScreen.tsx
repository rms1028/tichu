import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.tichu.app';
const PLAY_STORE_DEEPLINK = 'market://details?id=com.tichu.app';

interface Props {
  minVersion: string | null;
}

export function ForceUpdateScreen({ minVersion }: Props) {
  const currentVersion = Constants.expoConfig?.version ?? '?';

  const openStore = async () => {
    try {
      if (Platform.OS === 'android') {
        const supported = await Linking.canOpenURL(PLAY_STORE_DEEPLINK);
        if (supported) { await Linking.openURL(PLAY_STORE_DEEPLINK); return; }
      }
      await Linking.openURL(PLAY_STORE_URL);
    } catch {
      await Linking.openURL(PLAY_STORE_URL).catch(() => { /* noop */ });
    }
  };

  return (
    <View style={S.root}>
      <Text style={S.icon}>{'⬆️'}</Text>
      <Text style={S.title}>{'업데이트 필요'}</Text>
      <Text style={S.body}>
        {'새로운 버전이 출시되었습니다.\n게임을 계속하려면 앱을 업데이트해주세요.'}
      </Text>
      <View style={S.versionBox}>
        <View style={S.versionRow}>
          <Text style={S.versionLabel}>{'현재 버전'}</Text>
          <Text style={S.versionValue}>{currentVersion}</Text>
        </View>
        {minVersion ? (
          <View style={S.versionRow}>
            <Text style={S.versionLabel}>{'필요 버전'}</Text>
            <Text style={[S.versionValue, S.requiredVersion]}>{minVersion}</Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity style={S.btn} onPress={openStore}>
        <Text style={S.btnText}>{'스토어에서 업데이트'}</Text>
      </TouchableOpacity>
      <Text style={S.hint}>
        {'버튼을 누르면 Play 스토어가 열립니다.\n업데이트 후 앱을 다시 실행해주세요.'}
      </Text>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', padding: 40 },
  icon: { fontSize: 64, marginBottom: 12 },
  title: { color: '#FFD700', fontSize: 26, fontWeight: '900', marginBottom: 14 },
  body: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  versionBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 22,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minWidth: 240,
  },
  versionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  versionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  versionValue: { color: '#fff', fontSize: 14, fontWeight: '800' },
  requiredVersion: { color: '#F59E0B' },
  btn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 18,
  },
  btnText: { color: '#1a1a2e', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  hint: { color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center', lineHeight: 17 },
});
