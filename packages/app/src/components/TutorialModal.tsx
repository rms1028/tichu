import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { COLORS } from '../utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface TutorialStep {
  title: string;
  icon: string;
  body: string;        // multi-line, \n for breaks
  highlight?: string;  // optional emphasis box
}

const STEPS: TutorialStep[] = [
  {
    title: '티츄에 오신 걸 환영합니다',
    icon: '🎴',
    body: '티츄는 4명이 2명씩 팀을 이뤄 즐기는 트릭테이킹 클라이밍 카드 게임입니다.\n\n' +
          '파트너와 협력해 먼저 1,000점에 도달하는 팀이 승리합니다.\n\n' +
          '짧은 10단계 튜토리얼로 기본을 익혀봅시다.',
  },
  {
    title: '목표 — 손패 비우기',
    icon: '🎯',
    body: '매 라운드의 목표는 14장의 손패를 다른 사람보다 먼저 모두 내는 것.\n\n' +
          '가장 늦게 끝난 사람(4등)은 남은 카드를 상대팀에 넘기고, ' +
          '먹은 트릭도 1등에게 양도합니다.',
    highlight: '💡 점수보다 "손패를 털고 나가는 것"이 우선입니다.',
  },
  {
    title: '좌석과 팀',
    icon: '👥',
    body: '4개 좌석은 남/동/북/서로 배치되고, 마주보는 사람이 파트너입니다.\n\n' +
          '• Team 1: 남(0) + 북(2)\n' +
          '• Team 2: 동(1) + 서(3)\n\n' +
          '턴은 시계반대 방향으로 진행됩니다.',
  },
  {
    title: '카드 구성 — 56장',
    icon: '🃏',
    body: '• 일반 52장: 4문양 × 13랭크 (2~A)\n' +
          '  ♠ 검 · ♥ 별 · ♦ 옥 · ♣ 탑\n\n' +
          '• 특수 4장: 참새 · 개 · 봉황 · 용',
  },
  {
    title: '서열',
    icon: '📊',
    body: '2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A\n\n' +
          '용(Dragon)은 싱글 최강 (A 위).\n\n' +
          '팔로우 시엔 같은 타입·장수·더 높은 값 또는 폭탄으로만 이길 수 있습니다.',
  },
  {
    title: '족보 종류',
    icon: '🎰',
    body: '• 싱글 — 1장\n' +
          '• 페어 — 같은 숫자 2장\n' +
          '• 트리플 — 같은 숫자 3장\n' +
          '• 풀하우스 — 트리플 + 페어\n' +
          '• 스트레이트 — 연속 숫자 5장+\n' +
          '• 연속페어 — 연속 숫자 페어 (예: 33-44)\n' +
          '• 폭탄 — 포카드 또는 같은 문양 5장+ 스트레이트',
    highlight: '💣 폭탄은 턴 외에도 즉시 인터럽트 가능',
  },
  {
    title: '특수 카드',
    icon: '✨',
    body: '🐦 참새(Mahjong) — 값 1, 낸 사람이 소원(숫자) 선언 가능\n\n' +
          '🐶 개(Dog) — 리드 권리를 파트너에게 이전. 트릭 성립 X\n\n' +
          '🔥 봉황(Phoenix) — 와일드카드. 싱글은 직전값 +0.5. -25점\n\n' +
          '🐉 용(Dragon) — 싱글 최강. 트릭 승리 시 상대 1명에게 양도. +25점',
  },
  {
    title: '티츄 선언',
    icon: '⭐',
    body: '라운드 중 "이번에 내가 1등 한다"를 선언하면 성공 시 보너스, 실패 시 페널티.\n\n' +
          '• 🔥 라지 티츄 — 처음 8장만 본 상태에서 선언 (+200 / -200)\n' +
          '• ⭐ 스몰 티츄 — 본인이 첫 카드 내기 전까지 선언 (+100 / -100)\n\n' +
          '팀에서 한 명만 선언할 수 있습니다.',
    highlight: '⚠️ 실수 방지를 위해 확인 모달이 뜹니다',
  },
  {
    title: '소원 — 참새의 특권',
    icon: '🌟',
    body: '참새를 내면서 2~A 중 한 숫자를 "소원"으로 선언할 수 있습니다.\n\n' +
          '소원 숫자를 실제로 가진 플레이어는 그 숫자를 포함한 합법 조합을 반드시 내야 합니다 ' +
          '(봉황 보조 포함). 폭탄으로만 가능하면 면제.\n\n' +
          '해당 숫자가 플레이되면 즉시 해제.',
  },
  {
    title: '이제 게임을 시작해볼까요',
    icon: '🚀',
    body: '기본은 여기까지입니다. 몇 가지 팁:\n\n' +
          '• 낮은 싱글부터 털어 상대 탑 카드를 소진시키세요\n' +
          '• A/K는 엔드게임 컨트롤용으로 보존\n' +
          '• 파트너가 이기는 트릭 위에 내지 마세요\n' +
          '• 조합으로 털 수 있는 카드는 싱글로 쪼개지 마세요\n\n' +
          '커스텀 모드에서 봇과 연습하며 감을 익혀보세요!',
    highlight: '🎮 즐거운 게임 되세요',
  },
];

