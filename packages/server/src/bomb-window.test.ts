import { describe, it, expect } from 'vitest';
import { normalCard, MAHJONG, DRAGON, PHOENIX } from '@tichu/shared';
import type { PlayedHand } from '@tichu/shared';
import { createGameRoom } from './game-room.js';
import { startBombWindow, submitBomb, resolveBombWindow } from './bomb-window.js';

const S = (r: Parameters<typeof normalCard>[1]) => normalCard('sword', r);
const T = (r: Parameters<typeof normalCard>[1]) => normalCard('star', r);
const J = (r: Parameters<typeof normalCard>[1]) => normalCard('jade', r);
const P = (r: Parameters<typeof normalCard>[1]) => normalCard('pagoda', r);

function setupBombTest() {
  const room = createGameRoom('bomb-test');
  room.phase = 'TRICK_PLAY';
  for (let s = 0; s < 4; s++) {
    room.players[s] = {
      playerId: `p${s}`, nickname: `P${s}`, socketId: `s${s}`,
      connected: true, isBot: false,
    };
  }

  const topPlay: PlayedHand = {
    type: 'single', cards: [S('K')], value: 13, length: 1,
  };

  // seat 0이 방금 카드를 냄
  room.hands = {
    0: [S('2')],
    1: [S('5'), T('5'), J('5'), P('5')], // 포카드 5
    2: [T('3')],
    3: [S('8'), T('8'), J('8'), P('8')], // 포카드 8
  };
  room.currentTrick = {
    leadSeat: 0,
    leadType: 'single',
    leadLength: 1,
    plays: [{ seat: 0, hand: topPlay }],
    consecutivePasses: 0,
    lastPlayedSeat: 0,
  };
  room.tableCards = topPlay;
  room.finishOrder = [];

  return { room, topPlay };
}

describe('bomb window', () => {
  it('BOMB_WINDOW 시작', () => {
    const { room, topPlay } = setupBombTest();
    const events = startBombWindow(room, 0, topPlay);

    expect(room.bombWindow).not.toBeNull();
    expect(room.bombWindow!.excludedSeat).toBe(0);
    expect(events[0]!.type).toBe('bomb_window_start');
  });

  it('폭탄 제출 성공', () => {
    const { room, topPlay } = setupBombTest();
    startBombWindow(room, 0, topPlay);

    // seat 1이 포카드 5 제출
    const bomb5 = [S('5'), T('5'), J('5'), P('5')];
    const r = submitBomb(room, 1, bomb5);
    expect(r.ok).toBe(true);
    expect(room.bombWindow!.pendingBombs.length).toBe(1);
  });

  it('excludedSeat도 폭탄 아닌 카드는 거부', () => {
    const { room, topPlay } = setupBombTest();
    startBombWindow(room, 0, topPlay);

    // seat 0 (excludedSeat)도 제출 가능하지만 1장은 폭탄이 아님
    const r = submitBomb(room, 0, [S('2')]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_a_bomb');
  });

  // Edge #29: 동시 복수 폭탄 → 최강만 적용
  it('복수 폭탄 → 최강만 적용, 나머지 복귀', () => {
    const { room, topPlay } = setupBombTest();
    startBombWindow(room, 0, topPlay);

    // seat 1: 포카드 5
    submitBomb(room, 1, [S('5'), T('5'), J('5'), P('5')]);
    // seat 3: 포카드 8 (더 강함)
    submitBomb(room, 3, [S('8'), T('8'), J('8'), P('8')]);

    expect(room.bombWindow!.pendingBombs.length).toBe(2);

    // 해소
    const events = resolveBombWindow(room);

    // seat 1의 카드 복귀
    expect(room.hands[1]!.length).toBe(4); // 원래 핸드로 복귀
    // seat 3의 카드는 사용됨
    expect(room.hands[3]!.length).toBe(0);

    // 바닥은 포카드 8
    expect(room.tableCards!.type).toBe('four_bomb');
    expect(room.tableCards!.value).toBe(8);
  });

  it('폭탄 없으면 정상 종료', () => {
    const { room, topPlay } = setupBombTest();
    startBombWindow(room, 0, topPlay);

    const events = resolveBombWindow(room);
    expect(room.bombWindow).toBeNull();
    expect(events.some(e => e.type === 'bomb_window_end')).toBe(true);
  });

  // Edge #33: 팀원에게 폭탄 허용
  it('팀원에게도 폭탄 가능 (팀 무관)', () => {
    const { room, topPlay } = setupBombTest();
    // seat 2는 seat 0의 파트너
    room.hands[2] = [S('7'), T('7'), J('7'), P('7')];
    startBombWindow(room, 0, topPlay);

    const r = submitBomb(room, 2, [S('7'), T('7'), J('7'), P('7')]);
    expect(r.ok).toBe(true);
  });

  it('비폭탄 카드 제출 거부', () => {
    const { room, topPlay } = setupBombTest();
    startBombWindow(room, 0, topPlay);

    const r = submitBomb(room, 2, [room.hands[2]![0]!]); // 싱글은 폭탄 아님
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_a_bomb');
  });

  // Edge #25: 폭탄으로 소원 숫자 포함 → 해제
  it('폭탄으로 소원 해제', () => {
    const { room, topPlay } = setupBombTest();
    room.wish = '5'; // 소원=5

    startBombWindow(room, 0, topPlay);

    // seat 1: 포카드 5 (소원 숫자 포함)
    submitBomb(room, 1, [S('5'), T('5'), J('5'), P('5')]);
    expect(room.wish).toBeNull(); // 소원 해제됨
  });
});
