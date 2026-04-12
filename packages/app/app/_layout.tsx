// 🩺 DIAGNOSTIC BUILD — 모든 우리 코드 제거, 가장 단순한 expo-router root.
// 흰 화면 원인이 native 단계인지 JS 그래프인지 가르기 위함.
// 원본은 .diagnostic-backup/_layout.tsx.bak 에 보관됨.
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