/**
 * Interactive step-by-step Tichu tutorial.
 *
 * - 10 steps covering rules, combinations, special cards, tichu, wish, tips
 * - Back/Next navigation + progress dots
 * - RN 0.76 Modal 금지 (CLAUDE.md §14.2) — absolute overlay View 사용
 */
export function TutorialModal({ visible, onClose }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  if (!visible) return null;

  const current = STEPS[step]!;
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;

  return (
    <View style={S.overlay}>
      <View style={S.container}>
        {/* 헤더 */}
        <View style={S.header}>
          <Text style={S.stepLabel}>{`${step + 1} / ${STEPS.length}`}</Text>
          <TouchableOpacity onPress={onClose} style={S.xBtn}>
            <Text style={S.xText}>{'✕'}</Text>
          </TouchableOpacity>
        </View>

        {/* 진행 점 */}
        <View style={S.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[S.dot, i === step && S.dotActive, i < step && S.dotPast]} />
          ))}
        </View>

        {/* 본문 */}
        <ScrollView style={S.scroll} contentContainerStyle={S.scrollContent}>
          <Text style={S.icon}>{current.icon}</Text>
          <Text style={S.title}>{current.title}</Text>
          <Text style={S.body}>{current.body}</Text>
          {current.highlight && (
            <View style={S.highlight}>
              <Text style={S.highlightText}>{current.highlight}</Text>
            </View>
          )}
        </ScrollView>

        {/* 네비게이션 */}
        <View style={S.nav}>
          <TouchableOpacity
            style={[S.navBtn, S.navBtnBack, isFirst && S.navBtnDisabled]}
            onPress={() => !isFirst && setStep(step - 1)}
            disabled={isFirst}
            activeOpacity={0.7}
          >
            <Text style={[S.navBtnText, isFirst && S.navBtnTextDisabled]}>{'← 이전'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.navBtn, S.navBtnNext]}
            onPress={() => {
              if (isLast) onClose();
              else setStep(step + 1);
            }}
            activeOpacity={0.7}
          >
            <Text style={S.navBtnNextText}>{isLast ? '완료 🎉' : '다음 →'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: 16,
  },
  container: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: 'rgba(20,32,20,0.98)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(245,158,11,0.4)',
    padding: 20,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' },
  xBtn: { padding: 4 },
  xText: { color: 'rgba(255,255,255,0.6)', fontSize: 18, fontWeight: '700' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 14,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dotActive: { backgroundColor: '#F59E0B', width: 20 },
  dotPast: { backgroundColor: 'rgba(245,158,11,0.5)' },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingVertical: 8, alignItems: 'center' },
  icon: { fontSize: 48, marginBottom: 8 },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  body: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'left',
    alignSelf: 'stretch',
    paddingHorizontal: 4,
  },
  highlight: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: 10,
    alignSelf: 'stretch',
  },
  highlightText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  nav: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  navBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  navBtnBack: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  navBtnNext: {
    backgroundColor: '#F59E0B',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '700' },
  navBtnTextDisabled: { color: 'rgba(255,255,255,0.3)' },
  navBtnNextText: { color: '#0a1910', fontSize: 14, fontWeight: '900' },
});
