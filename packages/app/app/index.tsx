// Phase 5 — 실제 AppRoot 마운트.
//
// sound.ts 의 window.addEventListener 가드 누락이 흰 화면의 root cause 였다.
// Phase 4 probe 에서 21개 모듈 전부 통과 확인. 이제 AppRoot 를 정상 렌더한다.

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
    try {
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
        </ScrollView>
      </View>
    );
  }

  if (Inner) {
    return <Inner />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1f12', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFD24A', fontSize: 18, fontWeight: '900', letterSpacing: 4 }}>
        {'TICHU'}
      </Text>
      <Text style={{ color: '#FFD700', fontSize: 11, fontWeight: '700', marginTop: 8 }}>
        {'LOADING APP...'}
      </Text>
    </View>
  );
}
