/**
 * BGM 재생 관리 (HTML5 Audio API)
 * - 로비 / 게임 중 두 가지 트랙
 * - 루프 재생, 페이드 인/아웃 전환
 * - musicOn 설정 연동
 */

// @ts-ignore — metro/webpack이 mp3 파일을 URL로 resolve
import lobbyMp3 from '../../assets/hitslab-exciting-upbeat-background-music-300654.mp3';
// @ts-ignore
import gameMp3 from '../../assets/hitslab-game-gaming-video-game-music-459876.mp3';

export type BgmTrack = 'lobby' | 'game' | 'none';

let currentTrack: BgmTrack = 'none';
let lobbyAudio: HTMLAudioElement | null = null;
let gameAudio: HTMLAudioElement | null = null;
let bgmVolume = 0.3;
let enabled = true;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function getAudio(track: BgmTrack): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  if (track === 'lobby') {
    if (!lobbyAudio) {
      lobbyAudio = new Audio(lobbyMp3);
      lobbyAudio.loop = true;
      lobbyAudio.volume = 0;
    }
    return lobbyAudio;
  }
  if (track === 'game') {
    if (!gameAudio) {
      gameAudio = new Audio(gameMp3);
      gameAudio.loop = true;
      gameAudio.volume = 0;
    }
    return gameAudio;
  }
  return null;
}

function fadeIn(audio: HTMLAudioElement, targetVol: number, durationMs = 800) {
  const steps = 20;
  const stepMs = durationMs / steps;
  const stepVol = targetVol / steps;
  let vol = 0;
  audio.volume = 0;

  const timer = setInterval(() => {
    vol = Math.min(vol + stepVol, targetVol);
    audio.volume = vol;
    if (vol >= targetVol) clearInterval(timer);
  }, stepMs);
}

function fadeOut(audio: HTMLAudioElement, durationMs = 600): Promise<void> {
  return new Promise((resolve) => {
    const steps = 15;
    const stepMs = durationMs / steps;
    let vol = audio.volume;
    const stepVol = vol / steps;

    const timer = setInterval(() => {
      vol = Math.max(vol - stepVol, 0);
      audio.volume = vol;
      if (vol <= 0) {
        clearInterval(timer);
        audio.pause();
        audio.currentTime = 0;
        resolve();
      }
    }, stepMs);
  });
}

export function setBgmEnabled(on: boolean) {
  enabled = on;
  if (!on) {
    stopAll();
  } else if (currentTrack !== 'none') {
    playBgm(currentTrack);
  }
}

export function setBgmVolume(vol: number) {
  bgmVolume = Math.max(0, Math.min(1, vol));
  if (lobbyAudio && !lobbyAudio.paused) lobbyAudio.volume = bgmVolume;
  if (gameAudio && !gameAudio.paused) gameAudio.volume = bgmVolume;
}

export async function playBgm(track: BgmTrack) {
  if (track === 'none') {
    stopAll();
    currentTrack = 'none';
    return;
  }

  // 같은 트랙이 이미 재생 중이면 무시
  const targetAudio = getAudio(track);
  if (!targetAudio) return;

  if (currentTrack === track && !targetAudio.paused) return;

  // 이전 트랙 페이드 아웃
  const prevAudio = getAudio(currentTrack);
  if (prevAudio && !prevAudio.paused) {
    await fadeOut(prevAudio);
  }

  currentTrack = track;

  if (!enabled) return;

  // 새 트랙 페이드 인
  try {
    await targetAudio.play();
    fadeIn(targetAudio, bgmVolume);
  } catch {
    // 브라우저가 자동 재생 차단 시 — 첫 사용자 인터랙션 후 재시도
  }
}

export function stopAll() {
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
  if (lobbyAudio && !lobbyAudio.paused) {
    lobbyAudio.pause();
    lobbyAudio.currentTime = 0;
    lobbyAudio.volume = 0;
  }
  if (gameAudio && !gameAudio.paused) {
    gameAudio.pause();
    gameAudio.currentTime = 0;
    gameAudio.volume = 0;
  }
}

export function getCurrentTrack(): BgmTrack { return currentTrack; }
