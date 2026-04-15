import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Platform, StatusBar } from 'react-native';

const ANDROID_TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

interface Props { onBack: () => void; }

type Tab = 'terms' | 'privacy';

export function TermsScreen({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('terms');

  return (
    <SafeAreaView style={T.root}>
      <BackgroundWatermark />
      <View style={T.header}>
        <TouchableOpacity onPress={onBack}><Text style={T.back}>{'<- 뒤로'}</Text></TouchableOpacity>
        <Text style={T.title}>{'📋 약관 및 정책'}</Text>
        <View style={{ width: 50 }} />
      </View>
      <View style={T.tabRow}>
        <TouchableOpacity style={[T.tab, tab === 'terms' && T.tabActive]} onPress={() => setTab('terms')}>
          <Text style={[T.tabText, tab === 'terms' && T.tabTextActive]}>{'이용약관'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[T.tab, tab === 'privacy' && T.tabActive]} onPress={() => setTab('privacy')}>
          <Text style={[T.tabText, tab === 'privacy' && T.tabTextActive]}>{'개인정보처리방침'}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={T.scroll} contentContainerStyle={T.content}>
        {tab === 'terms' ? <TermsContent /> : <PrivacyContent />}
        <View style={T.footer}>
          <Text style={T.footerText}>{'본 약관은 2026년 4월 11일부터 시행됩니다.'}</Text>
          <Text style={T.footerText}>{'문의: support@tichu-game.com'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TermsContent() {
  return (
    <>
      <Text style={T.updated}>{'최종 업데이트: 2026년 4월 11일'}</Text>
      <Text style={T.h2}>{'제1조 (목적)'}</Text>
      <Text style={T.p}>{'본 약관은 티츄(TICHU) 모바일 카드 게임(이하 "서비스")의 이용에 관한 기본적인 사항을 규정함을 목적으로 합니다.'}</Text>
      <Text style={T.h2}>{'제2조 (용어의 정의)'}</Text>
      <Text style={T.p}>{'1. "서비스"란 회사가 제공하는 티츄 카드 게임 및 관련 부가 서비스를 말합니다.'}</Text>
      <Text style={T.p}>{'2. "회원"이란 서비스에 가입하여 이용하는 자를 말합니다.'}</Text>
      <Text style={T.p}>{'3. "게임 재화"란 서비스 내에서 사용되는 코인 등의 가상 화폐를 말합니다.'}</Text>
      <Text style={T.p}>{'4. "콘텐츠"란 아바타, 카드 스킨 등 서비스 내 디지털 아이템을 말합니다.'}</Text>
      <Text style={T.h2}>{'제3조 (약관의 효력 및 변경)'}</Text>
      <Text style={T.p}>{'1. 본 약관은 서비스 화면에 게시하거나 기타 방법으로 회원에게 공지함으로써 효력을 발생합니다.'}</Text>
      <Text style={T.p}>{'2. 회사는 관련 법률에 위배되지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 7일 전에 공지합니다.'}</Text>
      <Text style={T.h2}>{'제4조 (회원 가입 및 탈퇴)'}</Text>
      <Text style={T.p}>{'1. 회원 가입은 서비스 내 닉네임 설정으로 완료됩니다.'}</Text>
      <Text style={T.p}>{'2. 회원은 언제든지 서비스 내 설정 > 계정 삭제에서 탈퇴를 요청할 수 있습니다.'}</Text>
      <Text style={T.p}>{'3. 탈퇴 시 보유한 게임 재화, 전적, 친구 목록 등 모든 데이터가 즉시 영구 삭제되며 복구되지 않습니다.'}</Text>
      <Text style={T.h2}>{'제5조 (서비스 이용)'}</Text>
      <Text style={T.p}>{'1. 서비스는 연중무휴 24시간 제공을 원칙으로 하나, 정기 점검 등의 사유로 일시 중단될 수 있습니다.'}</Text>
      <Text style={T.p}>{'2. 서버 점검 또는 장애 발생 시 진행 중인 게임이 유실될 수 있으며, 이에 대한 보상은 제공되지 않을 수 있습니다.'}</Text>
      <Text style={T.h2}>{'제6조 (게임 재화)'}</Text>
      <Text style={T.p}>{'1. 게임 재화는 게임 플레이, 출석 보상, 미션 달성 등을 통해 무료로 획득할 수 있습니다.'}</Text>
      <Text style={T.p}>{'2. 게임 재화는 서비스 내 아이템 구매에만 사용 가능하며, 현금으로 환전할 수 없습니다.'}</Text>
      <Text style={T.p}>{'3. 부정한 방법으로 획득한 재화는 회수될 수 있습니다.'}</Text>
      <Text style={T.h2}>{'제7조 (금지 행위)'}</Text>
      <Text style={T.p}>{'회원은 다음 행위를 해서는 안 됩니다:'}</Text>
      <Text style={T.p}>{'• 버그를 이용한 부정 플레이'}</Text>
      <Text style={T.p}>{'• 다른 회원에 대한 욕설, 비방, 괴롭힘'}</Text>
      <Text style={T.p}>{'• 서비스의 정상적인 운영을 방해하는 행위'}</Text>
      <Text style={T.p}>{'• 타인의 계정을 무단으로 사용하는 행위'}</Text>
      <Text style={T.p}>{'• 자동 플레이 프로그램(봇, 매크로) 사용'}</Text>
      <Text style={T.h2}>{'제8조 (면책 사항)'}</Text>
      <Text style={T.p}>{'1. 회사는 천재지변, 전쟁 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.'}</Text>
      <Text style={T.p}>{'2. 회원 간 분쟁에 대해 회사는 개입할 의무를 지지 않습니다.'}</Text>
      <Text style={T.h2}>{'제9조 (분쟁 해결)'}</Text>
      <Text style={T.p}>{'서비스 이용과 관련하여 발생한 분쟁은 대한민국 법률에 따라 해결합니다.'}</Text>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <Text style={T.updated}>{'최종 업데이트: 2026년 4월 11일'}</Text>
      <Text style={T.h2}>{'1. 수집하는 개인정보'}</Text>
      <Text style={T.p}>{'서비스는 다음 정보를 수집합니다:'}</Text>
      <Text style={T.p}>{'• 닉네임 (회원이 직접 설정)'}</Text>
      <Text style={T.p}>{'• 게임 플레이 기록 (승/패, 점수, 티츄 선언 등)'}</Text>
      <Text style={T.p}>{'• 접속 기록 (접속 시간, IP 주소)'}</Text>
      <Text style={T.p}>{'• 기기 정보 (푸시 알림용 토큰)'}</Text>
      <Text style={T.p}>{'• Google 로그인 시: 이메일, 표시 이름 (Firebase Authentication 통해 제공)'}</Text>

      <Text style={T.h2}>{'2. 개인정보의 수집 및 이용 목적'}</Text>
      <Text style={T.p}>{'• 서비스 제공 및 게임 매칭'}</Text>
      <Text style={T.p}>{'• 랭킹, 전적, 시즌 통계 산출'}</Text>
      <Text style={T.p}>{'• 부정행위 탐지 및 방지'}</Text>
      <Text style={T.p}>{'• 푸시 알림 전송 (친구 초대, 게임 시작 등)'}</Text>

      <Text style={T.h2}>{'3. 제3자 서비스'}</Text>
      <Text style={T.p}>{'서비스는 다음 외부 서비스를 이용합니다:'}</Text>
      <Text style={T.p}>{'• Firebase (Google): 인증, 푸시 알림'}</Text>
      <Text style={T.p}>{'• Railway: 서버 호스팅 및 데이터베이스'}</Text>
      <Text style={T.p}>{'• Expo (React Native): 앱 빌드 및 배포'}</Text>
      <Text style={T.p}>{'각 서비스는 해당 서비스의 개인정보처리방침에 따라 데이터를 처리합니다.'}</Text>

      <Text style={T.h2}>{'4. 개인정보의 보유 및 파기'}</Text>
      <Text style={T.p}>{'• 회원 탈퇴 시 모든 개인정보는 즉시 영구 삭제됩니다.'}</Text>
      <Text style={T.p}>{'• 게임 기록, 전적, 친구 목록, 보유 재화 등 모든 데이터가 삭제됩니다.'}</Text>
      <Text style={T.p}>{'• 부정행위 관련 기록은 법적 의무에 따라 일정 기간 보관될 수 있습니다.'}</Text>

      <Text style={T.h2}>{'5. 회원의 권리'}</Text>
      <Text style={T.p}>{'회원은 다음 권리를 행사할 수 있습니다:'}</Text>
      <Text style={T.p}>{'• 계정 삭제: 설정 > 계정 삭제에서 즉시 요청 가능'}</Text>
      <Text style={T.p}>{'• 데이터 열람: support@tichu-game.com으로 요청'}</Text>
      <Text style={T.p}>{'• 푸시 알림 거부: 설정에서 알림을 비활성화할 수 있습니다'}</Text>

      <Text style={T.h2}>{'6. 아동 보호'}</Text>
      <Text style={T.p}>{'서비스는 만 14세 미만의 아동으로부터 개인정보를 수집하지 않습니다. 만 14세 미만이 서비스를 이용하는 경우 법정대리인의 동의가 필요합니다.'}</Text>

      <Text style={T.h2}>{'7. 문의'}</Text>
      <Text style={T.p}>{'개인정보 관련 문의: support@tichu-game.com'}</Text>
    </>
  );
}

const T = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, paddingTop: ANDROID_TOP_INSET },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 10 },
  back: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
  title: { color: '#FFD700', fontSize: 18, fontWeight: '900' },
  tabRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 8, zIndex: 5 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center' },
  tabActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: '#F59E0B' },
  tabText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#F59E0B' },
  scroll: { flex: 1, zIndex: 5 },
  content: { paddingHorizontal: 20, paddingBottom: 30, maxWidth: 700, alignSelf: 'center', width: '100%' },
  updated: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginBottom: 16, textAlign: 'center' },
  h2: { color: '#F59E0B', fontSize: 16, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  p: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 20, marginBottom: 4 },
  footer: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', alignItems: 'center', gap: 4 },
  footerText: { color: 'rgba(255,255,255,0.25)', fontSize: 11 },
});
