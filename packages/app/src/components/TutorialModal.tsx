import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { COLORS } from '../utils/theme';

const STEPS = [
  {
    icon: '🃏',
    title: '티츄에 오신 걸 환영합니다!',
    body: '4명이 2팀으로 나눠 플레이하는 전략 카드 게임입니다.\n맞은편에 앉은 사람이 내 파트너예요.\n\n목표: 1,000점을 먼저 달성하는 팀이 승리!',
  },
  {
    icon: '📦',
    title: '카드 구성',
    body: '일반 카드 52장 (2~A, 4가지 문양)\n\n특수 카드 4장:\n🐦 참새(1) — 가장 먼저 내는 카드\n🐕 개 — 파트너에게 턴을 넘김\n🦅 봉황 — 와일드카드 (조커)\n🐉 용 — 싱글 최강 카드',
  },
  {
    icon: '🔄',
    title: '게임 진행',
    body: '① 카드 14장을 받고 라지 티츄 선언 기회\n② 3장을 좌/파트너/우에게 교환\n③ 참새를 가진 사람이 첫 리드\n④ 같은 종류 + 더 높은 카드로 이겨야 함\n⑤ 모두 패스하면 트릭 승리, 새 리드',
  },
  {
    icon: '♠',
    title: '카드 조합',
    body: '• 싱글 — 카드 1장\n• 페어 — 같은 숫자 2장\n• 트리플 — 같은 숫자 3장\n• 풀하우스 — 트리플 + 페어\n• 스트레이트 — 연속 숫자 5장 이상\n• 연속 페어 — 연속 숫자 페어 2쌍+',
  },
  {
    icon: '💣',
    title: '폭탄',
    body: '• 포카드 — 같은 숫자 4장\n• 스트레이트 플러시 — 같은 문양 연속 5장+\n\n어떤 조합이든 폭탄으로 이길 수 있어요!\n상대 턴이어도 폭탄은 낼 수 있습니다.',
  },
  {
    icon: '🔥',
    title: '티츄 선언',
    body: '• 라지 티츄 — 8장만 봤을 때 선언\n  성공 +200점, 실패 -200점\n\n• 스몰 티츄 — 첫 카드 내기 전 선언\n  성공 +100점, 실패 -100점\n\n선언 후 1등으로 나가면 성공!\n팀당 1명만 선언할 수 있어요.',
  },
  {
    icon: '💰',
    title: '점수 계산',
    body: '• 5: +5점\n• 10, K: +10점\n• 용: +25점\n• 봉황: -25점\n• 나머지: 0점\n\n라운드 총합은 항상 100점!\n4등의 남은 카드 → 상대팀에게\n4등의 획득 트릭 → 1등에게',
  },
  {
    icon: '🏆',
    title: '준비 완료!',
    body: '이제 티츄를 시작할 준비가 되었어요!\n\n💡 파트너와 협력하는 것이 핵심입니다.\n💡 폭탄은 결정적인 순간에 사용하세요.\n💡 같은 팀 1등+2등 = 원투 피니시 200점!\n💡 소원은 상대를 견제하는 데 활용하세요.',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function TutorialModal({ visible, onClose }: Props) {
  const [step, setStep] = useState(0);
  const cur = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={S.overlay}>
        <View style={S.box}>
          {/* 건너뛰기 */}
          <TouchableOpacity style={S.skipBtn} onPress={handleClose}>
            <Text style={S.skipText}>건너뛰기</Text>
          </TouchableOpacity>
          <Animated.View key={step} entering={FadeIn.duration(300)} style={S.content}>
            <Text style={S.icon}>{cur.icon}</Text>
            <Text style={S.title}>{cur.title}</Text>
            <Text style={S.body}>{cur.body}</Text>
          </Animated.View>
          {/* 진행 바 */}
          <View style={S.dots}>
            {STEPS.map((_, i) => <View key={i} style={[S.dot, i === step && S.dotActive, i < step && S.dotDone]} />)}
          </View>
          {/* 버튼 */}
          <View style={S.btns}>
            {step > 0 && (
              <TouchableOpacity style={S.prevBtn} onPress={() => setStep(step - 1)}>
                <Text style={S.prevText}>이전</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <Text style={S.pageNum}>{step + 1} / {STEPS.length}</Text>
            <View style={{ flex: 1 }} />
            {!isLast ? (
              <TouchableOpacity style={S.nextBtn} onPress={() => setStep(step + 1)}>
                <Text style={S.nextText}>다음</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={S.startBtn} onPress={handleClose}>
                <Text style={S.startText}>시작하기!</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  box: {
    backgroundColor: COLORS.bgDark, borderRadius: 22, padding: 24,
    width: 400, maxWidth: '92%' as any,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  skipBtn: { alignSelf: 'flex-end', marginBottom: 4 },
  skipText: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '600' },
  content: { alignItems: 'center', marginBottom: 16, minHeight: 220 },
  icon: { fontSize: 48, marginBottom: 10 },
  title: { color: '#FFD700', fontSize: 20, fontWeight: '900', marginBottom: 14, textAlign: 'center' },
  body: { color: 'rgba(255,255,255,0.75)', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  dotActive: { backgroundColor: COLORS.accent, width: 18 },
  dotDone: { backgroundColor: 'rgba(243,156,18,0.35)' },
  btns: { flexDirection: 'row', alignItems: 'center' },
  prevBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  prevText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '700' },
  pageNum: { color: 'rgba(255,255,255,0.25)', fontSize: 12 },
  nextBtn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10 },
  nextText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  startBtn: { backgroundColor: '#2ecc71', borderRadius: 10, paddingHorizontal: 28, paddingVertical: 10, shadowColor: '#2ecc71', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  startText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
