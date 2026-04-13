// 🩺 Minimal diagnostic root layout.
//
// Zero src/ imports — only React, react-native, expo-router, expo-status-bar.
// This is intentionally identical in import surface to the working
// diagnostic build, so it must render. If even this doesn't render,
// the failure is outside the JS layer (native, OS, package manager cache).
//
// Reads `global.__earlyErrors__` (populated by index.js) and renders a
// red error screen if anything was caught during module load. Otherwise
// renders a green 'LAYOUT OK' banner plus the normal Stack.

import React from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

interface EarlyError {
  message: string;
  stack: string;
  fatal: boolean;
  at: number;
}

function getEarlyErrors(): EarlyError[] {
  try {
    const buf = (global as any).__earlyErrors__;
    if (Array.isArray(buf)) return buf as EarlyError[];
  } catch { /* noop */ }
  return [];
}

export default function RootLayout() {
  const errors = getEarlyErrors();

  if (errors.length > 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1a1a2e', paddingTop: 60 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <Text style={{ color: '#ff5555', fontSize: 22, fontWeight: '900', marginBottom: 8 }}>
            {'⚠️ 앱 초기화 실패'}
          </Text>
          <Text style={{ color: '#888', fontSize: 12, marginBottom: 20 }}>
            {`Platform: ${Platform.OS} ${Platform.Version} · errors: ${errors.length}`}
          </Text>
          {errors.map((e, i) => (
            <View
              key={i}
              style={{
                marginBottom: 14,
                padding: 12,
                backgroundColor: 'rgba(255,85,85,0.1)',
                borderLeftWidth: 3,
                borderLeftColor: '#ff5555',
              }}
            >
              <Text style={{ color: '#ffaaaa', fontSize: 14, fontWeight: '700', marginBottom: 4 }}>
                {e.message}
              </Text>
              <Text
                style={{
                  color: '#ccc',
                  fontSize: 11,
                  lineHeight: 16,
                }}
              >
                {e.stack}
              </Text>
            </View>
          ))}
          <Text style={{ color: '#666', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
            {'이 화면 전체를 스크린샷으로 개발자에게 보내주세요.'}
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1f12' }}>
      <StatusBar style="light" />
      {/* Dev-only LAYOUT OK banner. The early-error diagnostic infra
       * (this file, app/index.tsx, src/utils/globalErrorCapture.ts) stays
       * in place as a safety net for future white-screen incidents — only
       * the visible banner is hidden in production. */}
      {__DEV__ && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,100,0,0.95)',
            paddingTop: 38,
            paddingBottom: 6,
            alignItems: 'center',
          }}
          pointerEvents="none"
        >
          <Text style={{ color: '#5dff9d', fontSize: 11, fontWeight: '700' }}>
            {`LAYOUT OK · ${Platform.OS} ${Platform.Version}`}
          </Text>
        </View>
      )}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#1a472a', overflow: 'hidden' },
        }}
      />
    </View>
  );
}
