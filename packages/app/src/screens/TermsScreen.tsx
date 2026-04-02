import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

interface Props { onBack: () => void; }

export function TermsScreen({ onBack }: Props) {
  return (
    <SafeAreaView style={T.root}>
      <BackgroundWatermark />
      <View style={T.header}>
        <TouchableOpacity onPress={onBack}><Text style={T.back}>{'← 뒤로'}</Text></TouchableOpacity>
        <Text style={T.title}>{'📋 이용약관'}</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView style={T.scroll} contentContainerStyle={T.content}>

        <Text style={T.updated}>{'최종 업데이트: 2024년 4월 1일'}</Text>

        <Text style={T.h2}>{'제1조 (목적)'}</Text>
        <Text style={T.p}>{'본 약관은 티츄(TICHU) 모바일 카드 게임(이하 "서비스")의 이용에 관한 기본적인 사항을 규정함을 목적으로 합니다.'}</Text>

        <Text style={T.h2}>{'제2조 (용어의 정의)'}</Text>
        <Text style={T.p}>{'1. "서비스"란 회사가 제공하는 티츄 카드 게임 및 관련 부가 서비스를 말합니다.'}</Text>
        <Text style={T.p}>{'2. "회원"이란 서비스에 가입하여 이용하는 자를 말합니다.'}</Text>
        <Text style={T.p}>{'3. "게임 재화"란 서비스 내에서 사용되는 코인, 보석 등의 가상 화폐를 말합니다.'}</Text>
        <Text style={T.p}>{'4. "콘텐츠"란 아바타, 카드 스킨 등 서비스 내 디지털 아이템을 말합니다.'}</Text>

        <Text style={T.h2}>{'제3조 (약관의 효력 및 변경)'}</Text>
        <Text style={T.p}>{'1. 본 약관은 서비스 화면에 게시하거나 기타 방법으로 회원에게 공지함으로써 효력을 발생합니다.'}</Text>
        <Text style={T.p}>{'2. 회사는 관련 법률에 위배되지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 7일 전에 공지합니다.'}</Text>

        <Text style={T.h2}>{'제4조 (회원 가입 및 탈퇴)'}</Text>
        <Text style={T.p}>{'1. 회원 가입은 서비스 내 닉네임 설정으로 완료됩니다.'}</Text>
        <Text style={T.p}>{'2. 회원은 언제든지 서비스 내 설정에서 탈퇴를 요청할 수 있습니다.'}</Text>
        <Text style={T.p}>{'3. 탈퇴 시 보유한 게임 재화 및 콘텐츠는 소멸되며 복구되지 않습니다.'}</Text>

        <Text style={T.h2}>{'제5조 (서비스 이용)'}</Text>
        <Text style={T.p}>{'1. 서비스는 연중무휴 24시간 제공을 원칙으로 하나, 정기 점검 등의 사유로 일시 중단될 수 있습니다.'}</Text>
        <Text style={T.p}>{'2. 회원은 서비스를 게임 이용 목적으로만 사용해야 합니다.'}</Text>

        <Text style={T.h2}>{'제6조 (게임 재화)'}</Text>
        <Text style={T.p}>{'1. 게임 재화는 게임 플레이, 출석 보상, 미션 달성 등을 통해 획득할 수 있습니다.'}</Text>
        <Text style={T.p}>{'2. 게임 재화는 서비스 내 아이템 구매에만 사용 가능하며, 현금으로 환전할 수 없습니다.'}</Text>
        <Text style={T.p}>{'3. 부정한 방법으로 획득한 재화는 회수될 수 있습니다.'}</Text>

        <Text style={T.h2}>{'제7조 (금지 행위)'}</Text>
        <Text style={T.p}>{'회원은 다음 행위를 해서는 안 됩니다:'}</Text>
        <Text style={T.p}>{'• 버그를 이용한 부정 플레이'}</Text>
        <Text style={T.p}>{'• 다른 회원에 대한 욕설, 비방, 괴롭힘'}</Text>
        <Text style={T.p}>{'• 서비스의 정상적인 운영을 방해하는 행위'}</Text>
        <Text style={T.p}>{'• 타인의 계정을 무단으로 사용하는 행위'}</Text>
        <Text style={T.p}>{'• 자동 플레이 프로그램(봇, 매크로) 사용'}</Text>

        <Text style={T.h2}>{'제8조 (개인정보 보호)'}</Text>
        <Text style={T.p}>{'1. 회사는 회원의 개인정보를 관련 법률에 따라 보호합니다.'}</Text>
        <Text style={T.p}>{'2. 수집하는 정보: 닉네임, 게임 플레이 데이터, 접속 기록'}</Text>
        <Text style={T.p}>{'3. 수집 목적: 서비스 제공, 게임 매칭, 통계 분석'}</Text>

        <Text style={T.h2}>{'제9조 (면책 사항)'}</Text>
        <Text style={T.p}>{'1. 회사는 천재지변, 전쟁 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.'}</Text>
        <Text style={T.p}>{'2. 회원 간 분쟁에 대해 회사는 개입할 의무를 지지 않습니다.'}</Text>

        <Text style={T.h2}>{'제10조 (분쟁 해결)'}</Text>
        <Text style={T.p}>{'서비스 이용과 관련하여 발생한 분쟁은 대한민국 법률에 따라 해결합니다.'}</Text>

        <View style={T.footer}>
          <Text style={T.footerText}>{'본 약관은 2024년 4월 1일부터 시행됩니다.'}</Text>
          <Text style={T.footerText}>{'문의: support@tichu-game.com'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const T = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 10 },
  back: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
  title: { color: '#FFD700', fontSize: 18, fontWeight: '900' },
  scroll: { flex: 1, zIndex: 5 },
  content: { paddingHorizontal: 20, paddingBottom: 30, maxWidth: 700, alignSelf: 'center', width: '100%' },
  updated: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginBottom: 16, textAlign: 'center' },
  h2: { color: '#F59E0B', fontSize: 16, fontWeight: '800', marginTop: 18, marginBottom: 8 },
  p: { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 20, marginBottom: 4 },
  footer: { marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', alignItems: 'center', gap: 4 },
  footerText: { color: 'rgba(255,255,255,0.25)', fontSize: 11 },
});
