// ⚠️ 글로벌 에러 핸들러를 가장 먼저 설치 — 다른 import 보다 먼저.
// 모듈 load 단계에서 throw 되는 에러도 캡처하기 위해.
import { installGlobalErrorHandler } from '../src/utils/globalErrorCapture';
installGlobalErrorHandler();

import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#1a472a', overflow: 'hidden' },
        }}
      />
    </ErrorBoundary>
  );
}
