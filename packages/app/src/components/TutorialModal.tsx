import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import Animated, { FadeIn, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { COLORS } from '../utils/theme';

const STEPS = [
  { title: '\uD83C\uDCCF \uD2F0\uCE04\uB780?', body: '\uD2F0\uCE04\uB294 4\uBA85\uC774 2\uD300\uC73C\uB85C \uB098\uB220 \uD50C\uB808\uC774\uD558\uB294 \uCE74\uB4DC \uAC8C\uC784\uC785\uB2C8\uB2E4.\n\uB9C8\uC8FC\uBCF4\uB294 \uC0AC\uB78C\uC774 \uD30C\uD2B8\uB108\uC774\uBA70,\n\uC190\uD328\uB97C \uBA3C\uC800 \uBE44\uC6B0\uB294 \uAC83\uC774 \uBAA9\uD45C\uC785\uB2C8\uB2E4.', icon: '\uD83D\uDC65' },
  { title: '\uD83C\uDCCF \uCE74\uB4DC \uC870\uD569', body: '\u2022 \uC2F1\uAE00: 1\uC7A5\n\u2022 \uD398\uC5B4: \uAC19\uC740 \uC22B\uC790 2\uC7A5\n\u2022 \uD2B8\uB9AC\uD50C: \uAC19\uC740 \uC22B\uC790 3\uC7A5\n\u2022 \uC2A4\uD2B8\uB808\uC774\uD2B8: \uC5F0\uC18D 5\uC7A5+\n\u2022 \uD480\uD558\uC6B0\uC2A4: 3+2\uC7A5\n\u2022 \uD3ED\uD0C4: \uAC19\uC740 \uC22B\uC790 4\uC7A5 \uB610\uB294 \uAC19\uC740 \uBB38\uC591 \uC5F0\uC18D 5\uC7A5+', icon: '\u2660' },
  { title: '\u2728 \uD2B9\uC218 \uCE74\uB4DC', body: '\uD83D\uDC09 \uC6A9: \uC2F1\uAE00 \uCD5C\uAC15, +25\uC810\n\uD83E\uDD85 \uBD09\uD669: \uC640\uC77C\uB4DC\uCE74\uB4DC, -25\uC810\n\uD83D\uDC15 \uAC1C: \uD30C\uD2B8\uB108\uC5D0\uAC8C \uB9AC\uB4DC\uAD8C \uC774\uC804\n\uD83D\uDC26 \uCC38\uC0C8: \uAC12 1, \uC18C\uC6D0 \uC120\uC5B8 \uAC00\uB2A5', icon: '\uD83D\uDC09' },
  { title: '\uD83D\uDD25 \uD2F0\uCE04 \uC120\uC5B8', body: '\u2022 \uC2A4\uBAB0 \uD2F0\uCE04: \uCCAB \uCE74\uB4DC \uB0B4\uAE30 \uC804 \uC120\uC5B8\n  \uC131\uACF5 +100\uC810, \uC2E4\uD328 -100\uC810\n\n\u2022 \uB77C\uC9C0 \uD2F0\uCE04: 8\uC7A5\uB9CC \uBCF4\uACE0 \uC120\uC5B8\n  \uC131\uACF5 +200\uC810, \uC2E4\uD328 -200\uC810', icon: '\uD83D\uDD25' },
  { title: '\uD83D\uDCB0 \uC810\uC218 \uACC4\uC0B0', body: '\u2022 5: +5\uC810\n\u2022 10, K: +10\uC810\n\u2022 \uC6A9: +25\uC810\n\u2022 \uBD09\uD669: -25\uC810\n\u2022 \uB098\uBA38\uC9C0: 0\uC810\n\n\uB77C\uC6B4\uB4DC \uCD1D\uD569\uC740 \uD56D\uC0C1 100\uC810!', icon: '\uD83E\uDE99' },
  { title: '\uD83C\uDFC6 \uC2B9\uB9AC \uC870\uAC74', body: '\uB204\uC801 1,000\uC810\uC744 \uBA3C\uC800 \uB2EC\uC131\uD55C \uD300\uC774 \uC2B9\uB9AC!\n\n\uAC19\uC740 \uD300 1\uB4F1+2\uB4F1 = \uC6D0\uD22C \uD53C\uB2C8\uC2DC\n\u2192 200\uC810 \uD68D\uB4DD!\n\n\uC774\uC81C \uD2F0\uCE04\uB97C \uC990\uACA8\uBCF4\uC138\uC694!', icon: '\uD83C\uDFC6' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function TutorialModal({ visible, onClose }: Props) {
  const [step, setStep] = useState(0);
  const cur = STEPS[step]!;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={S.overlay}>
        <View style={S.box}>
          <Animated.View key={step} entering={FadeIn.duration(300)} style={S.content}>
            <Text style={S.icon}>{cur.icon}</Text>
            <Text style={S.title}>{cur.title}</Text>
            <Text style={S.body}>{cur.body}</Text>
          </Animated.View>

          {/* dots */}
          <View style={S.dots}>
            {STEPS.map((_, i) => <View key={i} style={[S.dot, i === step && S.dotActive]} />)}
          </View>

          {/* 버튼 */}
          <View style={S.btns}>
            {step > 0 && (
              <TouchableOpacity style={S.prevBtn} onPress={() => setStep(step - 1)}>
                <Text style={S.prevText}>{'\uC774\uC804'}</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {step < STEPS.length - 1 ? (
              <TouchableOpacity style={S.nextBtn} onPress={() => setStep(step + 1)}>
                <Text style={S.nextText}>{'\uB2E4\uC74C'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={S.startBtn} onPress={() => { setStep(0); onClose(); }}>
                <Text style={S.startText}>{'\uC2DC\uC791\uD558\uAE30!'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  box: { backgroundColor: COLORS.bgDark, borderRadius: 22, padding: 24, width: 360, maxWidth: '90%' as any, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 20 },
  content: { alignItems: 'center', marginBottom: 16, minHeight: 200 },
  icon: { fontSize: 40, marginBottom: 8 },
  title: { color: '#FFD700', fontSize: 20, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  body: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  dotActive: { backgroundColor: '#F59E0B', width: 20 },
  btns: { flexDirection: 'row', alignItems: 'center' },
  prevBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  prevText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '700' },
  nextBtn: { backgroundColor: '#D97706', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 },
  nextText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  startBtn: { backgroundColor: '#D97706', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  startText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
