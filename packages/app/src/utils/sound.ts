// Sound effects using Web Audio API (works on web without audio files)

let audioCtx: AudioContext | null = null;
const pendingTimers: ReturnType<typeof setTimeout>[] = [];
let muted = false;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function sfxTimeout(fn: () => void, ms: number) {
  const id = setTimeout(() => {
    const idx = pendingTimers.indexOf(id);
    if (idx >= 0) pendingTimers.splice(idx, 1);
    if (!muted) fn();
  }, ms);
  pendingTimers.push(id);
}

/** 보류 중인 모든 효과음 타이머 취소 + TTS 중단 + 음소거 */
export function cancelAllSounds() {
  muted = true;
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers.length = 0;
  try {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch {}
}

/** 음소거 해제 (게임 입장 시 호출) */
export function unmuteSounds() {
  muted = false;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (muted) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // AudioContext may not be available on all platforms
  }
}

function playChord(freqs: number[], duration: number, type: OscillatorType = 'sine', volume = 0.08) {
  freqs.forEach(f => playTone(f, duration, type, volume));
}

export const SFX = {
  cardPlay: () => playTone(600, 0.1, 'sine', 0.1),
  pass: () => playTone(300, 0.15, 'triangle', 0.05),

  trickWon: () => {
    playTone(523, 0.12, 'sine', 0.1);
    sfxTimeout(() => playTone(659, 0.12, 'sine', 0.1), 120);
    sfxTimeout(() => playTone(784, 0.2, 'sine', 0.1), 240);
  },

  // 폭탄 — 저음 충격 + 잔향
  bomb: () => {
    playTone(80, 0.5, 'sawtooth', 0.2);
    playTone(120, 0.4, 'square', 0.12);
    sfxTimeout(() => playTone(60, 0.6, 'sawtooth', 0.1), 100);
    sfxTimeout(() => playTone(200, 0.15, 'sine', 0.08), 200);
  },

  // 티츄 선언 — 팡파르
  tichu: () => {
    playTone(523, 0.1, 'square', 0.1);
    sfxTimeout(() => playTone(659, 0.1, 'square', 0.1), 100);
    sfxTimeout(() => playTone(784, 0.15, 'square', 0.1), 200);
    sfxTimeout(() => playChord([784, 988, 1175], 0.3, 'sine', 0.06), 320);
  },

  // 티츄 성공 — 영웅 팡파르
  tichuSuccess: () => {
    playChord([523, 659, 784], 0.15, 'sine', 0.08);
    sfxTimeout(() => playChord([659, 784, 988], 0.15, 'sine', 0.08), 200);
    sfxTimeout(() => playChord([784, 988, 1319], 0.4, 'sine', 0.1), 400);
  },

  myTurn: () => playTone(880, 0.08, 'sine', 0.06),

  // 라운드 종료
  roundEnd: () => {
    playTone(523, 0.2, 'sine', 0.1);
    sfxTimeout(() => playTone(392, 0.3, 'sine', 0.1), 200);
  },

  // 승리 — 화려한 팡파르
  victory: () => {
    playChord([523, 659, 784], 0.2, 'sine', 0.08);
    sfxTimeout(() => playChord([587, 740, 880], 0.2, 'sine', 0.08), 250);
    sfxTimeout(() => playChord([659, 784, 988], 0.15, 'sine', 0.08), 500);
    sfxTimeout(() => playChord([784, 988, 1319], 0.5, 'sine', 0.1), 700);
  },

  // 패배
  defeat: () => {
    playTone(392, 0.3, 'sine', 0.08);
    sfxTimeout(() => playTone(349, 0.3, 'sine', 0.08), 300);
    sfxTimeout(() => playTone(330, 0.5, 'sine', 0.06), 600);
  },

  // 원투 피니시
  oneTwoFinish: () => {
    playChord([523, 784, 1047], 0.15, 'sine', 0.1);
    sfxTimeout(() => playChord([659, 988, 1319], 0.15, 'sine', 0.1), 150);
    sfxTimeout(() => playChord([784, 1175, 1568], 0.3, 'sine', 0.12), 300);
    sfxTimeout(() => playChord([1047, 1319, 1568], 0.5, 'sine', 0.1), 500);
  },

  // 마지막 카드
  lastCard: () => {
    playTone(880, 0.08, 'sine', 0.1);
    sfxTimeout(() => playTone(1047, 0.08, 'sine', 0.1), 80);
    sfxTimeout(() => playTone(1319, 0.15, 'sine', 0.12), 160);
  },

  // 코인 획득
  coinEarn: () => {
    playTone(1200, 0.05, 'sine', 0.06);
    sfxTimeout(() => playTone(1400, 0.05, 'sine', 0.06), 60);
    sfxTimeout(() => playTone(1600, 0.08, 'sine', 0.08), 120);
  },

  // 업적 달성
  achievement: () => {
    playChord([784, 988], 0.1, 'sine', 0.08);
    sfxTimeout(() => playChord([988, 1319], 0.1, 'sine', 0.08), 150);
    sfxTimeout(() => playChord([1319, 1568], 0.3, 'sine', 0.1), 300);
  },
};

// ── TTS (Text-to-Speech) ──────────────────────────────────

let ttsEnabled = true;
let bestVoice: SpeechSynthesisVoice | null = null;

export function setTtsEnabled(on: boolean) { ttsEnabled = on; }
export function isTtsEnabled() { return ttsEnabled; }

// 플랫폼 감지
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

