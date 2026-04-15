import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Platform, StatusBar } from 'react-native';

const ANDROID_TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
import { useUserStore, SHOP_AVATARS, SHOP_CARDBACKS, ShopItem } from '../stores/userStore';
import { COLORS } from '../utils/theme';
import { BackgroundWatermark } from '../components/BackgroundWatermark';

interface Props {
  onBack: () => void;
  onBuyItem?: (itemId: string, category: 'avatar' | 'cardback', price: number) => void;
  onEquipItem?: (itemId: string, category: 'avatar' | 'cardback') => void;
}

export function ShopScreen({ onBack, onBuyItem, onEquipItem }: Props) {
  const { coins, ownedAvatars, ownedCardBacks, equippedAvatar, equippedCardBack, buyItem, equipAvatar, equipCardBack } = useUserStore();
  const [tab, setTab] = useState<'avatar' | 'cardback'>('avatar');
  const [message, setMessage] = useState('');

  const items = tab === 'avatar' ? SHOP_AVATARS : SHOP_CARDBACKS;
  const owned = tab === 'avatar' ? ownedAvatars : ownedCardBacks;
  const equipped = tab === 'avatar' ? equippedAvatar : equippedCardBack;

  const handleBuy = (item: ShopItem) => {
    if (owned.includes(item.id)) {
      if (tab === 'avatar') equipAvatar(item.id);
      else equipCardBack(item.id);
      onEquipItem?.(item.id, item.category);
      setMessage(`${item.name} 장착!`);
    } else {
      const ok = buyItem(item);
      if (ok) {
        setMessage(`${item.name} 구매 완료! (-${item.price} 코인)`);
        onBuyItem?.(item.id, item.category, item.price);
        // 로컬 장착 (서버는 buy_item 트랜잭션에서 자동 장착 처리)
        if (tab === 'avatar') equipAvatar(item.id);
        else equipCardBack(item.id);
      } else {
        setMessage('코인이 부족합니다!');
      }
    }
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <SafeAreaView style={S.root}>
      <BackgroundWatermark />
      <View style={S.header}>
        <TouchableOpacity onPress={onBack}><Text style={S.back}>{'← 뒤로'}</Text></TouchableOpacity>
        <Text style={S.title}>{'🛒 상점'}</Text>
        <View style={S.coinBadge}><Text style={S.coinIcon}>{'🪙'}</Text><Text style={S.coinText}>{coins}</Text></View>
      </View>
      {/* 탭 */}
      <View style={S.tabs}>
        <TouchableOpacity style={[S.tab, tab === 'avatar' && S.tabActive]} onPress={() => setTab('avatar')}>
          <Text style={[S.tabText, tab === 'avatar' && S.tabTextActive]}>{'아바타'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[S.tab, tab === 'cardback' && S.tabActive]} onPress={() => setTab('cardback')}>
          <Text style={[S.tabText, tab === 'cardback' && S.tabTextActive]}>{'카드 뒷면'}</Text>
        </TouchableOpacity>
      </View>
      {/* 메시지 */}
      {message ? <Text style={S.message}>{message}</Text> : null}
      {/* 아이템 그리드 */}
      <ScrollView style={S.scroll} contentContainerStyle={S.grid}>
        {items.map(item => {
          const isOwned = owned.includes(item.id);
          const isEquipped = equipped === item.id;
          return (
            <TouchableOpacity key={item.id} style={[S.item, isEquipped && S.itemEquipped]} onPress={() => handleBuy(item)} activeOpacity={0.8}>
              <Text style={S.itemEmoji}>{item.emoji}</Text>
              <Text style={S.itemName}>{item.name}</Text>
              {isEquipped ? (
                <View style={S.equippedBadge}><Text style={S.equippedText}>{'장착중'}</Text></View>
              ) : isOwned ? (
                <View style={S.ownedBadge}><Text style={S.ownedText}>{'장착'}</Text></View>
              ) : item.price === 0 ? (
                <Text style={S.freeText}>{'무료'}</Text>
              ) : (
                <View style={S.priceBadge}>
                  <Text style={S.priceText}>{'🪙 '}{item.price}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg, paddingTop: ANDROID_TOP_INSET },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, zIndex: 10 },
  back: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' },
  title: { color: '#FFD700', fontSize: 20, fontWeight: '900' },
  coinBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  coinIcon: { fontSize: 14 },
  coinText: { color: '#F59E0B', fontSize: 14, fontWeight: '800' },

  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8, zIndex: 5 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  tabActive: { backgroundColor: 'rgba(245,158,11,0.15)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  tabText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#F59E0B' },

  message: { color: '#F59E0B', fontSize: 13, fontWeight: '700', textAlign: 'center', paddingVertical: 6, zIndex: 5 },

  scroll: { flex: 1, zIndex: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10, paddingBottom: 20 },
  item: { width: '22%', minWidth: 80, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 4 },
  itemEquipped: { borderWidth: 2, borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)' },
  itemEmoji: { fontSize: 36 },
  itemName: { color: '#fff', fontSize: 12, fontWeight: '700' },
  equippedBadge: { backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  equippedText: { color: '#F59E0B', fontSize: 10, fontWeight: '800' },
  ownedBadge: { backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  ownedText: { color: '#10b981', fontSize: 10, fontWeight: '700' },
  freeText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: '600' },
  priceBadge: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  priceText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700' },
});
