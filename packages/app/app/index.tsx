// 🩺 Lazy loader entry point.
//
// 이 파일은 의도적으로 minimal 합니다. src/* 어떤 파일도 직접 import 하지 않습니다.
// 실제 앱은 useEffect 안에서 require() 로 로드됩니다.
//
// 이렇게 하면:
// - expo-router 가 이 route 를 import 할 때 throw 되지 않음
//   (이 파일의 import graph 는 React + react-native 만 있음)
// - _layout.tsx 의 LAYOUT OK 띠가 정상 표시됨 (route 로드 성공)
// - 첫 렌더 시 "LOADING..." 표시
// - useEffect 안에서 require('../src/AppRoot') 시도
//   - 성공: 실제 앱 마운트
//   - throw: 에러 메시지를 화면에 표시 (try/catch 가 잡음)
//
// 이 패턴이 module-load 단계 throw 를 잡을 수 있는 유일한 방법입니다.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';

interface LoadError {
  message: string;
  stack: string;
}

export default function App() {
  const [Inner, setInner] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<LoadError | null>(null);

  useEffect(() => {
    // require() 는 동기적이고 throw 를 던지므로 try/catch 로 잡힘.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../src/AppRoot');
      const Component: React.ComponentType = mod && (mod.default || mod);
      if (typeof Component !== 'function') {
        setError({
          message: 'AppRoot module loaded but default export is not a component',
          stack: `typeof default = ${typeof Component}\nkeys = ${Object.keys(mod || {}).join(',')}`,
        });
        return;
      }
      setInner(() => Component);
    } catch (e: any) {
      setError({
        message: (e && e.message) ? String(e.message) : String(e),
        stack: (e && e.stack) ? String(e.stack) : '(no stack)',
      });
    }
  }, []);

  // 에러 화면
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1a1a2e', paddingTop: 60 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <Text style={{ color: '#ff5555', fontSize: 22, fontWeight: '900', marginBottom: 8 }}>
            {'⚠️ AppRoot 로드 실패'}
          </Text>
          <Text style={{ color: '#888', fontSize: 12, marginBottom: 20 }}>
            {`Platform: ${Platform.OS} ${Platform.Version}`}
          </Text>

          <Text style={{ color: '#FFD700', fontSize: 14, fontWeight: '800', marginTop: 8, marginBottom: 6 }}>
            {'Error Message'}
          </Text>
          <Text style={{ color: '#ffaaaa', fontSize: 14, fontWeight: '700', marginBottom: 12 }}>
            {error.message}
          </Text>

          <Text style={{ color: '#FFD700', fontSize: 14, fontWeight: '800', marginTop: 8, marginBottom: 6 }}>
            {'Stack'}
          </Text>
          <Text style={{ color: '#ccc', fontSize: 11, lineHeight: 16 }}>
            {error.stack}
          </Text>

          <Text style={{ color: '#666', fontSize: 12, marginTop: 24, textAlign: 'center' }}>
            {'이 화면 전체를 스크린샷으로 개발자에게 보내주세요.'}
          </Text>
        </ScrollView>
      </View>
    );
  }

  // 실제 앱 마운트
  if (Inner) {
    return <Inner />;
  }

  // 로딩 화면
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0a1f12',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#FFD24A', fontSize: 18, fontWeight: '900', letterSpacing: 4 }}>
        {'TICHU'}
      </Text>
      <Text style={{ color: '#FFD700', fontSize: 11, fontWeight: '700', marginTop: 8 }}>
        {'LOADING APP...'}
      </Text>
    </View>
  );
}
