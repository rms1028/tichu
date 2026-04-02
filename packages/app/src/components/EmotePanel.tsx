import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { COLORS } from '../utils/theme';

const EMOTES = [
  { emoji: '\uD83D\uDC4D', label: '\uC798\uD588\uC5B4!' },
  { emoji: '\uD83D\uDE02', label: '\u314B\u314B' },
  { emoji: '\uD83D\uDD25', label: '\uB300\uBC15' },
  { emoji: '\uD83D\uDE31', label: '\uD5D0' },
  { emoji: '\u23F0', label: '\uC11C\uB458\uB7EC!' },
  { emoji: '\uD83E\uDD1D', label: '\uBBFF\uC744\uAC8C' },
  { emoji: '\uD83C\uDF89', label: '\uCD95\uD558' },
  { emoji: '\uD83D\uDC4B', label: '\uC548\uB155' },
];

interface Props {
  onSend: (emoji: string, label: string) => void;
}

export function EmoteButton({ onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      autoCloseRef.current = setTimeout(() => setOpen(false), 3000);
      return () => { if (autoCloseRef.current) clearTimeout(autoCloseRef.current); };
    }
  }, [open]);

  const handleSend = (emoji: string, label: string) => {
    if (cooldown) return;
    onSend(emoji, label);
    setOpen(false);
    setCooldown(true);
    setTimeout(() => setCooldown(false), 5000);
  };

  return (
    <View style={S.wrap}>
      {/* 이모트 패널 */}
      {open && (
        <Animated.View entering={SlideInDown.duration(200)} exiting={SlideOutDown.duration(150)} style={S.panel}>
          <View style={S.grid}>
            {EMOTES.map((e, i) => (
              <TouchableOpacity key={i} style={[S.emoteBtn, cooldown && S.emoteCooldown]} onPress={() => handleSend(e.emoji, e.label)} disabled={cooldown}>
                <Text style={S.emoteEmoji}>{e.emoji}</Text>
                <Text style={S.emoteLabel}>{e.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      )}

      {/* 채팅 버튼 */}
      <TouchableOpacity style={[S.chatBtn, cooldown && S.chatBtnCooldown]} onPress={() => setOpen(!open)} activeOpacity={0.7}>
        <Text style={S.chatIcon}>{'\uD83D\uDCAC'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// 말풍선 컴포넌트 (아바타 위에 표시)
export function EmoteBubble({ emoji, label }: { emoji: string; label: string }) {
  return (
    <Animated.View entering={ZoomIn.duration(200).springify()} exiting={FadeOut.duration(300)} style={S.bubble}>
      <Text style={S.bubbleEmoji}>{emoji}</Text>
      <Text style={S.bubbleLabel}>{label}</Text>
      <View style={S.bubbleTail} />
    </Animated.View>
  );
}

const S = StyleSheet.create({
  wrap: { zIndex: 50, alignItems: 'flex-end' },

  panel: {
    position: 'absolute', bottom: 42, right: 0,
    backgroundColor: 'rgba(10,20,14,0.95)', borderRadius: 14, padding: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 200, gap: 4 },
  emoteBtn: { width: 46, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)' },
  emoteCooldown: { opacity: 0.3 },
  emoteEmoji: { fontSize: 20 },
  emoteLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: '600', marginTop: 2 },

  chatBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chatBtnCooldown: { opacity: 0.4 },
  chatIcon: { fontSize: 20 },

  bubble: {
    position: 'absolute', top: -40, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 8,
  },
  bubbleEmoji: { fontSize: 16 },
  bubbleLabel: { color: '#1a472a', fontSize: 11, fontWeight: '700' },
  bubbleTail: {
    position: 'absolute', bottom: -5, alignSelf: 'center', left: '42%' as any,
    width: 0, height: 0, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'rgba(255,255,255,0.95)',
  },
});
