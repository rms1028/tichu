// Sound effects using Web Audio API (works on web without audio files)

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
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
    setTimeout(() => playTone(659, 0.12, 'sine', 0.1), 120);
    setTimeout(() => playTone(784, 0.2, 'sine', 0.1), 240);
  },

  // 폭탄 — 저음 충격 + 잔향
  bomb: () => {
    playTone(80, 0.5, 'sawtooth', 0.2);
    playTone(120, 0.4, 'square', 0.12);
    setTimeout(() => playTone(60, 0.6, 'sawtooth', 0.1), 100);
    setTimeout(() => playTone(200, 0.15, 'sine', 0.08), 200);
  },

  // 티츄 선언 — 팡파르
  tichu: () => {
    playTone(523, 0.1, 'square', 0.1);
    setTimeout(() => playTone(659, 0.1, 'square', 0.1), 100);
    setTimeout(() => playTone(784, 0.15, 'square', 0.1), 200);
    setTimeout(() => playChord([784, 988, 1175], 0.3, 'sine', 0.06), 320);
  },

  // 티츄 성공 — 영웅 팡파르
  tichuSuccess: () => {
    playChord([523, 659, 784], 0.15, 'sine', 0.08);
    setTimeout(() => playChord([659, 784, 988], 0.15, 'sine', 0.08), 200);
    setTimeout(() => playChord([784, 988, 1319], 0.4, 'sine', 0.1), 400);
  },

  myTurn: () => playTone(880, 0.08, 'sine', 0.06),

  // 라운드 종료
  roundEnd: () => {
    playTone(523, 0.2, 'sine', 0.1);
    setTimeout(() => playTone(392, 0.3, 'sine', 0.1), 200);
  },

  // 승리 — 화려한 팡파르
  victory: () => {
    playChord([523, 659, 784], 0.2, 'sine', 0.08);
    setTimeout(() => playChord([587, 740, 880], 0.2, 'sine', 0.08), 250);
    setTimeout(() => playChord([659, 784, 988], 0.15, 'sine', 0.08), 500);
    setTimeout(() => playChord([784, 988, 1319], 0.5, 'sine', 0.1), 700);
  },

  // 패배
  defeat: () => {
    playTone(392, 0.3, 'sine', 0.08);
    setTimeout(() => playTone(349, 0.3, 'sine', 0.08), 300);
    setTimeout(() => playTone(330, 0.5, 'sine', 0.06), 600);
  },

  // 원투 피니시
  oneTwoFinish: () => {
    playChord([523, 784, 1047], 0.15, 'sine', 0.1);
    setTimeout(() => playChord([659, 988, 1319], 0.15, 'sine', 0.1), 150);
    setTimeout(() => playChord([784, 1175, 1568], 0.3, 'sine', 0.12), 300);
    setTimeout(() => playChord([1047, 1319, 1568], 0.5, 'sine', 0.1), 500);
  },

  // 마지막 카드
  lastCard: () => {
    playTone(880, 0.08, 'sine', 0.1);
    setTimeout(() => playTone(1047, 0.08, 'sine', 0.1), 80);
    setTimeout(() => playTone(1319, 0.15, 'sine', 0.12), 160);
  },

  // 코인 획득
  coinEarn: () => {
    playTone(1200, 0.05, 'sine', 0.06);
    setTimeout(() => playTone(1400, 0.05, 'sine', 0.06), 60);
    setTimeout(() => playTone(1600, 0.08, 'sine', 0.08), 120);
  },

  // 업적 달성
  achievement: () => {
    playChord([784, 988], 0.1, 'sine', 0.08);
    setTimeout(() => playChord([988, 1319], 0.1, 'sine', 0.08), 150);
    setTimeout(() => playChord([1319, 1568], 0.3, 'sine', 0.1), 300);
  },
};

// ── TTS (Text-to-Speech) ──────────────────────────────────

let ttsEnabled = true;

export function setTtsEnabled(on: boolean) { ttsEnabled = on; }
export function isTtsEnabled() { return ttsEnabled; }

function speak(text: string) {
  if (!ttsEnabled) return;
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 1.2;
    u.volume = 0.7;
    u.pitch = 1.0;
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
    case 'four_bomb': return '폭탄!';
    case 'straight_flush_bomb': return '스트레이트 플러시 폭탄!';
    default: return '';
  }
}

function valueToKorean(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return '용';
  if (v % 1 !== 0) return String(Math.floor(v)); // 봉황
  switch (v) {
    case 1: return '참새';
    case 11: return '잭';
    case 12: return '퀸';
    case 13: return '킹';
    case 14: return '에이스';
    default: return String(v);
  }
}

export const TTS = {
  cardPlayed: (value: number | null | undefined, type: string) => {
    const typeName = handTypeToKorean(type);
    const valueName = valueToKorean(value);
    if (type === 'four_bomb' || type === 'straight_flush_bomb') {
      speak(typeName);
    } else if (typeName) {
      speak(`${valueName} ${typeName}`);
    } else {
      speak(valueName);
    }
  },
  pass: () => speak('패스'),
  myTurn: () => speak('내 차례'),
  trickWon: (name: string, points: number) => {
    speak(points > 0 ? `${name} 승리, ${points}점` : `${name} 승리`);
  },
  tichu: (name: string, type: 'large' | 'small') => {
    speak(type === 'large' ? `${name} 라지티츄!` : `${name} 스몰티츄!`);
  },
  playerFinished: (name: string, rank: number) => {
    const rankName = ['1', '2', '3', '4'][rank - 1] ?? String(rank);
    speak(`${name} ${rankName}등`);
  },
  wishActive: (rank: string) => speak(`소원: ${rank}`),
  wishFulfilled: () => speak('소원 해제'),
  roundResult: (myTeamPoints: number, won: boolean) => {
    speak(won ? `라운드 승리! ${myTeamPoints}점` : `라운드 종료, ${myTeamPoints}점`);
  },
  gameOver: (won: boolean) => {
    speak(won ? '게임 승리!' : '게임 종료');
  },
  oneTwoFinish: () => speak('원투 피니시!'),
};