// 가장 자연스러운 한국어 음성 찾기 (플랫폼별 우선순위)
function findBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  const koVoices = voices.filter(v => v.lang.startsWith('ko'));
  if (koVoices.length === 0) return null;

  // iOS: Yuna(향상됨) > Yuna > 기타 한국어
  if (isIOS) {
    const yunaEnhanced = koVoices.find(v => v.name.includes('Yuna') && v.name.includes('Enhanced'));
    if (yunaEnhanced) return yunaEnhanced;
    const yuna = koVoices.find(v => v.name.includes('Yuna'));
    if (yuna) return yuna;
    return koVoices[0]!;
  }

  // Android/PC: Google 한국어 > Microsoft Heami > 기타
  const google = koVoices.find(v => v.name.toLowerCase().includes('google'));
  if (google) return google;
  const ms = koVoices.find(v => v.name.toLowerCase().includes('heami'));
  if (ms) return ms;
  return koVoices[0]!;
}

// 음성 로드 (비동기 — 모바일에서 지연 로드될 수 있음)
let ttsUnlocked = false;

function initVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  bestVoice = findBestVoice();
  window.speechSynthesis.onvoiceschanged = () => { bestVoice = findBestVoice(); };
  // 일부 모바일 브라우저에서 onvoiceschanged가 안 올 수 있으므로 폴링
  if (!bestVoice) {
    let retries = 0;
    const poll = setInterval(() => {
      bestVoice = findBestVoice();
      retries++;
      if (bestVoice || retries >= 10) clearInterval(poll);
    }, 200);
  }
}
initVoices();

// iOS Safari: 사용자 터치 이벤트 안에서 한 번 speak()을 호출해야 이후 자동 재생 가능
function unlockTts() {
  if (ttsUnlocked) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    u.lang = 'ko-KR';
    window.speechSynthesis.speak(u);
    ttsUnlocked = true;
  } catch {}
}

if (typeof window !== 'undefined') {
  const onInteract = () => {
    unlockTts();
    // AudioContext도 함께 해제
    try { getCtx().resume(); } catch {}
    window.removeEventListener('touchstart', onInteract);
    window.removeEventListener('click', onInteract);
  };
  window.addEventListener('touchstart', onInteract, { once: true });
  window.addEventListener('click', onInteract, { once: true });
}

type TtsStyle = 'normal' | 'excited' | 'calm' | 'urgent';

// 플랫폼별 rate/pitch 보정값 (Google 한국어 기준에 맞춤)
// iOS Yuna는 기본 속도가 빠르고 톤이 높아서 낮춰서 보정
const VOICE_STYLES: Record<TtsStyle, { rate: number; pitch: number }> = isIOS
  ? { normal: { rate: 0.95, pitch: 1.0 }, excited: { rate: 1.15, pitch: 1.15 }, calm: { rate: 0.85, pitch: 0.85 }, urgent: { rate: 1.3, pitch: 1.2 } }
  : { normal: { rate: 1.1, pitch: 1.1 }, excited: { rate: 1.3, pitch: 1.3 }, calm: { rate: 1.0, pitch: 0.9 }, urgent: { rate: 1.5, pitch: 1.4 } };

function speak(text: string, style: TtsStyle = 'normal') {
  if (!ttsEnabled || muted) return;
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    if (bestVoice) u.voice = bestVoice;
    u.volume = 0.8;
    const vs = VOICE_STYLES[style];
    u.rate = vs.rate;
    u.pitch = vs.pitch;
    window.speechSynthesis.speak(u);
  } catch {}
}

function handTypeToKorean(type: string): string {
  switch (type) {
    case 'single': return '';
    case 'pair': return '페어';
    case 'steps': return '연속페어';
    case 'triple': return '트리플';
    case 'fullhouse': return '풀하우스';
    case 'straight': return '스트레이트';
    case 'four_bomb': return '';
    case 'straight_flush_bomb': return '';
    default: return '';
  }
}

function valueToKorean(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v) || v === 999) return '용';
  if (v === 0) return '개';
  if (v === 1) return '참새';
  if (v % 1 !== 0) return '봉황';
  switch (v) {
    case 11: return '잭';
    case 12: return '퀸';
    case 13: return '킹';
    case 14: return '에이스';
    default: return String(v);
  }
}

export const TTS = {
  cardPlayed: (value: number | null | undefined, type: string) => {
    if (type === 'four_bomb' || type === 'straight_flush_bomb') {
      speak('폭탄!', 'excited');
      return;
    }
    const typeName = handTypeToKorean(type);
    const valueName = valueToKorean(value);
    if (typeName) {
      speak(`${valueName} ${typeName}`, 'normal');
    } else {
      speak(valueName, 'normal');
    }
  },
  pass: () => speak('패스', 'calm'),
  myTurn: () => speak('내 차례!', 'excited'),
  tichu: (name: string, type: 'large' | 'small') => {
    speak(type === 'large' ? `${name} 라지티츄!` : `${name} 스몰티츄!`, 'excited');
  },
  playerFinished: (name: string, rank: number) => {
    speak(`${name} ${rank}등!`, rank === 1 ? 'excited' : 'normal');
  },
  wishActive: (rank: string) => speak(`소원 ${rank}!`, 'normal'),
  roundResult: (myTeamPoints: number, won: boolean) => {
    speak(won ? `라운드 승리! ${myTeamPoints}점!` : `라운드 종료, ${myTeamPoints}점`, won ? 'excited' : 'calm');
  },
  gameOver: (won: boolean) => {
    speak(won ? '게임 승리!' : '게임 종료', won ? 'excited' : 'calm');
  },
  oneTwoFinish: () => speak('원투 피니시!', 'excited'),
};
