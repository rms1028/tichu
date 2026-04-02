import React, { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { SlideInUp, SlideOutUp, FadeIn } from 'react-native-reanimated';

interface Toast {
  id: number;
  icon: string;
  text: string;
  actions?: { label: string; onPress: () => void }[];
  autoHide: boolean;
}

interface ToastCtx {
  addToast: (toast: Omit<Toast, 'id'>) => void;
}

const Ctx = createContext<ToastCtx>({ addToast: () => {} });
export const useToast = () => useContext(Ctx);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId++;
    setToasts(prev => [{ ...t, id }, ...prev].slice(0, 5));
    if (t.autoHide) {
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 5000);
    }
  }, []);

  const removeToast = (id: number) => setToasts(prev => prev.filter(x => x.id !== id));

  return (
    <Ctx.Provider value={{ addToast }}>
      {children}
      <View style={S.container} pointerEvents="box-none">
        {toasts.map((t, i) => (
          <Animated.View key={t.id} entering={SlideInUp.duration(300)} exiting={SlideOutUp.duration(250)} style={[S.toast, { top: 8 + i * 60 }]}>
            <Text style={S.icon}>{t.icon}</Text>
            <Text style={S.text} numberOfLines={2}>{t.text}</Text>
            {t.actions ? (
              <View style={S.actions}>
                {t.actions.map((a, j) => (
                  <TouchableOpacity key={j} style={[S.actionBtn, j === 0 && S.actionPrimary]} onPress={() => { a.onPress(); removeToast(t.id); }}>
                    <Text style={[S.actionText, j === 0 && S.actionTextPrimary]}>{a.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <TouchableOpacity onPress={() => removeToast(t.id)} style={S.closeBtn}>
                <Text style={S.closeText}>{'\u2715'}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        ))}
      </View>
    </Ctx.Provider>
  );
}

const S = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 999 },
  toast: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(10,20,14,0.95)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  icon: { fontSize: 18 },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 6 },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' },
  actionPrimary: { backgroundColor: '#D97706' },
  actionText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' },
  actionTextPrimary: { color: '#fff' },
  closeBtn: { padding: 4 },
  closeText: { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
});
