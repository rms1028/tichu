import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

/**
 * RootLayout — expo-router 의 진짜 root.
 *
 * 글로벌 에러 핸들러는 `index.js` 에서 module load 의 가장 첫 줄에 설치.
 * ES 모듈 hoisting 때문에 여기서 설치하면 이미 늦음.
 *
 * ErrorBoundary 는 `index.js` 의 `global.__earlyErrors__` 를 읽어 화면에 출력.
 *
 * 진단용 "LAYOUT MOUNTED" 텍스트는 layout 자체가 실행되는지 즉시 확인 가능하게 함.
 * 만약 이 텍스트 자체도 안 뜨면 = React Native core 초기화 단계가 죽은 것.
 */
export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0a1f12' }}>
      <StatusBar style="light" />
      {/* 진단용 상단 띠 — 임시. 나중에 제거. */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,100,0,0.95)', paddingTop: 36, paddingBottom: 4,
        alignItems: 'center',
      }} pointerEvents="none">
        <Text style={{ color: '#5dff9d', fontSize: 10, fontWeight: '700' }}>
          {`LAYOUT OK · ${Platform.OS} ${Platform.Version}`}
        </Text>
      </View>
      <ErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#1a472a', overflow: 'hidden' },
          }}
        />
      </ErrorBoundary>
    </View>
  );
}
