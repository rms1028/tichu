// 🩺 PHASE 0 — 절대 최소 Hello World.
//
// 이 파일은 React + react-native 의 가장 기본 컴포넌트만 import 한다.
// useEffect 없음. require 없음. AppRoot 참조 없음. 외부 라이브러리 0개.
//
// 목적: 우리 JS 코드가 단 한 줄이라도 실행되는지 확인.
//   - 'PHASE 0 OK' 가 화면에 보이면 → 렌더 파이프라인 정상.
//     문제는 우리가 추가한 그 어떤 것 (useEffect, require, AppRoot import 등).
//   - 여전히 흰 화면 → 우리 JS 가 한 줄도 실행 안 됨.
//     문제는 expo-router / 네이티브 모듈 등록 / Bridgeless 초기화 단계.

import React from 'react';
import { View, Text } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0a1f12', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#5dff9d', fontSize: 36, fontWeight: '900', letterSpacing: 4 }}>
        {'PHASE 0 OK'}
      </Text>
      <Text style={{ color: '#FFD24A', fontSize: 14, marginTop: 12 }}>
        {'우리 JS 코드가 실행되고 있다.'}
      </Text>
    </View>
  );
}
