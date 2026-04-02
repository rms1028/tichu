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
