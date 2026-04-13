// 🩺 DIAGNOSTIC MODE — Phase 1
//
// AppRoot 로드 완전 차단. 순수 RN 컴포넌트만 렌더.
//
// 목적: 렌더 파이프라인 자체가 정상인지 검증.
//   - 이 화면이 뜨면: _layout + route 마운트 OK. 문제는 AppRoot 의 import 체인.
//   - 이 화면도 흰색이면: expo-router / RN 초기화 레벨 문제.
//
// 추가 진단: 각 단계를 console.error 로 찍어 logcat 에서 확인 가능하게 함.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';

console.error('[DIAG-P1] index.tsx module evaluating');

interface Step {
  label: string;
  status: 'pending' | 'ok' | 'fail';
  error?: string;
}

function tryRequire(label: string, fn: () => any): { ok: boolean; error?: string } {
  try {
    console.error('[DIAG-P1] trying:', label);
    fn();
    console.error('[DIAG-P1] OK:', label);
    return { ok: true };
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    const stack = e?.stack ? String(e.stack) : '(no stack)';
    console.error('[DIAG-P1] FAIL:', label, '::', msg);
    console.error('[DIAG-P1] STACK:', stack);
    return { ok: false, error: msg + '\n' + stack };
  }
}

export default function App() {
  console.error('[DIAG-P1] App component rendering');

  const [mounted, setMounted] = useState(false);
  const [results, setResults] = useState<Step[]>([]);

  useEffect(() => {
    console.error('[DIAG-P1] useEffect firing — this proves passive effects work');
    setMounted(true);

    const probes: { label: string; fn: () => any }[] = [
      { label: 'react-native', fn: () => require('react-native') },
      { label: 'react-native-reanimated', fn: () => require('react-native-reanimated') },
      { label: 'react-native-gesture-handler', fn: () => require('react-native-gesture-handler') },
      { label: 'react-native-mmkv', fn: () => require('react-native-mmkv') },
      { label: 'react-native-screens', fn: () => require('react-native-screens') },
      { label: 'react-native-safe-area-context', fn: () => require('react-native-safe-area-context') },
      { label: 'expo-notifications', fn: () => require('expo-notifications') },
      { label: 'expo-constants', fn: () => require('expo-constants') },
      { label: 'expo-haptics', fn: () => require('expo-haptics') },
      { label: 'expo-blur', fn: () => require('expo-blur') },
      { label: 'expo-linear-gradient', fn: () => require('expo-linear-gradient') },
      { label: 'firebase/app', fn: () => require('firebase/app') },
      { label: 'firebase/auth', fn: () => require('firebase/auth') },
      { label: 'zustand', fn: () => require('zustand') },
      { label: 'socket.io-client', fn: () => require('socket.io-client') },
    ];

    const collected: Step[] = [];
    let stopAt = -1;
    for (let i = 0; i < probes.length; i++) {
      const p = probes[i]!;
      const r = tryRequire(p.label, p.fn);
      collected.push({ label: p.label, status: r.ok ? 'ok' : 'fail', error: r.error });
      if (!r.ok) { stopAt = i; break; }
    }
    // 나머지는 pending 으로
    for (let i = stopAt + 1; i < probes.length; i++) {
      if (stopAt === -1) break;
      collected.push({ label: probes[i]!.label, status: 'pending' });
    }
    console.error('[DIAG-P1] probes done. failed index:', stopAt);
    setResults(collected);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1f12' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 60 }}>
        <Text style={{ color: '#5dff9d', fontSize: 28, fontWeight: '900', marginBottom: 6 }}>
          {'✓ RENDER OK'}
        </Text>
        <Text style={{ color: '#FFD24A', fontSize: 14, marginBottom: 4 }}>
          {`Platform: ${Platform.OS} ${Platform.Version}`}
        </Text>
        <Text style={{ color: mounted ? '#5dff9d' : '#FFD24A', fontSize: 14, marginBottom: 20 }}>
          {mounted ? '✓ useEffect fired' : '· waiting for useEffect...'}
        </Text>

        <Text style={{ color: '#FFD24A', fontSize: 16, fontWeight: '800', marginBottom: 10 }}>
          {'모듈 로드 진단'}
        </Text>

        {results.length === 0 ? (
          <Text style={{ color: '#888', fontSize: 12 }}>
            {mounted ? '진단 실행 중...' : '-'}
          </Text>
        ) : null}

        {results.map((s, i) => (
          <View
            key={i}
            style={{
              marginBottom: 6,
              padding: 8,
              backgroundColor:
                s.status === 'fail'
                  ? 'rgba(255,85,85,0.15)'
                  : s.status === 'ok'
                  ? 'rgba(93,255,157,0.08)'
                  : 'rgba(255,255,255,0.04)',
              borderLeftWidth: 2,
              borderLeftColor:
                s.status === 'fail'
                  ? '#ff5555'
                  : s.status === 'ok'
                  ? '#5dff9d'
                  : '#555',
            }}
          >
            <Text
              style={{
                color:
                  s.status === 'fail'
                    ? '#ffaaaa'
                    : s.status === 'ok'
                    ? '#5dff9d'
                    : '#888',
                fontSize: 13,
                fontWeight: '700',
              }}
            >
              {s.status === 'ok' ? '✓' : s.status === 'fail' ? '✗' : '·'}
              {' '}
              {s.label}
            </Text>
            {s.error ? (
              <Text style={{ color: '#ffaaaa', fontSize: 10, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                {s.error.slice(0, 600)}
              </Text>
            ) : null}
          </View>
        ))}

        <Text style={{ color: '#666', fontSize: 11, marginTop: 30, textAlign: 'center' }}>
          {'이 화면이 뜨면 렌더 파이프라인 정상. 실패한 모듈 라벨 + 에러 메시지를 개발자에게 보내주세요.'}
        </Text>
      </ScrollView>
    </View>
  );
}
