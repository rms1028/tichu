import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { COLORS } from '../utils/theme';

interface Props {
  visible: boolean;
  targetNickname: string;
  onClose: () => void;
  onSubmit: (reason: string, description?: string) => void;
}

const REASONS: { id: string; label: string; icon: string }[] = [
  { id: 'afk', label: '고의 지연 (AFK)', icon: '⏱️' },
  { id: 'abuse', label: '욕설/비하 발언', icon: '💬' },
  { id: 'cheat', label: '치팅/부정행위', icon: '🚨' },
  { id: 'spam', label: '도배/스팸', icon: '📢' },
  { id: 'other', label: '기타', icon: '⚠️' },
];

/**
 * 게임 중 신고 모달 — absolute overlay (RN 0.76 Modal 금지 규칙 준수).
 * 신고 사유 5개 중 택1 + 선택적 상세 설명. 제출 후 toast 피드백.
 */
export function ReportModal({ visible, targetNickname, onClose, onSubmit }: Props) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  if (!visible) return null;

  const handleSubmit = () => {
    if (!selectedReason) return;
    onSubmit(selectedReason, description.trim() || undefined);
    setSelectedReason(null);
    setDescription('');
  };

  const handleCancel = () => {
    setSelectedReason(null);
    setDescription('');
    onClose();
  };

  return (
    <View style={S.overlay} pointerEvents="auto">
      <View style={S.box}>
        <Text style={S.icon}>{'🚨'}</Text>
        <Text style={S.title}>{'플레이어 신고'}</Text>
        <Text style={S.subtitle} numberOfLines={1}>{`"${targetNickname}" 을(를) 신고합니다`}</Text>

        <Text style={S.sectionLabel}>{'신고 사유'}</Text>
        <View style={S.reasonList}>
          {REASONS.map(r => (
            <TouchableOpacity
              key={r.id}
              style={[S.reasonRow, selectedReason === r.id && S.reasonRowActive]}
              onPress={() => setSelectedReason(r.id)}
              activeOpacity={0.7}
            >
              <Text style={S.reasonIcon}>{r.icon}</Text>
              <Text style={[S.reasonLabel, selectedReason === r.id && S.reasonLabelActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={S.sectionLabel}>{'상세 설명 (선택)'}</Text>
        <TextInput
          style={S.input}
          value={description}
          onChangeText={setDescription}
          placeholder={'구체적인 상황을 적어주세요'}
          placeholderTextColor="rgba(255,255,255,0.3)"
          maxLength={200}
          multiline
        />

        <View style={S.btnRow}>
          <TouchableOpacity style={[S.btn, S.btnCancel]} onPress={handleCancel} activeOpacity={0.7}>
            <Text style={S.btnCancelText}>{'취소'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.btn, S.btnSubmit, !selectedReason && S.btnDisabled]}
            onPress={handleSubmit}
            disabled={!selectedReason}
            activeOpacity={0.7}
          >
            <Text style={S.btnSubmitText}>{'신고'}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5000,
    padding: 20,
  },
  box: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(20,32,20,0.98)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.6)',
    padding: 20,
    gap: 10,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
  },
  icon: { fontSize: 32, textAlign: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginBottom: 6 },
  sectionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', marginTop: 4 },
  reasonList: { gap: 6 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reasonRowActive: {
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderColor: 'rgba(239,68,68,0.7)',
  },
  reasonIcon: { fontSize: 16 },
  reasonLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  reasonLabelActive: { color: '#fff', fontWeight: '800' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: '#fff',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    minHeight: 60,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    textAlignVertical: 'top',
  },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnCancel: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  btnSubmit: { backgroundColor: '#ef4444' },
  btnDisabled: { opacity: 0.4 },
  btnCancelText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '700' },
  btnSubmitText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
