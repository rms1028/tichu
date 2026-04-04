import { create } from 'zustand';
import { Platform } from 'react-native';

// 티어 정의 (서버 ranking.ts와 동일)
export type TierKey = 'iron' | 'bronze' | 'silver' | 'gold' | 'diamond' | 'dragon';
export type SubTier = 'III' | 'II' | 'I';

export const TIERS = [
  { key: 'iron' as TierKey,    name: '아이언',     icon: '🔩', color: '#888880', min: 0,    max: 499 },
  { key: 'bronze' as TierKey,  name: '브론즈',     icon: '🥉', color: '#CD7F32', min: 500,  max: 1199 },
  { key: 'silver' as TierKey,  name: '실버',       icon: '🥈', color: '#C0C0C0', min: 1200, max: 2199 },
  { key: 'gold' as TierKey,    name: '골드',       icon: '🥇', color: '#DAA520', min: 2200, max: 3499 },
  { key: 'diamond' as TierKey, name: '다이아몬드', icon: '💎', color: '#00AADD', min: 3500, max: 4999 },
  { key: 'dragon' as TierKey,  name: '드래곤',     icon: '🐲', color: '#CC3333', min: 5000, max: 99999 },
];

export function getTier(xp: number) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (xp >= TIERS[i]!.min) return TIERS[i]!;
  }
  return TIERS[0]!;
}

export function getSubTier(xp: number): SubTier | null {
  const tier = getTier(xp);
  if (tier.key === 'dragon') return null;
  const range = tier.max - tier.min + 1;
  const offset = xp - tier.min;
  const third = range / 3;
  if (offset < third) return 'III';
  if (offset < third * 2) return 'II';
  return 'I';
}

export function getNextTier(xp: number) {
  const cur = getTier(xp);
  const idx = TIERS.indexOf(cur);
  return idx < TIERS.length - 1 ? TIERS[idx + 1]! : null;
}

// 미션 정의
export interface Mission {
  id: string;
  text: string;
  target: number;
  progress: number;
  reward: number;
  rewardType: 'coin' | 'xp';
  completed: boolean;
  claimed: boolean;
}

function createDailyMissions(): Mission[] {
  return [
    { id: 'play3', text: '3판 플레이', target: 3, progress: 0, reward: 50, rewardType: 'coin', completed: false, claimed: false },
    { id: 'tichu1', text: '티츄 선언 성공', target: 1, progress: 0, reward: 100, rewardType: 'coin', completed: false, claimed: false },
    { id: 'win2', text: '연속 2승', target: 2, progress: 0, reward: 80, rewardType: 'coin', completed: false, claimed: false },
  ];
}

// 상점 아이템
export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  price: number;
  category: 'avatar' | 'cardback';
}

export const SHOP_AVATARS: ShopItem[] = [
  { id: 'dragon', name: '용', emoji: '🐲', price: 0, category: 'avatar' },
  { id: 'lion', name: '사자', emoji: '🦁', price: 200, category: 'avatar' },
  { id: 'bear', name: '곰', emoji: '🐻', price: 200, category: 'avatar' },
  { id: 'fox', name: '여우', emoji: '🦊', price: 300, category: 'avatar' },
  { id: 'tiger', name: '호랑이', emoji: '🐯', price: 300, category: 'avatar' },
  { id: 'eagle', name: '독수리', emoji: '🦅', price: 400, category: 'avatar' },
  { id: 'wolf', name: '늑대', emoji: '🐺', price: 400, category: 'avatar' },
  { id: 'owl', name: '올빼미', emoji: '🦉', price: 500, category: 'avatar' },
  { id: 'phoenix', name: '봉황', emoji: '🔥', price: 800, category: 'avatar' },
  { id: 'unicorn', name: '유니콘', emoji: '🦄', price: 1000, category: 'avatar' },
];

