import { create } from 'zustand';
import { Platform } from 'react-native';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  requirement: number;
  progress: number;
  unlocked: boolean;
  reward: { coins: number; avatar?: string; border?: string };
  category: 'game' | 'tichu' | 'bomb' | 'special';
}

const ACHIEVEMENTS_DEF: Omit<Achievement, 'progress' | 'unlocked'>[] = [
  // 게임
  { id: 'first_win', name: '첫 승리', desc: '첫 번째 게임에서 승리', icon: '🏆', requirement: 1, reward: { coins: 100 }, category: 'game' },
  { id: 'win10', name: '10승 달성', desc: '10번 승리하기', icon: '⭐', requirement: 10, reward: { coins: 200 }, category: 'game' },
  { id: 'win50', name: '50승 달성', desc: '50번 승리하기', icon: '🌟', requirement: 50, reward: { coins: 500, avatar: 'phoenix' }, category: 'game' },
  { id: 'win100', name: '100승 전설', desc: '100번 승리하기', icon: '👑', requirement: 100, reward: { coins: 1000, border: 'gold' }, category: 'game' },
  { id: 'streak3', name: '3연승', desc: '3연속 승리', icon: '🔥', requirement: 3, reward: { coins: 150 }, category: 'game' },
  { id: 'streak5', name: '5연승 불꽃', desc: '5연속 승리', icon: '💥', requirement: 5, reward: { coins: 300 }, category: 'game' },
  { id: 'streak10', name: '10연승 전설', desc: '10연속 승리', icon: '🌈', requirement: 10, reward: { coins: 800, border: 'flame' }, category: 'game' },
  { id: 'games10', name: '10판 플레이', desc: '10판 게임 참여', icon: '🎮', requirement: 10, reward: { coins: 100 }, category: 'game' },
  { id: 'games50', name: '50판 베테랑', desc: '50판 게임 참여', icon: '🎯', requirement: 50, reward: { coins: 300 }, category: 'game' },
  { id: 'games100', name: '100판 마스터', desc: '100판 게임 참여', icon: '💎', requirement: 100, reward: { coins: 500 }, category: 'game' },

  // 티츄
  { id: 'tichu1', name: '첫 티츄 성공', desc: '첫 번째 티츄 성공', icon: '🎯', requirement: 1, reward: { coins: 100 }, category: 'tichu' },
  { id: 'tichu5', name: '티츄 5회 성공', desc: '티츄 5번 성공', icon: '🏅', requirement: 5, reward: { coins: 300 }, category: 'tichu' },
  { id: 'tichu20', name: '티츄 마스터', desc: '티츄 20번 성공', icon: '🔥', requirement: 20, reward: { coins: 800, avatar: 'unicorn' }, category: 'tichu' },

  // 폭탄
  { id: 'bomb1', name: '첫 폭탄', desc: '첫 번째 폭탄 사용', icon: '💣', requirement: 1, reward: { coins: 50 }, category: 'bomb' },
  { id: 'bomb10', name: '폭탄 전문가', desc: '10번 폭탄 사용', icon: '🧨', requirement: 10, reward: { coins: 200 }, category: 'bomb' },
  { id: 'bomb_sf', name: 'SF 폭탄!', desc: '스트레이트 플러시 폭탄 사용', icon: '⚡', requirement: 1, reward: { coins: 300 }, category: 'bomb' },

  // 특별
  { id: 'onetwo', name: '원투 피니시', desc: '원투 피니시 달성', icon: '🎉', requirement: 1, reward: { coins: 200 }, category: 'special' },
  { id: 'onetwo5', name: '원투 5회', desc: '원투 피니시 5번 달성', icon: '🤝', requirement: 5, reward: { coins: 500 }, category: 'special' },
  { id: 'dragon_steal', name: '용 뺏기', desc: '폭탄으로 용 트릭 뺏기', icon: '🐉', requirement: 1, reward: { coins: 200 }, category: 'special' },
];

interface AchievementState {
  achievements: Achievement[];
  recentUnlock: Achievement | null;
  clearRecent: () => void;
  checkProgress: (stat: string, value: number) => Achievement | null; // returns newly unlocked
}

let storage: any = null;
if (Platform.OS !== 'web') {
  try { const { MMKV } = require('react-native-mmkv'); storage = new MMKV(); } catch {}
}

function loadAchievements(): Achievement[] {
  if (storage) {
    try {
      const json = storage.getString('achievements');
      if (json) return JSON.parse(json);
    } catch {}
  }
  return ACHIEVEMENTS_DEF.map(a => ({ ...a, progress: 0, unlocked: false }));
}

function saveAchievements(list: Achievement[]) {
  if (!storage) return;
  try { storage.set('achievements', JSON.stringify(list)); } catch {}
}

export const useAchievementStore = create<AchievementState>((set, get) => ({
  achievements: loadAchievements(),
  recentUnlock: null,

  clearRecent: () => set({ recentUnlock: null }),

  checkProgress: (stat, value) => {
    const mapping: Record<string, string[]> = {
      wins: ['first_win', 'win10', 'win50', 'win100'],
      winStreak: ['streak3', 'streak5', 'streak10'],
      totalGames: ['games10', 'games50', 'games100'],
      tichuSuccess: ['tichu1', 'tichu5', 'tichu20'],
      bombUsed: ['bomb1', 'bomb10'],
      bombSF: ['bomb_sf'],
      oneTwoFinish: ['onetwo', 'onetwo5'],
      dragonSteal: ['dragon_steal'],
    };

    const ids = mapping[stat] ?? [];
    const achievements = [...get().achievements];
    let newUnlock: Achievement | null = null;

    for (const id of ids) {
      const ach = achievements.find(a => a.id === id);
      if (!ach || ach.unlocked) continue;
      ach.progress = Math.min(ach.requirement, value);
      if (ach.progress >= ach.requirement) {
        ach.unlocked = true;
        newUnlock = ach;
      }
    }

    saveAchievements(achievements);
    set({ achievements, ...(newUnlock ? { recentUnlock: newUnlock } : {}) });
    return newUnlock;
  },
}));
