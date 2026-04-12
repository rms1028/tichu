// 🩺 DIAGNOSTIC BUILD — 모든 import 제거. 단순 텍스트만 표시.
// 원본은 .diagnostic-backup/index.tsx.bak 에 보관됨.
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

export default function App() {
  return (
    <View style={S.root}>
      <Text style={S.bigTitle}>{'TICHU'}</Text>
      <Text style={S.subtitle}>{'DIAGNOSTIC BUILD'}</Text>
      <Text style={S.body}>{'JS bundle loaded successfully'}</Text>
      <Text style={S.body}>{`Platform: ${Platform.OS}`}</Text>
      <Text style={S.body}>{`Version: ${Platform.Version}`}</Text>
      <Text style={S.note}>
        {'이 화면이 보이면 native + JS entry 는 정상.\n원인은 우리 코드의 import 그래프 안에 있음.'}
      </Text>
    </View>
  );
}

const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a472a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  bigTitle: {
    color: '#FFD24A',
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: 8,
    marginBottom: 4,
  },
  subtitle: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 32,
  },
  body: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 6,
  },
  note: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 24,
    textAlign: 'center',
    lineHeight: 18,
  },
});