export const SHOP_CARDBACKS: ShopItem[] = [
  { id: 'classic', name: '클래식', emoji: '🂠', price: 0, category: 'cardback' },
  { id: 'gold', name: '골드', emoji: '✨', price: 300, category: 'cardback' },
  { id: 'royal', name: '로열', emoji: '👑', price: 500, category: 'cardback' },
  { id: 'flame', name: '불꽃', emoji: '🔥', price: 800, category: 'cardback' },
];

// 스토어 타입
interface UserState {
  // 기본 정보
  playerId: string;
  coins: number;
  xp: number;
  nickname: string;

  // 전적
  totalGames: number;
  wins: number;
  losses: number;
  tichuSuccess: number;
  tichuFail: number;
  winStreak: number;

  // 출석
  attendanceStreak: number;
  lastAttendanceDate: string;

  // 미션
  missions: Mission[];
  lastMissionDate: string;

  // 설정
  soundOn: boolean;
  musicOn: boolean;
  ttsOn: boolean;
  notifyOn: boolean;
  friendNotify: boolean;
  gameNotify: boolean;

  // 상점
  ownedAvatars: string[];
  ownedCardBacks: string[];
  equippedAvatar: string;
  equippedCardBack: string;

  // 액션
  addCoins: (amount: number) => void;
  addXp: (amount: number) => void;
  recordGameResult: (won: boolean, tichuDeclared: boolean, tichuSucceeded: boolean) => void;
  checkAttendance: () => boolean; // true if new attendance
  claimAttendance: () => number; // returns coins rewarded
  updateMissionProgress: (missionId: string, progress: number) => void;
  claimMission: (missionId: string) => number; // returns coins rewarded
  resetDailyMissions: () => void;
  buyItem: (item: ShopItem) => boolean; // returns success
  equipAvatar: (id: string) => void;
  equipCardBack: (id: string) => void;
  setNickname: (name: string) => void;
  setSetting: (key: 'soundOn' | 'musicOn' | 'ttsOn' | 'notifyOn' | 'friendNotify' | 'gameNotify', value: boolean) => void;
  setPlayerId: (id: string) => void;
  isGuest: () => boolean;
  applyServerRewards: (xp: number, coins: number, won: boolean, tichuSuccess: boolean) => void;
  syncFromServer: (data: { coins: number; xp: number; totalGames: number; wins: number; losses: number; tichuSuccess: number; winStreak: number }) => void;
}

// MMKV (모바일) 또는 localStorage (웹) 사용
let storage: any = null;
if (Platform.OS !== 'web') {
  try {
    const { MMKV } = require('react-native-mmkv');
    storage = new MMKV();
  } catch { /* */ }
} else {
  // 웹: localStorage 래퍼
  storage = {
    getString: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (key: string, val: string) => { try { localStorage.setItem(key, val); } catch {} },
  };
}

function loadState(): Partial<UserState> {
  if (!storage) return {};
  try {
    const json = storage.getString('userStore');
    return json ? JSON.parse(json) : {};
  } catch { return {}; }
}

function saveState(state: Partial<UserState>) {
  if (!storage) return;
  try {
    const { addCoins, addXp, recordGameResult, checkAttendance, claimAttendance, updateMissionProgress, claimMission, resetDailyMissions, buyItem, equipAvatar, equipCardBack, setNickname, setSetting, setPlayerId, isGuest, ...data } = state as any;
    storage.set('userStore', JSON.stringify(data));
  } catch { /* */ }
}

const saved = loadState();
const today = new Date().toISOString().slice(0, 10);

