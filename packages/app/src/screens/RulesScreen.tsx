import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

interface Props { onBack: () => void; }

const SECTIONS = [
  { id: 'overview', title: '\uD83C\uDCCF \uAC8C\uC784 \uAC1C\uC694' },
  { id: 'flow', title: '\uD83D\uDD04 \uC9C4\uD589 \uC21C\uC11C' },
  { id: 'combos', title: '\♠ \uCE74\uB4DC \uC870\uD569' },
  { id: 'bomb', title: '\uD83D\uDCA3 \uD3ED\uD0C4' },
  { id: 'special', title: '\u2728 \uD2B9\uC218 \uCE74\uB4DC' },
  { id: 'tichu', title: '\uD83D\uDD25 \uD2F0\uCE04 \uC120\uC5B8' },
  { id: 'scoring', title: '\uD83D\uDCB0 \uC810\uC218 \uACC4\uC0B0' },
  { id: 'win', title: '\uD83C\uDFC6 \uC2B9\uB9AC \uC870\uAC74' },
];

// 카드 미니 표시
function MiniCard({ text, suit, color }: { text: string; suit?: string; color?: string }) {
  const isRed = color === 'red';
  return (
    <View style={[R.mini, isRed && R.miniRed]}>
      <Text style={[R.miniRank, isRed && R.miniRankRed]}>{text}</Text>
      {suit && <Text style={[R.miniSuit, isRed && R.miniSuitRed]}>{suit}</Text>}
    </View>
  );
}
function SpecialMini({ emoji, label }: { emoji: string; label: string }) {
  return (
    <View style={R.specialMini}>
      <Text style={R.specialMiniEmoji}>{emoji}</Text>
      <Text style={R.specialMiniLabel}>{label}</Text>
    </View>
  );
}
function CardRow({ children }: { children: React.ReactNode }) {
  return <View style={R.cardRow}>{children}</View>;
}

