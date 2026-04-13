// 🩺 PHASE 1 — firebase 단독 참조 검증.
//
// PHASE 0 (Hello World) 가 정상 렌더되었다. JS/RN/expo-router 파이프라인 OK.
// 이제 firebase 를 lazy require 형태로만 추가해서 — 호출은 안 함 — 단순히
// dep 그래프에 있는 것만으로 깨지는지 확인.

import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

console.error('[DIAG-P1] index.tsx module evaluating');

export default function App() {
  console.error('[DIAG-P1] App rendering');
  const [step, setStep] = useState('start');

  useEffect(() => {
    console.error('[DIAG-P1] useEffect fired');
    setStep('useEffect ok');

    // dep 그래프에는 추가되지만 실제 호출은 안 함.
    const refs: { name: string; load: () => any }[] = [
      { name: 'firebase/app', load: () => require('firebase/app') },
      { name: 'firebase/auth', load: () => require('firebase/auth') },
    ];
    console.error('[DIAG-P1] refs count =', refs.length, '(NOT calling them)');
    setStep('refs declared, not called');
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1f12', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ color: '#5dff9d', fontSize: 32, fontWeight: '900', letterSpacing: 4, textAlign: 'center' }}>
        {'PHASE 1'}
      </Text>
      <Text style={{ color: '#FFD24A', fontSize: 14, marginTop: 12, textAlign: 'center' }}>
        {'firebase 참조만 (호출 X)'}
      </Text>
      <Text style={{ color: '#5dff9d', fontSize: 16, marginTop: 24, textAlign: 'center' }}>
        {step}
      </Text>
    </View>
  );
}