const generatePlayerId = () => `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const useUserStore = create<UserState>((set, get) => ({
  playerId: saved.playerId ?? generatePlayerId(),
  coins: saved.coins ?? 500,
  xp: saved.xp ?? 0,
  nickname: saved.nickname ?? '',
  totalGames: saved.totalGames ?? 0,
  wins: saved.wins ?? 0,
  losses: saved.losses ?? 0,
  tichuSuccess: saved.tichuSuccess ?? 0,
  tichuFail: saved.tichuFail ?? 0,
  winStreak: saved.winStreak ?? 0,
  attendanceStreak: saved.attendanceStreak ?? 0,
  lastAttendanceDate: saved.lastAttendanceDate ?? '',
  missions: saved.lastMissionDate === today ? (saved.missions ?? createDailyMissions()) : createDailyMissions(),
  lastMissionDate: saved.lastMissionDate ?? '',
  ownedAvatars: saved.ownedAvatars ?? ['dragon'],
  ownedCardBacks: saved.ownedCardBacks ?? ['classic'],
  equippedAvatar: saved.equippedAvatar ?? 'dragon',
  equippedCardBack: saved.equippedCardBack ?? 'classic',
  soundOn: saved.soundOn ?? true,
  musicOn: saved.musicOn ?? true,
  ttsOn: saved.ttsOn ?? true,
  notifyOn: saved.notifyOn ?? true,
  friendNotify: saved.friendNotify ?? true,
  gameNotify: saved.gameNotify ?? true,

  addCoins: (amount) => set(s => { const ns = { ...s, coins: s.coins + amount }; saveState(ns); return ns; }),
  addXp: (amount) => set(s => { const ns = { ...s, xp: s.xp + amount }; saveState(ns); return ns; }),

  recordGameResult: (won, tichuDeclared, tichuSucceeded) => set(s => {
    const ns = {
      ...s,
      totalGames: s.totalGames + 1,
      wins: s.wins + (won ? 1 : 0),
      losses: s.losses + (won ? 0 : 1),
      winStreak: won ? s.winStreak + 1 : 0,
      tichuSuccess: s.tichuSuccess + (tichuDeclared && tichuSucceeded ? 1 : 0),
      tichuFail: s.tichuFail + (tichuDeclared && !tichuSucceeded ? 1 : 0),
      coins: s.coins + (won ? 50 : 20) + (tichuDeclared && tichuSucceeded ? 10 : 0),
      xp: s.xp + (won ? 30 : 10),
    };
    // 미션 업데이트
    const missions = [...ns.missions];
    const playMission = missions.find(m => m.id === 'play3');
    if (playMission && !playMission.claimed) { playMission.progress = Math.min(playMission.target, playMission.progress + 1); playMission.completed = playMission.progress >= playMission.target; }
    const tichuMission = missions.find(m => m.id === 'tichu1');
    if (tichuMission && !tichuMission.claimed && tichuDeclared && tichuSucceeded) { tichuMission.progress = 1; tichuMission.completed = true; }
    const winMission = missions.find(m => m.id === 'win2');
    if (winMission && !winMission.claimed) {
      if (won) { winMission.progress = Math.min(winMission.target, winMission.progress + 1); winMission.completed = winMission.progress >= winMission.target; }
      else { winMission.progress = 0; }
    }
    ns.missions = missions;
    saveState(ns);
    return ns;
  }),

  checkAttendance: () => {
    const s = get();
    return s.lastAttendanceDate !== today;
  },

  claimAttendance: () => {
    const s = get();
    if (s.lastAttendanceDate === today) return 0;
    const isConsecutive = isYesterday(s.lastAttendanceDate);
    const newStreak = isConsecutive ? s.attendanceStreak + 1 : 1;
    const reward = newStreak >= 7 ? 100 : 50;
    const ns = {
      ...s,
      lastAttendanceDate: today,
      attendanceStreak: newStreak >= 7 ? 0 : newStreak, // 7일 달성 시 리셋
      coins: s.coins + reward,
    };
    set(ns);
    saveState(ns);
    return reward;
  },

  updateMissionProgress: (missionId, progress) => set(s => {
    const missions = s.missions.map(m => m.id === missionId ? { ...m, progress, completed: progress >= m.target } : m);
    const ns = { ...s, missions, lastMissionDate: today };
    saveState(ns);
    return ns;
  }),

  claimMission: (missionId) => {
    const s = get();
    const mission = s.missions.find(m => m.id === missionId);
    if (!mission || !mission.completed || mission.claimed) return 0;
    const missions = s.missions.map(m => m.id === missionId ? { ...m, claimed: true } : m);
    const ns = { ...s, missions, coins: s.coins + mission.reward, lastMissionDate: today };
    set(ns);
    saveState(ns);
    return mission.reward;
  },

  resetDailyMissions: () => set(s => {
    if (s.lastMissionDate === today) return s;
    const ns = { ...s, missions: createDailyMissions(), lastMissionDate: today };
    saveState(ns);
    return ns;
  }),

  buyItem: (item) => {
    const s = get();
    if (s.coins < item.price) return false;
    const owned = item.category === 'avatar' ? s.ownedAvatars : s.ownedCardBacks;
    if (owned.includes(item.id)) return false;
    const ns = {
      ...s,
      coins: s.coins - item.price,
      ...(item.category === 'avatar'
        ? { ownedAvatars: [...s.ownedAvatars, item.id] }
        : { ownedCardBacks: [...s.ownedCardBacks, item.id] }),
    };
    set(ns);
    saveState(ns);
    return true;
  },

  equipAvatar: (id) => set(s => { const ns = { ...s, equippedAvatar: id }; saveState(ns); return ns; }),
  equipCardBack: (id) => set(s => { const ns = { ...s, equippedCardBack: id }; saveState(ns); return ns; }),
  setNickname: (name) => set(s => { const ns = { ...s, nickname: name }; saveState(ns); return ns; }),
  setSetting: (key, value) => {
    if (key === 'ttsOn') {
      try { const { setTtsEnabled } = require('../utils/sound'); setTtsEnabled(value); } catch {}
    }
    if (key === 'musicOn') {
      try { const { setBgmEnabled } = require('../utils/bgm'); setBgmEnabled(value); } catch {}
    }
    set(s => { const ns = { ...s, [key]: value }; saveState(ns); return ns; });
  },
  setPlayerId: (id) => set(s => { const ns = { ...s, playerId: id }; saveState(ns); return ns; }),
  isGuest: () => get().playerId.startsWith('guest_'),

  // 서버에서 보상 수신 시 로컬 스토어 업데이트
  applyServerRewards: (xp, coins, won, tichuSuccess) => set(s => {
    const ns = {
      ...s,
      xp: s.xp + xp,
      coins: s.coins + coins,
      totalGames: s.totalGames + 1,
      wins: s.wins + (won ? 1 : 0),
      losses: s.losses + (won ? 0 : 1),
      winStreak: won ? s.winStreak + 1 : 0,
      tichuSuccess: s.tichuSuccess + (tichuSuccess ? 1 : 0),
    };
    // 미션 업데이트
    const missions = [...ns.missions];
    const playMission = missions.find(m => m.id === 'play3');
    if (playMission && !playMission.claimed) { playMission.progress = Math.min(playMission.target, playMission.progress + 1); playMission.completed = playMission.progress >= playMission.target; }
    const winMission = missions.find(m => m.id === 'win2');
    if (winMission && !winMission.claimed && won) { winMission.progress = Math.min(winMission.target, winMission.progress + 1); winMission.completed = winMission.progress >= winMission.target; }
    const tichuMission = missions.find(m => m.id === 'tichu1');
    if (tichuMission && !tichuMission.claimed && tichuSuccess) { tichuMission.progress = 1; tichuMission.completed = true; }
    ns.missions = missions;
    saveState(ns);
    return ns;
  }),

  // 로그인 시 서버 DB 데이터로 동기화
  syncFromServer: (data) => set(s => {
    const ns = {
      ...s,
      coins: data.coins,
      xp: data.xp,
      totalGames: data.totalGames,
      wins: data.wins,
      losses: data.losses,
      tichuSuccess: data.tichuSuccess,
      winStreak: data.winStreak,
    };
    saveState(ns);
    return ns;
  }),
}));

// 앱 시작 시 저장된 TTS 설정 반영
try {
  const { setTtsEnabled } = require('../utils/sound');
  setTtsEnabled(useUserStore.getState().ttsOn);
} catch {}

function isYesterday(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return d.toISOString().slice(0, 10) === y.toISOString().slice(0, 10);
}