export function RulesScreen({ onBack }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeSection, setActiveSection] = useState(0);
  const sectionPositions = useRef<number[]>([]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y + 60;
    let idx = 0;
    for (let i = sectionPositions.current.length - 1; i >= 0; i--) {
      if (y >= (sectionPositions.current[i] ?? 0)) { idx = i; break; }
    }
    setActiveSection(idx);
  };

  return (
    <SafeAreaView style={R.root}>
      <BackgroundWatermark />
      <View style={R.header}>
        <TouchableOpacity onPress={onBack}><Text style={R.back}>{'\u2190 \uB4A4\uB85C'}</Text></TouchableOpacity>
        <Text style={R.headerTitle}>{'\uD83D\uDCD6 \uAC8C\uC784 \uADDC\uCE59'}</Text>
        <View style={{ width: 50 }} />
      </View>
      <View style={R.body}>
        {/* 좌측 목차 */}
        <View style={R.toc}>
          {SECTIONS.map((s, i) => (
            <TouchableOpacity key={s.id} style={[R.tocItem, activeSection === i && R.tocActive]} onPress={() => {
              const pos = sectionPositions.current[i];
              if (pos !== undefined) scrollRef.current?.scrollTo({ y: pos - 40, animated: true });
            }}>
              <Text style={[R.tocText, activeSection === i && R.tocTextActive]}>{s.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* 우측 본문 */}
        <ScrollView ref={scrollRef} style={R.content} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={50}>
          {/* 섹션 1: 게임 개요 */}
          <View onLayout={e => { sectionPositions.current[0] = e.nativeEvent.layout.y; }} style={R.section}>
            <Text style={R.secTitle}>{'\uD83C\uDCCF \uAC8C\uC784 \uAC1C\uC694'}</Text>
            <View style={R.card}>
              <Text style={R.p}>{'\u2022 4\uBA85\uC774 2\uD300(2:2)\uC73C\uB85C \uB098\uB220 \uD50C\uB808\uC774\uD558\uB294 \uD074\uB77C\uC774\uBC0D \uCE74\uB4DC \uAC8C\uC784'}</Text>
              <Text style={R.p}>{'\u2022 \uB9C8\uC8FC \uBCF4\uACE0 \uC549\uC740 \uB450 \uBA85\uC774 \uD55C \uD300'}</Text>
              <Text style={R.p}>{'\u2022 \uBAA9\uD45C: \uC190\uC5D0 \uB4E0 \uCE74\uB4DC\uB97C \uAC00\uC7A5 \uBA3C\uC800 \uBAA8\uB450 \uB0B4\uB824\uB193\uB294 \uAC83'}</Text>
              <Text style={R.p}>{'\u2022 1000\uC810\uC744 \uBA3C\uC800 \uB2EC\uC131\uD55C \uD300\uC774 \uC2B9\uB9AC'}</Text>
              <Text style={R.highlight}>{'\uCE74\uB4DC \uAD6C\uC131: \uC77C\uBC18 52\uC7A5 (4\uC0C9 \xD7 2~A) + \uD2B9\uC218 4\uC7A5 = \uCD1D 56\uC7A5'}</Text>
              <Text style={R.p}>{'\uCE74\uB4DC \uC138\uAE30: 2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A'}</Text>
            </View>
          </View>
          {/* 섹션 2: 진행 순서 */}
          <View onLayout={e => { sectionPositions.current[1] = e.nativeEvent.layout.y; }} style={R.section}>
            <Text style={R.secTitle}>{'\uD83D\uDD04 \uAC8C\uC784 \uC9C4\uD589 \uC21C\uC11C'}</Text>
            <View style={R.card}>
              <Text style={R.step}>{'\u2460 \uAC01 \uD50C\uB808\uC774\uC5B4\uC5D0\uAC8C 8\uC7A5 \uBC30\uBD84 \u2192 \uB77C\uC9C0 \uD2F0\uCE04 \uC120\uC5B8 \uC5EC\uBD80 \uACB0\uC815'}</Text>
              <Text style={R.step}>{'\u2461 \uB098\uBA38\uC9C0 6\uC7A5 \uCD94\uAC00 \uBC30\uBD84 (\uCD1D 14\uC7A5)'}</Text>
              <Text style={R.step}>{'\u2462 \uCE74\uB4DC \uAD50\uD658: \uB2E4\uB978 3\uBA85\uC5D0\uAC8C \uAC01\uAC01 1\uC7A5\uC529 \uCD1D 3\uC7A5 \uB3D9\uC2DC \uAD50\uD658'}</Text>
              <Text style={R.hint}>{'\uD83D\uDCA1 \uBCF4\uD1B5 \uD300\uC6D0\uC5D0\uAC8C \uC88B\uC740 \uCE74\uB4DC, \uC0C1\uB300\uC5D0\uAC8C \uC57D\uD55C \uCE74\uB4DC\uB97C \uC90C'}</Text>
              <Text style={R.step}>{'\u2463 \uCC38\uC0C8(1) \uCE74\uB4DC\uB97C \uAC00\uC9C4 \uD50C\uB808\uC774\uC5B4\uAC00 \uCCAB \uBC88\uC9F8 \uD2B8\uB9AD \uC2DC\uC791'}</Text>
              <Text style={R.step}>{'\u2464 \uC2DC\uACC4 \uBC29\uD5A5\uC73C\uB85C \uC9C4\uD589, \uCE74\uB4DC\uB97C \uB0B4\uAC70\uB098 \uD328\uC2A4'}</Text>
              <Text style={R.step}>{'\u2465 \uB098\uBA38\uC9C0 3\uBA85\uC774 \uBAA8\uB450 \uD328\uC2A4\uD558\uBA74 \uB9C8\uC9C0\uB9C9 \uCE74\uB4DC \uB0B8 \uC0AC\uB78C\uC774 \uD2B8\uB9AD \uD68D\uB4DD'}</Text>
              <Text style={R.important}>{'\u2757 \uD328\uC2A4\uD588\uB354\uB77C\uB3C4 \uB2E4\uC2DC \uC790\uAE30 \uD134\uC774 \uC624\uBA74 \uCE74\uB4DC\uB97C \uB0BC \uC218 \uC788\uC74C'}</Text>
              <Text style={R.step}>{'\u2466 \uCE74\uB4DC\uB97C \uBAA8\uB450 \uC18C\uC9C4\uD55C \uD50C\uB808\uC774\uC5B4\uB294 \uB77C\uC6B4\uB4DC\uC5D0\uC11C \uBE60\uC9D0'}</Text>
              <Text style={R.step}>{'\u2467 3\uBA85\uC774 \uBE60\uC9C0\uBA74 \uB77C\uC6B4\uB4DC \uC885\uB8CC \u2192 \uC810\uC218 \uACC4\uC0B0'}</Text>
            </View>
          </View>
          {/* 섹션 3: 카드 조합 */}
          <View onLayout={e => { sectionPositions.current[2] = e.nativeEvent.layout.y; }} style={R.section}>
            <Text style={R.secTitle}>{'\♠ \uCE74\uB4DC \uC870\uD569 (\uC871\uBCF4)'}</Text>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uC2F1\uAE00 — \uCE74\uB4DC 1\uC7A5'}</Text>
              <CardRow><MiniCard text="7" suit="♠" /><Text style={R.comboDesc}>{' \uB354 \uB192\uC740 \uC2F1\uAE00\uB85C \uC774\uAE40'}</Text></CardRow>
            </View>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uD398\uC5B4 — \uAC19\uC740 \uC22B\uC790 2\uC7A5'}</Text>
              <CardRow><MiniCard text="8" suit="♠" /><MiniCard text="8" suit="♥" color="red" /></CardRow>
            </View>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uD2B8\uB9AC\uD50C — \uAC19\uC740 \uC22B\uC790 3\uC7A5'}</Text>
              <CardRow><MiniCard text="J" suit="♠" /><MiniCard text="J" suit="♥" color="red" /><MiniCard text="J" suit="♦" color="red" /></CardRow>
            </View>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uC5F0\uC18D \uD398\uC5B4 — \uC5F0\uC18D\uB418\uB294 \uC22B\uC790\uC758 \uD398\uC5B4 2\uC30D+'}</Text>
              <CardRow><MiniCard text="Q" suit="♠" /><MiniCard text="Q" suit="♥" color="red" /><MiniCard text="K" suit="♣" /><MiniCard text="K" suit="♦" color="red" /></CardRow>
              <Text style={R.comboNote}>{'\uAC19\uC740 \uC30D\uC218\uC758 \uC5F0\uC18D \uD398\uC5B4\uB85C\uB9CC \uC774\uAE38 \uC218 \uC788\uC74C'}</Text>
            </View>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uD480\uD558\uC6B0\uC2A4 — \uD2B8\uB9AC\uD50C + \uD398\uC5B4'}</Text>
              <CardRow><MiniCard text="5" suit="♠" /><MiniCard text="5" suit="♥" color="red" /><MiniCard text="5" suit="♣" /><MiniCard text="Q" suit="♠" /><MiniCard text="Q" suit="♦" color="red" /></CardRow>
            </View>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uC2A4\uD2B8\uB808\uC774\uD2B8 — 5\uC7A5 \uC774\uC0C1\uC758 \uC5F0\uC18D \uC22B\uC790'}</Text>
              <CardRow><MiniCard text="3" suit="♣" /><MiniCard text="4" suit="♥" color="red" /><MiniCard text="5" suit="♠" /><MiniCard text="6" suit="♦" color="red" /><MiniCard text="7" suit="♣" /></CardRow>
              <Text style={R.comboNote}>{'\uAC19\uC740 \uC7A5\uC218\uC758 \uB354 \uB192\uC740 \uC2A4\uD2B8\uB808\uC774\uD2B8\uB85C\uB9CC \uC774\uAE40'}</Text>
            </View>
            <Text style={R.ruleBox}>{'\uD575\uC2EC: \uC120 \uD50C\uB808\uC774\uC5B4\uAC00 \uB0B8 \uC870\uD569\uACFC \uAC19\uC740 \uC885\uB958 + \uAC19\uC740 \uC7A5\uC218\uC758 \uB354 \uB192\uC740 \uCE74\uB4DC\uB9CC \uB0BC \uC218 \uC788\uC74C'}</Text>
          </View>
          {/* 섹션 4: 폭탄 */}
          <View onLayout={e => { sectionPositions.current[3] = e.nativeEvent.layout.y; }} style={R.section}>
            <Text style={R.secTitle}>{'\uD83D\uDCA3 \uD3ED\uD0C4 (Bomb)'}</Text>
            <View style={[R.card, R.bombCard]}>
              <Text style={R.comboTitle}>{'\uD3EC\uCE74\uB4DC — \uAC19\uC740 \uC22B\uC790 4\uC7A5'}</Text>
              <CardRow><MiniCard text="9" suit="♠" /><MiniCard text="9" suit="♥" color="red" /><MiniCard text="9" suit="♦" color="red" /><MiniCard text="9" suit="♣" /></CardRow>
            </View>
            <View style={[R.card, R.bombCard]}>
              <Text style={R.comboTitle}>{'\uC2A4\uD2B8\uB808\uC774\uD2B8 \uD50C\uB7EC\uC2DC — \uAC19\uC740 \uBB34\uB2AC 5\uC7A5+ \uC5F0\uC18D'}</Text>
              <CardRow><MiniCard text="3" suit="♠" /><MiniCard text="4" suit="♠" /><MiniCard text="5" suit="♠" /><MiniCard text="6" suit="♠" /><MiniCard text="7" suit="♠" /></CardRow>
            </View>
            <View style={R.card}>
              <Text style={R.important}>{'\u2B50 \uD3ED\uD0C4\uC740 \uBAA8\uB4E0 \uC870\uD569\uBCF4\uB2E4 \uAC15\uD568 (\uC6A9 \uD3EC\uD568)'}</Text>
              <Text style={R.important}>{'\u2B50 \uC790\uAE30 \uD134\uC774 \uC544\uB2C8\uC5B4\uB3C4 \uC5B8\uC81C\uB4E0 \uB0BC \uC218 \uC788\uC74C!'}</Text>
              <Text style={R.p}>{'\u2022 \uD3EC\uCE74\uB4DC\uB07C\uB9AC: \uC22B\uC790\uAC00 \uB192\uC740 \uCABD\uC774 \uAC15\uD568'}</Text>
              <Text style={R.p}>{'\u2022 \uC2A4\uD2B8\uB808\uC774\uD2B8 \uD50C\uB7EC\uC2DC > \uD3EC\uCE74\uB4DC'}</Text>
              <Text style={R.p}>{'\u2022 SF\uB07C\uB9AC: \uC7A5\uC218 \uB9CE\uC744\uC218\uB85D, \uAC19\uC73C\uBA74 \uC22B\uC790 \uB192\uC744\uC218\uB85D'}</Text>
              <Text style={R.p}>{'\u2022 \uBD09\uD669\uC740 \uD3ED\uD0C4\uC5D0 \uD3EC\uD568 \uBD88\uAC00'}</Text>
            </View>
          </View>
          {/* 섹션 5: 특수 카드 */}
          <View onLayout={e => { sectionPositions.current[4] = e.nativeEvent.layout.y; }} style={R.section}>
            <Text style={R.secTitle}>{'\u2728 \uD2B9\uC218 \uCE74\uB4DC 4\uC7A5'}</Text>
            <View style={[R.card, R.specialMahjong]}>
              <Text style={R.specialIcon}>{'\uD83D\uDC26'}</Text>
              <Text style={R.specialName}>{'\uCC38\uC0C8 (1)'}</Text>
              <Text style={R.p}>{'\u2022 \uC22B\uC790 \uCE74\uB4DC \uC911 \uAC00\uC7A5 \uB0AE\uC740 \uC2F1\uAE00 (1\uC73C\uB85C \uCDE8\uAE09)'}</Text>
              <Text style={R.p}>{'\u2022 \uC774 \uCE74\uB4DC\uB97C \uAC00\uC9C4 \uC0AC\uB78C\uC774 \uB77C\uC6B4\uB4DC \uCCAB \uD2B8\uB9AD \uC2DC\uC791'}</Text>
              <Text style={R.p}>{'\u2022 \uC18C\uC6D0: \uCC38\uC0C8\uB97C \uB0BC \uB54C \uD2B9\uC815 \uC22B\uC790\uB97C \uC9C0\uBAA9 \uAC00\uB2A5'}</Text>
              <Text style={R.hint}>{'\uC9C0\uBAA9\uB2F9\uD55C \uC22B\uC790\uB97C \uAC00\uC9C4 \uD50C\uB808\uC774\uC5B4\uB294 \uB0BC \uC218 \uC788\uB294 \uC0C1\uD669\uC774\uBA74 \uBC18\uB4DC\uC2DC \uB0B4\uC57C \uD568'}</Text>
              <Text style={R.points}>{'\uC810\uC218: 0\uC810'}</Text>
            </View>
            <View style={[R.card, R.specialDog]}>
              <Text style={R.specialIcon}>{'\uD83D\uDC15'}</Text>
              <Text style={R.specialName}>{'\uAC1C (Dog)'}</Text>
              <Text style={R.p}>{'\u2022 \uC120\uC744 \uC7A1\uC558\uC744 \uB54C\uB9CC \uB0BC \uC218 \uC788\uC74C'}</Text>
              <Text style={R.p}>{'\u2022 \uB9DE\uC740\uD3B8 \uD300\uC6D0\uC5D0\uAC8C \uC120 \uAD8C\uD55C\uC744 \uB118\uAE30\uACE0 \uD2B8\uB9AD \uC989\uC2DC \uC885\uB8CC'}</Text>
              <Text style={R.p}>{'\u2022 \uC5B4\uB5A4 \uCE74\uB4DC\uB85C\uB3C4 \uB9C9\uC744 \uC218 \uC5C6\uC74C (\uC6A9, \uD3ED\uD0C4 \uD3EC\uD568)'}</Text>
              <Text style={R.p}>{'\u2022 \uB2E8\uB3C5\uC73C\uB85C\uB9CC \uC0AC\uC6A9, \uB2E4\uB978 \uC870\uD569\uC5D0 \uD3EC\uD568 \uBD88\uAC00'}</Text>
              <Text style={R.points}>{'\uC810\uC218: 0\uC810'}</Text>
            </View>
            <View style={[R.card, R.specialDragon]}>
              <Text style={R.specialIcon}>{'\uD83D\uDC09'}</Text>
              <Text style={R.specialName}>{'\uC6A9 (Dragon)'}</Text>
              <Text style={R.p}>{'\u2022 \uC2F1\uAE00 \uCE74\uB4DC \uC911 \uAC00\uC7A5 \uAC15\uD568 (A\uBCF4\uB2E4 \uB192\uC74C)'}</Text>
              <Text style={R.p}>{'\u2022 \uC2F1\uAE00\uB85C\uB9CC \uB0BC \uC218 \uC788\uC74C (\uB2E4\uB978 \uC870\uD569\uC5D0 \uD3EC\uD568 \uBD88\uAC00)'}</Text>
              <Text style={R.important}>{'\u2022 \uC6A9\uC73C\uB85C \uD2B8\uB9AD\uC744 \uC774\uAE30\uBA74 \uADF8 \uD2B8\uB9AD\uC744 \uC0C1\uB300 \uD300 1\uBA85\uC5D0\uAC8C \uC918\uC57C \uD568!'}</Text>
              <Text style={R.p}>{'\u2022 \uD3ED\uD0C4\uC73C\uB85C\uB9CC \uC774\uAE38 \uC218 \uC788\uC74C'}</Text>
              <Text style={R.points}>{'\uC810\uC218: +25\uC810'}</Text>
            </View>
            <View style={[R.card, R.specialPhoenix]}>
              <Text style={R.specialIcon}>{'\uD83E\uDD85'}</Text>
              <Text style={R.specialName}>{'\uBD09\uD669 (Phoenix)'}</Text>
              <Text style={R.p}>{'\u2022 \uC2F1\uAE00: \uC9C1\uC804 \uCE74\uB4DC\uBCF4\uB2E4 0.5 \uB192\uC740 \uAC12 (\uC120\uC5D0\uC11C\uB294 1.5)'}</Text>
              <Text style={R.p}>{'\u2022 \uC6A9\uC740 \uC774\uAE38 \uC218 \uC5C6\uC74C'}</Text>
              <Text style={R.p}>{'\u2022 \uC870\uD569\uC5D0 \uD3EC\uD568 \uAC00\uB2A5: \uC544\uBB34 \uC22B\uC790 \uB300\uC2E0 \uC0AC\uC6A9'}</Text>
              <Text style={R.p}>{'\u2022 \uD3ED\uD0C4\uC5D0\uB294 \uD3EC\uD568 \uBD88\uAC00'}</Text>
              <Text style={[R.points, { color: '#ef4444' }]}>{'\uC810\uC218: -25\uC810 (\uB9C8\uC774\uB108\uC2A4!)'}</Text>
            </View>
          </View>
          {/* 섹션 6: 티츄 선언 */}
          <View onLayout={e => { sectionPositions.current[5] = e.nativeEvent.layout.y; }} style={R.section}>
            <Text style={R.secTitle}>{'\uD83D\uDD25 \uD2F0\uCE04 \uC120\uC5B8'}</Text>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uD83D\uDCE2 \uC2A4\uBAB0 \uD2F0\uCE04'}</Text>
              <Text style={R.p}>{'\u2022 14\uC7A5\uC744 \uBAA8\uB450 \uBC1B\uC740 \uD6C4, \uCCAB \uCE74\uB4DC\uB97C \uB0B4\uAE30 \uC804\uAE4C\uC9C0 \uC120\uC5B8 \uAC00\uB2A5'}</Text>
              <Text style={R.p}>{'\u2022 \uC120\uC5B8\uD55C \uD50C\uB808\uC774\uC5B4\uAC00 1\uB4F1\uC73C\uB85C \uCE74\uB4DC\uB97C \uBAA8\uB450 \uB0B4\uBA74 +100\uC810'}</Text>
              <Text style={R.p}>{'\u2022 \uC2E4\uD328\uD558\uBA74 -100\uC810'}</Text>
            </View>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uD83D\uDCE2 \uB77C\uC9C0(\uADF8\uB79C\uB4DC) \uD2F0\uCE04'}</Text>
              <Text style={R.p}>{'\u2022 \uCC98\uC74C 8\uC7A5\uB9CC \uBC1B\uC740 \uC0C1\uD0DC\uC5D0\uC11C \uC120\uC5B8 (\uB098\uBA38\uC9C0 6\uC7A5 \uBC1B\uAE30 \uC804)'}</Text>
              <Text style={R.p}>{'\u2022 \uC131\uACF5 \uC2DC +200\uC810, \uC2E4\uD328 \uC2DC -200\uC810'}</Text>
            </View>
          </View>
          {/* 섹션 7: 점수 계산 */}
          <View onLayout={e => { sectionPositions.current[6] = e.nativeEvent.layout.y; }} style={R.section}>
            <Text style={R.secTitle}>{'\uD83D\uDCB0 \uC810\uC218 \uACC4\uC0B0'}</Text>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uCE74\uB4DC\uBCC4 \uC810\uC218'}</Text>
              <View style={R.scoreTable}>
                {[['5', '+5\uC810'], ['10', '+10\uC810'], ['K', '+10\uC810'], ['\uC6A9\uD83D\uDC09', '+25\uC810'], ['\uBD09\uD669\uD83E\uDD85', '-25\uC810'], ['\uB098\uBA38\uC9C0', '0\uC810']].map(([k, v], i) => (
                  <View key={i} style={R.scoreRow}><Text style={R.scoreKey}>{k}</Text><Text style={R.scoreVal}>{v}</Text></View>
                ))}
              </View>
              <Text style={R.highlight}>{'\uD55C \uB77C\uC6B4\uB4DC \uCD1D \uC810\uC218\uB294 \uD56D\uC0C1 100\uC810'}</Text>
            </View>
            <View style={R.card}>
              <Text style={R.comboTitle}>{'\uB77C\uC6B4\uB4DC \uC885\uB8CC \uD6C4'}</Text>
              <Text style={R.p}>{'\u2022 \uB9C8\uC9C0\uB9C9 \uD50C\uB808\uC774\uC5B4\uC758 \uC190\uD328 \u2192 \uC0C1\uB300 \uD300\uC5D0\uAC8C'}</Text>
              <Text style={R.p}>{'\u2022 \uB9C8\uC9C0\uB9C9 \uD50C\uB808\uC774\uC5B4\uAC00 \uBA39\uC740 \uD2B8\uB9AD \u2192 1\uB4F1\uC5D0\uAC8C'}</Text>
              <Text style={R.p}>{'\u2022 \uD2F0\uCE04 \uBCF4\uB108\uC2A4/\uAC10\uC810 \uBCC4\uB3C4 \uC801\uC6A9'}</Text>
            </View>
            <View style={[R.card, R.bombCard]}>
              <Text style={R.comboTitle}>{'\u2B50 \uC6D0\uD22C (1-2 \uD53C\uB2C8\uC2DC)'}</Text>
              <Text style={R.important}>{'\uD55C \uD300\uC758 \uB450 \uD50C\uB808\uC774\uC5B4\uAC00 1\uB4F1, 2\uB4F1\uC73C\uB85C \uB098\uAC00\uBA74'}</Text>
              <Text style={R.important}>{'\uD574\uB2F9 \uD300 200\uC810, \uC0C1\uB300 \uD300 0\uC810 (\uCE74\uB4DC \uC810\uC218 \uACC4\uC0B0 \uC5C6\uC74C)'}</Text>
            </View>
          </View>
          {/* 섹션 8: 승리 조건 */}
          <View onLayout={e => { sectionPositions.current[7] = e.nativeEvent.layout.y; }} style={R.section}>
            <Text style={R.secTitle}>{'\uD83C\uDFC6 \uC2B9\uB9AC \uC870\uAC74'}</Text>
            <View style={R.card}>
              <Text style={R.p}>{'\u2022 \uB77C\uC6B4\uB4DC\uB97C \uBC18\uBCF5\uD558\uBA70 \uC810\uC218 \uB204\uC801'}</Text>
              <Text style={R.p}>{'\u2022 \uD55C \uD300\uC774 1000\uC810 \uC774\uC0C1 \uB2EC\uC131\uD558\uBA74 \uAC8C\uC784 \uC885\uB8CC'}</Text>
              <Text style={R.p}>{'\u2022 \uC591 \uD300 \uBAA8\uB450 1000\uC810 \uC774\uC0C1\uC774\uBA74 \uC810\uC218\uAC00 \uB354 \uB192\uC740 \uD300 \uC2B9\uB9AC'}</Text>
              <Text style={R.p}>{'\u2022 \uB3D9\uC810\uC774\uBA74 \uCD94\uAC00 \uB77C\uC6B4\uB4DC \uC9C4\uD589'}</Text>
            </View>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const R = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 10 },
  back: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
  headerTitle: { color: '#FFD700', fontSize: 18, fontWeight: '900' },
  body: { flex: 1, flexDirection: 'row', zIndex: 5 },

  // 목차
  toc: { width: 140, paddingVertical: 8, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.06)' },
  tocItem: { paddingVertical: 7, paddingHorizontal: 8, borderRadius: 6, marginBottom: 2 },
  tocActive: { backgroundColor: 'rgba(245,158,11,0.1)' },
  tocText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' },
  tocTextActive: { color: '#F59E0B' },

  // 본문
  content: { flex: 1, paddingHorizontal: 16 },
  section: { marginBottom: 16 },
  secTitle: { color: '#FFD700', fontSize: 18, fontWeight: '900', marginBottom: 8, marginTop: 8 },
  card: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 12, marginBottom: 8 },
  bombCard: { borderWidth: 1.5, borderColor: 'rgba(245,158,11,0.3)' },

  p: { color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 20, marginBottom: 3 },
  step: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 22, marginBottom: 2 },
  hint: { color: '#F59E0B', fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 4, fontStyle: 'italic' },
  important: { color: '#ef4444', fontSize: 13, fontWeight: '700', lineHeight: 20, marginBottom: 3 },
  highlight: { color: '#22d3ee', fontSize: 13, fontWeight: '700', lineHeight: 20, marginTop: 6, marginBottom: 3 },
  ruleBox: { color: '#F59E0B', fontSize: 13, fontWeight: '800', backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 8, padding: 10, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  points: { color: '#10b981', fontSize: 12, fontWeight: '800', marginTop: 6 },

  // 카드 조합
  comboTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 6 },
  comboDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginLeft: 6, alignSelf: 'center' },
  comboNote: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4, fontStyle: 'italic' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },

  // 미니 카드
  mini: { backgroundColor: '#f5f0e8', borderRadius: 5, width: 36, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#555', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 3 },
  miniRed: { borderColor: '#c0392b' },
  miniRank: { color: '#2c3e50', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  miniRankRed: { color: '#c0392b' },
  miniSuit: { color: '#2c3e50', fontSize: 12, lineHeight: 14, marginTop: -1 },
  miniSuitRed: { color: '#c0392b' },
  specialMini: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 5, width: 36, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  specialMiniEmoji: { fontSize: 18 },
  specialMiniLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 8, fontWeight: '700' },

  // 특수 카드
  specialMahjong: { borderLeftWidth: 3, borderLeftColor: '#4caf50' },
  specialDog: { borderLeftWidth: 3, borderLeftColor: '#78909c' },
  specialDragon: { borderLeftWidth: 3, borderLeftColor: '#f44336' },
  specialPhoenix: { borderLeftWidth: 3, borderLeftColor: '#ff9800' },
  specialIcon: { fontSize: 32, marginBottom: 4 },
  specialName: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 6 },

  // 점수 테이블
  scoreTable: { marginVertical: 6 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  scoreKey: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  scoreVal: { color: '#F59E0B', fontSize: 13, fontWeight: '800' },
});
