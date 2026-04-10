/**
 * BGM 재생 관리 (HTML5 Audio API)
 * - 로비 / 게임 중 두 가지 트랙
 * - 루프 재생, 페이드 인/아웃 전환
 * - musicOn 설정 연동
 * - public/audio/ 폴더의 파일을 직접 참조 (Metro 번들러 호환)
 */

export type BgmTrack = 'lobby' | 'game' | 'none';

const TRACK_URLS: Record<Exclude<BgmTrack, 'none'>, string> = {
  lobby: '/audio/lobby.mp3',
  game: '/audio/game.mp3',
};

let currentTrack: BgmTrack = 'none';
let lobbyAudio: HTMLAudioElement | null = null;
let gameAudio: HTMLAudioElement | null = null;
let bgmVolume = 0.3;
let enabled = true;
let userInteracted = false;
let pendingTrack: BgmTrack = 'none';

// 브라우저 자동 재생 차단 대응: 첫 클릭 시 보류된 BGM 재생
function setupInteractionListener() {
  if (typeof window === 'undefined') return;
  const handler = () => {
    userInteracted = true;
    if (pendingTrack !== 'none' && enabled) {
      playBgm(pendingTrack);
    }
    window.removeEventListener('click', handler);
    window.removeEventListener('touchstart', handler);
    window.removeEventListener('keydown', handler);
  };
  window.addEventListener('click', handler, { once: true });
  window.addEventListener('touchstart', handler, { once: true });
  window.addEventListener('keydown', handler, { once: true });
}
setupInteractionListener();

function getAudio(track: BgmTrack): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

  if (track === 'lobby') {
    if (!lobbyAudio) {
      lobbyAudio = new Audio(TRACK_URLS.lobby);
      lobbyAudio.loop = true;
      lobbyAudio.volume = 0;
      lobbyAudio.preload = 'auto';
    }
    return lobbyAudio;
  }
  if (track === 'game') {
    if (!gameAudio) {
      gameAudio = new Audio(TRACK_URLS.game);
      gameAudio.loop = true;
      gameAudio.volume = 0;
      gameAudio.preload = 'auto';
    }
    return gameAudio;
  }
  return null;
}

let fadeInTimer: ReturnType<typeof setInterval> | null = null;
let fadeOutTimer: ReturnType<typeof setInterval> | null = null;

function cancelFades() {
  if (fadeInTimer) { clearInterval(fadeInTimer); fadeInTimer = null; }
  if (fadeOutTimer) { clearInterval(fadeOutTimer); fadeOutTimer = null; }
}

function fadeIn(audio: HTMLAudioElement, targetVol: number, durationMs = 800) {
  cancelFades();
  const steps = 20;
  const stepMs = durationMs / steps;
  const stepVol = targetVol / steps;
  let vol = 0;
  audio.volume = 0;

  fadeInTimer = setInterval(() => {
    vol = Math.min(vol + stepVol, targetVol);
    try { audio.volume = vol; } catch {}
    if (vol >= targetVol) {
      if (fadeInTimer) { clearInterval(fadeInTimer); fadeInTimer = null; }
    }
  }, stepMs);
}

function fadeOut(audio: HTMLAudioElement, durationMs = 600): Promise<void> {
  return new Promise((resolve) => {
    if (audio.paused) { resolve(); return; }
    cancelFades();
    const steps = 15;
    const stepMs = durationMs / steps;
    let vol = audio.volume;
    if (vol <= 0) { audio.pause(); resolve(); return; }
    const stepVol = vol / steps;

    fadeOutTimer = setInterval(() => {
      vol = Math.max(vol - stepVol, 0);
      try { audio.volume = vol; } catch {}
      if (vol <= 0) {
        if (fadeOutTimer) { clearInterval(fadeOutTimer); fadeOutTimer = null; }
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
    pendingTrack = 'none';
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
  pendingTrack = track;

  if (!enabled) return;

  // 새 트랙 페이드 인
  try {
    await targetAudio.play();
    fadeIn(targetAudio, bgmVolume);
  } catch (err) {
    // 브라우저 자동 재생 차단 — 첫 인터랙션 후 재시도됨
    pendingTrack = track;
  }
}

export function stopAll() {
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
