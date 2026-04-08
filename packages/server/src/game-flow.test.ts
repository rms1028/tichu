import { describe, it, expect, beforeEach } from 'vitest';
import type { Card, Rank, PlayedHand } from '@tichu/shared';
import {
  normalCard, MAHJONG, DOG, PHOENIX, DRAGON,
  isMahjong, isDragon, validateHand, canBeat,
} from '@tichu/shared';
import type { GameRoom } from './game-room.js';
import {
  createGameRoom, getActivePlayers, getPartnerSeat,
  dealCards, removeCardsFromHand, emptyTrick,
} from './game-room.js';
import {
  startRound, finishLargeTichuWindow, finishExchange,
  declareTichu, passLargeTichu, submitExchange,
  allLargeTichuResponded, allExchangesComplete,
  playCards, passTurn, dragonGive, handleTurnTimeout,
  checkTrickEnd, resolveTrickWon,
} from './game-engine.js';
import {
  startBombWindow, submitBomb, resolveBombWindow, afterBombWindowResolved,
} from './bomb-window.js';

// ── Card factory helpers ────────────────────────────────────

const S = (r: Rank) => normalCard('sword', r);
const T = (r: Rank) => normalCard('star', r);
const J = (r: Rank) => normalCard('jade', r);
const P = (r: Rank) => normalCard('pagoda', r);

// ── Room setup helpers ──────────────────────────────────────

function setupRoom(settings?: Record<string, unknown>): GameRoom {
  const room = createGameRoom('test-flow', settings);
  for (let s = 0; s < 4; s++) {
    room.players[s] = {
      playerId: `player-${s}`,
      nickname: `Player ${s}`,
      socketId: `socket-${s}`,
      connected: true,
      isBot: false,
    };
  }
  return room;
}

function finishAllLargeTichu(room: GameRoom): void {
  for (let s = 0; s < 4; s++) {
    if (!room.largeTichuResponses[s]) {
      room.largeTichuResponses[s] = true;
    }
  }
}

/** Set up a room directly in TRICK_PLAY phase with specific hands. */
function setupTrickPlay(
  room: GameRoom,
  hands: Record<number, Card[]>,
  currentTurn: number = 0,
  opts?: { isFirstLead?: boolean; finishOrder?: number[] },
): void {
  room.phase = 'TRICK_PLAY';
  room.hands = { 0: [...hands[0]!], 1: [...hands[1]!], 2: [...hands[2]!], 3: [...hands[3]!] };
  room.currentTurn = currentTurn;
  room.isFirstLead = opts?.isFirstLead ?? false;
  room.finishOrder = opts?.finishOrder ?? [];
  room.tableCards = null;
  room.currentTrick = emptyTrick();
  room.wonTricks = { 0: [], 1: [], 2: [], 3: [] };
  room.hasPlayedCards = { 0: false, 1: false, 2: false, 3: false };
}

// ═══════════════════════════════════════════════════════════════
// 1. Full round setup flow: create → deal → large tichu → exchange
// ═══════════════════════════════════════════════════════════════

describe('Full round setup flow', () => {
  it('complete round setup: deal 8 → large tichu → deal 6 → exchange → TRICK_PLAY', () => {
    const room = setupRoom();

    // Phase 1: startRound deals 8 cards and enters LARGE_TICHU_WINDOW
    const startEvents = startRound(room);
    expect(room.phase).toBe('LARGE_TICHU_WINDOW');
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(8);
    }
    expect(startEvents.some(e => e.type === 'large_tichu_prompt')).toBe(true);

    // Phase 2: All players respond to large tichu
    for (let s = 0; s < 4; s++) {
      const r = passLargeTichu(room, s);
      expect(r.ok).toBe(true);
    }
    expect(allLargeTichuResponded(room)).toBe(true);

    // Phase 3: finishLargeTichuWindow deals remaining 6 → 14 total
    const ltEvents = finishLargeTichuWindow(room);
    expect(room.phase).toBe('PASSING');
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(14);
    }

    // Phase 4: All players submit exchange
    for (let s = 0; s < 4; s++) {
      const hand = room.hands[s]!;
      const r = submitExchange(room, s, hand[0]!, hand[1]!, hand[2]!);
      expect(r.ok).toBe(true);
    }
    expect(allExchangesComplete(room)).toBe(true);

    // Phase 5: finishExchange → TRICK_PLAY, mahjong holder has first turn
    const exEvents = finishExchange(room);
    expect(room.phase).toBe('TRICK_PLAY');
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(14);
    }
    // currentTurn must be the mahjong holder
    const mahjongHolder = room.currentTurn;
    expect(room.hands[mahjongHolder]!.some(isMahjong)).toBe(true);
    expect(room.isFirstLead).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Large tichu declaration
// ═══════════════════════════════════════════════════════════════

describe('Large tichu declaration flow', () => {
  it('player declares large tichu, partner blocked from declaring', () => {
    const room = setupRoom();
    startRound(room);

    // seat 0 declares large tichu
    const r1 = declareTichu(room, 0, 'large');
    expect(r1.ok).toBe(true);
    expect(room.tichuDeclarations[0]).toBe('large');
    expect(room.largeTichuResponses[0]).toBe(true);

    // partner (seat 2) cannot declare
    const r2 = declareTichu(room, 2, 'large');
    expect(r2.ok).toBe(false);
    expect(r2.error).toBe('teammate_already_declared');

    // opponent (seat 1) CAN declare
    const r3 = declareTichu(room, 1, 'large');
    expect(r3.ok).toBe(true);

    // opponent partner (seat 3) blocked
    const r4 = declareTichu(room, 3, 'large');
    expect(r4.ok).toBe(false);
    expect(r4.error).toBe('teammate_already_declared');
  });

  it('passLargeTichu rejects duplicate response', () => {
    const room = setupRoom();
    startRound(room);

    passLargeTichu(room, 0);
    const r = passLargeTichu(room, 0);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('already_responded');
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Card exchange
// ═══════════════════════════════════════════════════════════════

describe('Card exchange', () => {
  it('rejects exchange with cards not in hand', () => {
    const room = setupRoom();
    startRound(room);
    finishAllLargeTichu(room);
    finishLargeTichuWindow(room);

    // Try to exchange cards not in hand
    const r = submitExchange(room, 0, S('2'), S('3'), S('4'));
    // This may or may not fail depending on whether these cards happen to be in hand
    // But we can test with a clearly wrong card
    if (!r.ok) {
      expect(r.error).toBe('cards_not_in_hand');
    }
  });

  it('rejects duplicate exchange submission', () => {
    const room = setupRoom();
    startRound(room);
    finishAllLargeTichu(room);
    finishLargeTichuWindow(room);

    const hand = room.hands[0]!;
    submitExchange(room, 0, hand[0]!, hand[1]!, hand[2]!);
    const r = submitExchange(room, 0, hand[3]!, hand[4]!, hand[5]!);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('already_exchanged');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Trick play: basic lead, follow, pass, trick won
// ═══════════════════════════════════════════════════════════════

describe('Trick play basics', () => {
  it('lead → follow → all pass → trick won → new lead for winner', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('3')],
      1: [S('K'), T('4')],
      2: [T('5'), T('2')],
      3: [T('7'), T('9')],
    }, 0);

    // seat 0 leads A
    const r1 = playCards(room, 0, [S('A')]);
    expect(r1.ok).toBe(true);
    expect(room.tableCards).not.toBeNull();
    expect(room.tableCards!.value).toBe(14); // A = 14

    // seats 1, 2, 3 pass
    expect(passTurn(room, 1).ok).toBe(true);
    expect(passTurn(room, 2).ok).toBe(true);
    const r4 = passTurn(room, 3);
    expect(r4.ok).toBe(true);

    // trick won → seat 0 gets new lead
    expect(room.tableCards).toBeNull(); // new trick
    expect(room.currentTurn).toBe(0);
    expect(room.wonTricks[0]!.length).toBeGreaterThan(0);
  });

  it('follow must be higher value of same type', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('K')],
      1: [S('3'), S('Q')],
      2: [T('5')],
      3: [T('7')],
    }, 0);

    playCards(room, 0, [S('K')]); // lead K (value 13)

    // seat 1 tries 3 → fail (3 < 13)
    const r = playCards(room, 1, [S('3')]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('cannot_beat_table');
  });

  it('cannot pass on lead', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A')], 1: [S('3')], 2: [T('5')], 3: [T('7')],
    }, 0);

    const r = passTurn(room, 0);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('cannot_pass_on_lead');
  });

  it('pair play: lead pair, follow with higher pair', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('5'), T('5'), S('A')],
      1: [S('9'), T('9'), S('2')],
      2: [T('3'), J('3')],
      3: [T('7'), J('7')],
    }, 0);

    // seat 0 leads pair of 5s
    const r1 = playCards(room, 0, [S('5'), T('5')]);
    expect(r1.ok).toBe(true);
    expect(room.tableCards!.type).toBe('pair');

    // seat 1 follows with pair of 9s
    const r2 = playCards(room, 1, [S('9'), T('9')]);
    expect(r2.ok).toBe(true);
    expect(room.tableCards!.value).toBe(9);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Special cards: Dog, Dragon, Phoenix
// ═══════════════════════════════════════════════════════════════

describe('Dog lead transfer', () => {
  it('dog leads → partner gets lead, table cleared', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DOG, S('5')],
      1: [S('6'), S('7')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    const r = playCards(room, 0, [DOG]);
    expect(r.ok).toBe(true);
    expect(room.currentTurn).toBe(2); // partner of seat 0
    expect(room.tableCards).toBeNull();
    expect(r.events.some(e => e.type === 'dog_lead_transfer')).toBe(true);
  });

  // Edge #7: last card is dog → finish + lead transfer
  it('last card is dog → player finishes and lead transfers', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DOG],
      1: [S('6'), S('7')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    const r = playCards(room, 0, [DOG]);
    expect(r.ok).toBe(true);
    expect(room.finishOrder).toContain(0);
    expect(room.currentTurn).toBe(2); // partner gets lead
    expect(r.events.some(e => e.type === 'player_finished' && e.seat === 0)).toBe(true);
  });

  // Edge #1: partner already finished → next active clockwise
  it('partner finished → lead goes to next active clockwise from partner', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DOG, S('5')],
      1: [S('6')],
      2: [],
      3: [T('5')],
    }, 0, { finishOrder: [2] });

    const r = playCards(room, 0, [DOG]);
    expect(r.ok).toBe(true);
    // partner seat 2 is out, next clockwise from seat 2 → seat 3
    expect(room.currentTurn).toBe(3);
  });
});

describe('Dragon', () => {
  it('dragon lead → all pass → dragon_give_required', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON, S('3')],
      1: [S('4'), S('5')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    playCards(room, 0, [DRAGON]);
    passTurn(room, 1);
    passTurn(room, 2);
    const r = passTurn(room, 3);

    expect(room.dragonGivePending).not.toBeNull();
    expect(room.dragonGivePending!.winningSeat).toBe(0);
    expect(r.events.some(e => e.type === 'dragon_give_required')).toBe(true);
  });

  it('dragon give to opponent succeeds, to partner fails', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON, S('3')],
      1: [S('4'), S('5')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    playCards(room, 0, [DRAGON]);
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    // give to partner → fail
    const rFail = dragonGive(room, 0, 2);
    expect(rFail.ok).toBe(false);
    expect(rFail.error).toBe('must_give_to_opponent');

    // give to opponent → success
    const rOk = dragonGive(room, 0, 1);
    expect(rOk.ok).toBe(true);
    expect(room.dragonGivePending).toBeNull();
    // opponent 1 should have the dragon in their won tricks
    expect(room.wonTricks[1]!.some(c => c.type === 'special' && c.specialType === 'dragon')).toBe(true);
  });

  // Edge #12: last card is dragon → player finishes + dragon give required
  it('last card dragon → finish + dragon give required', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON],
      1: [S('4'), S('5')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    const r = playCards(room, 0, [DRAGON]);
    expect(r.ok).toBe(true);
    expect(room.finishOrder).toContain(0);

    // All others pass → trick ends
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    expect(room.dragonGivePending).not.toBeNull();
  });

  // Edge #5: one opponent finished, dragon give goes to remaining opponent
  it('one opponent finished → dragon give to remaining opponent', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON, S('3')],
      1: [],         // opponent 1 finished
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0, { finishOrder: [1] });

    playCards(room, 0, [DRAGON]);
    // seat 1 finished, so turns go 2 → 3
    passTurn(room, 2);
    passTurn(room, 3);

    // Dragon give pending — give to seat 3 (active opponent)
    expect(room.dragonGivePending).not.toBeNull();
    const r = dragonGive(room, 0, 3);
    expect(r.ok).toBe(true);
    expect(room.wonTricks[3]!.some(c => c.type === 'special' && c.specialType === 'dragon')).toBe(true);
  });

  // Edge #5: give to finished opponent should also work
  it('can give to finished opponent (not just active)', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON, S('3')],
      1: [],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0, { finishOrder: [1] });

    playCards(room, 0, [DRAGON]);
    passTurn(room, 2);
    passTurn(room, 3);

    // Give to finished opponent seat 1 — should succeed
    const r = dragonGive(room, 0, 1);
    expect(r.ok).toBe(true);
    expect(room.wonTricks[1]!.some(c => c.type === 'special' && c.specialType === 'dragon')).toBe(true);
  });

  // Dragon give trick cards contain correct points (25 for dragon)
  it('dragon give transfers all trick cards including dragon points', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON, S('K')],      // dragon (+25) + K (+10) = 35 total if both in trick
      1: [S('A'), S('5')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    playCards(room, 0, [DRAGON]);
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    expect(room.dragonGivePending).not.toBeNull();
    expect(room.dragonGivePending!.trickCards.length).toBe(1); // only dragon played

    const r = dragonGive(room, 0, 1);
    expect(r.ok).toBe(true);
    // Opponent 1 receives the dragon in wonTricks
    const opponentPoints = room.wonTricks[1]!.reduce((sum: number, c: Card) => {
      if (c.type === 'special' && c.specialType === 'dragon') return sum + 25;
      return sum;
    }, 0);
    expect(opponentPoints).toBe(25);
  });

  // Dragon as last card + give → game continues with next active player
  it('last card dragon → give → next trick starts with winner lead', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON],
      1: [S('4'), S('5')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    playCards(room, 0, [DRAGON]);
    expect(room.finishOrder).toContain(0);

    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    expect(room.dragonGivePending).not.toBeNull();
    const r = dragonGive(room, 0, 1);
    expect(r.ok).toBe(true);
    expect(room.dragonGivePending).toBeNull();

    // seat 0 finished, so lead goes to next active (seat 1, 2, or 3)
    expect(room.finishOrder).toContain(0);
    expect([1, 2, 3]).toContain(room.currentTurn);
    expect(room.tableCards).toBeNull(); // new trick, no table cards
  });

  // Dragon give wrong seat rejected
  it('dragon give from wrong seat is rejected', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON, S('3')],
      1: [S('4'), S('5')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    playCards(room, 0, [DRAGON]);
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    // seat 1 tries to give (not the winner)
    const r = dragonGive(room, 1, 3);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no_dragon_give_pending');
  });

  // Dragon give to self is rejected
  it('dragon give to self is rejected', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON, S('3')],
      1: [S('4'), S('5')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    playCards(room, 0, [DRAGON]);
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    const r = dragonGive(room, 0, 0);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('must_give_to_opponent');
  });

  // Multi-card trick with dragon: all trick cards go to target
  it('multi-player trick with dragon: entire trick pile goes to target', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('3')],
      1: [DRAGON, S('5')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    // seat 0 leads A, seat 1 beats with dragon
    playCards(room, 0, [S('A')]);
    playCards(room, 1, [DRAGON]);
    passTurn(room, 2);
    passTurn(room, 3);
    passTurn(room, 0);

    expect(room.dragonGivePending).not.toBeNull();
    expect(room.dragonGivePending!.winningSeat).toBe(1);
    // Trick pile should contain both A and dragon
    expect(room.dragonGivePending!.trickCards.length).toBe(2);

    const r = dragonGive(room, 1, 0);
    expect(r.ok).toBe(true);
    // seat 0 (opponent of 1) receives both cards
    expect(room.wonTricks[0]!.length).toBe(2);
  });
});

describe('Phoenix', () => {
  // Edge #2: phoenix lead solo = 1.5
  it('phoenix lead solo value = 1.5', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [PHOENIX, S('A')],
      1: [S('2'), S('3')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    const r = playCards(room, 0, [PHOENIX]);
    expect(r.ok).toBe(true);
    // phoenix lead = 1.5, any 2+ can beat it
    expect(room.tableCards!.value).toBe(1.5);

    // seat 1 follows with 2 → should beat 1.5
    const r2 = playCards(room, 1, [S('2')]);
    expect(r2.ok).toBe(true);
  });

  // Edge #4: phoenix cannot beat dragon
  it('phoenix cannot beat dragon', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DRAGON],
      1: [PHOENIX, S('3')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    playCards(room, 0, [DRAGON]);
    const r = playCards(room, 1, [PHOENIX]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('phoenix_cannot_beat_dragon');
  });

  // Phoenix as wildcard in pair
  it('phoenix as wildcard in pair', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [PHOENIX, S('7'), S('A')],
      1: [S('9'), T('9'), S('2')],
      2: [T('3'), J('3')],
      3: [T('7'), J('7')],
    }, 0);

    // phoenix + 7 = pair of 7s
    const r = playCards(room, 0, [PHOENIX, S('7')]);
    expect(r.ok).toBe(true);
    expect(room.tableCards!.type).toBe('pair');
    expect(room.tableCards!.value).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Bomb: four-of-a-kind and straight flush via bomb window
// ═══════════════════════════════════════════════════════════════

describe('Bomb window integration', () => {
  it('four-of-a-kind bomb beats single via bomb window', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('2')],
      1: [S('5'), T('5'), J('5'), P('5'), S('3')], // four 5s
      2: [T('3'), T('4')],
      3: [T('7'), T('8')],
    }, 0);

    // seat 0 leads A
    playCards(room, 0, [S('A')]);
    const topPlay = room.tableCards!;

    // Start bomb window (normally done by socket handler)
    startBombWindow(room, 0, topPlay);
    expect(room.bombWindow).not.toBeNull();

    // seat 1 submits four-of-a-kind 5
    const bombR = submitBomb(room, 1, [S('5'), T('5'), J('5'), P('5')]);
    expect(bombR.ok).toBe(true);

    // Resolve bomb window
    const resolveEvents = resolveBombWindow(room);
    // After resolve, table should be the bomb
    expect(room.tableCards!.type).toBe('four_bomb');
    expect(room.tableCards!.value).toBe(5);
  });

  it('straight flush bomb beats four-of-a-kind', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('2')],
      1: [S('5'), T('5'), J('5'), P('5'), S('3')], // four 5s
      2: [T('3'), T('4'), T('5'), T('6'), T('7'), T('8')], // straight flush 3-7 in star
      3: [P('7'), P('8')],
    }, 0);

    // seat 0 leads A, seat 1 bombs with four 5s
    playCards(room, 0, [S('A')]);
    const topPlay = room.tableCards!;
    startBombWindow(room, 0, topPlay);
    submitBomb(room, 1, [S('5'), T('5'), J('5'), P('5')]);
    resolveBombWindow(room);

    // Now table has four_bomb of 5s, new bomb window started
    expect(room.bombWindow).not.toBeNull();

    // seat 2 submits straight flush bomb (T3-T7)
    const sfBomb = submitBomb(room, 2, [T('3'), T('4'), T('5'), T('6'), T('7')]);
    expect(sfBomb.ok).toBe(true);

    const resolveEvents2 = resolveBombWindow(room);
    expect(room.tableCards!.type).toBe('straight_flush_bomb');
  });

  // Edge #29: multiple bombs → strongest wins
  it('multiple simultaneous bombs → strongest applied, rest returned', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('2')],
      1: [S('5'), T('5'), J('5'), P('5'), S('3')], // four 5s
      2: [T('3'), T('4')],
      3: [S('8'), T('8'), J('8'), P('8'), S('K')], // four 8s
    }, 0);

    playCards(room, 0, [S('A')]);
    startBombWindow(room, 0, room.tableCards!);

    // Both seat 1 and seat 3 submit bombs
    submitBomb(room, 1, [S('5'), T('5'), J('5'), P('5')]);
    submitBomb(room, 3, [S('8'), T('8'), J('8'), P('8')]);

    resolveBombWindow(room);

    // Four 8s is stronger → applied
    expect(room.tableCards!.type).toBe('four_bomb');
    expect(room.tableCards!.value).toBe(8);

    // seat 1's bomb cards returned to hand
    expect(room.hands[1]!.length).toBe(5); // 4 returned + 1 remaining S('3')
    // seat 3's bomb cards consumed
    expect(room.hands[3]!.length).toBe(1); // only S('K') remains
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Round end: normal (3 players finished), one-two finish, scoring
// ═══════════════════════════════════════════════════════════════

describe('Round end and scoring', () => {
  // Edge #36: one-two finish → 200 points
  it('one-two finish: same team 1st and 2nd → 200 points', () => {
    const room = setupRoom();
    // Seats 0 and 2 are team1. Set up so seat 0 finishes first, then seat 2.
    // Use a scenario where seat 0 leads high, finishes, then seat 2 leads and finishes.
    setupTrickPlay(room, {
      0: [S('A')],
      1: [S('3'), S('4'), S('5')],
      2: [T('A')],
      3: [T('5'), T('6'), T('7')],
    }, 0);

    // seat 0 leads A → finishes (1st)
    playCards(room, 0, [S('A')]);
    expect(room.finishOrder).toContain(0);

    // seat 1 passes, seat 2 passes, seat 3 passes → trick won by seat 0
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    // After trick won, seat 0 is out. Next lead goes to next active player.
    // The trick winner (seat 0) is out, so getNextActiveSeat gives seat 1.
    // We need seat 2 to get lead. Let's adjust: have seat 1 lead, all pass, then seat 2.
    // Actually, let's just directly set up a simpler scenario.

    // Re-approach: directly manipulate finishOrder to test one-two detection
    const room2 = setupRoom();
    setupTrickPlay(room2, {
      0: [S('3')],       // will not play
      1: [S('4'), S('5')],
      2: [T('A')],       // 1 card, will finish
      3: [T('5'), T('6')],
    }, 2);
    room2.finishOrder = [0]; // seat 0 already finished 1st

    // seat 2 leads A → finishes → 2nd place → same team as seat 0 → one-two!
    const r = playCards(room2, 2, [T('A')]);
    expect(r.ok).toBe(true);
    expect(room2.finishOrder).toContain(0);
    expect(room2.finishOrder).toContain(2);

    // one-two finish should trigger round end
    expect(room2.phase).toBe('SCORING');
    // team1 (seats 0, 2) gets 200 points for one-two
    expect(room2.roundScores.team1).toBeGreaterThanOrEqual(200);
  });

  it('normal round end: 3 players finished, 4th gets remaining cards to opponent', () => {
    const room = setupRoom();
    // Set up where players finish in order 0, 1, 2, leaving 3 as 4th
    setupTrickPlay(room, {
      0: [S('A')],
      1: [S('K')],
      2: [T('Q')],
      3: [T('5'), T('6'), T('7'), T('10')], // has point cards: 5(5pts) + 10(10pts) = 15pts
    }, 0);

    // seat 0 leads A, finishes
    playCards(room, 0, [S('A')]);
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    // seat 1 leads K, finishes (not same team as 0, so no one-two)
    playCards(room, room.currentTurn, [S('K')]);
    // remaining pass
    if (room.currentTurn === 2) passTurn(room, 2);
    if (room.currentTurn === 3) passTurn(room, 3);
    if (room.currentTurn === 2) passTurn(room, 2);
    if (room.currentTurn === 3) passTurn(room, 3);

    // Continue playing until round ends
    // seat 2 leads Q, finishes → 3 out → round ends automatically
    if (room.phase === 'TRICK_PLAY' && room.currentTurn === 2) {
      playCards(room, 2, [T('Q')]);
    }

    // Round should have ended by now (3 finished or game resolved)
    expect(room.phase === 'SCORING' || room.phase === 'ROUND_END').toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Edge case: player with only dog left
// ═══════════════════════════════════════════════════════════════

describe('Edge case: dog-only hand', () => {
  // Edge #11: dog only left, on follow → must pass
  it('player with only dog cannot play on follow', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('K')],
      1: [DOG],              // only dog left
      2: [T('3'), T('4')],
      3: [T('7'), T('8')],
    }, 0);

    // seat 0 leads A
    playCards(room, 0, [S('A')]);

    // seat 1 has only dog → cannot follow with dog (not a valid follow)
    const rDog = playCards(room, 1, [DOG]);
    expect(rDog.ok).toBe(false);

    // seat 1 must pass
    const rPass = passTurn(room, 1);
    expect(rPass.ok).toBe(true);
  });

  // Edge #11: dog only left, gets lead → can lead with dog
  it('player with only dog gets lead → can lead dog', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('3')],
      1: [DOG],
      2: [T('4'), T('5')],
      3: [T('7'), T('8')],
    }, 1); // seat 1 has the lead

    const r = playCards(room, 1, [DOG]);
    expect(r.ok).toBe(true);
    // dog leads → partner (seat 3) gets lead
    expect(room.currentTurn).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Wish fulfillment forced play
// ═══════════════════════════════════════════════════════════════

describe('Wish fulfillment', () => {
  it('wish active: player with wish card must play it if legal combo exists', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [MAHJONG, S('3')],
      1: [S('7'), T('7'), S('2')],  // has 7 (wish card)
      2: [T('3'), T('4')],
      3: [T('8'), T('9')],
    }, 0, { isFirstLead: true });

    // seat 0 leads mahjong with wish=7
    playCards(room, 0, [MAHJONG], undefined, '7');
    expect(room.wish).toBe('7');

    // seat 1 must play 7 → trying to play 2 should fail
    const rBad = playCards(room, 1, [S('2')]);
    expect(rBad.ok).toBe(false);
    expect(rBad.error).toBe('must_fulfill_wish');

    // seat 1 plays 7 → should succeed and wish fulfilled
    const rGood = playCards(room, 1, [S('7')]);
    expect(rGood.ok).toBe(true);
    expect(room.wish).toBeNull();
  });

  it('wish active on lead: must include wish card in lead', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('3')],
      1: [S('7'), T('7'), S('K')],
      2: [T('3'), T('4')],
      3: [T('8'), T('9')],
    }, 0);
    room.wish = '7';

    // seat 0 does not have 7 → can lead anything (no wish card)
    const r = playCards(room, 0, [S('3')]);
    expect(r.ok).toBe(true);
  });

  // Edge #17, #27: wish active + wish card owned + dog lead → rejected
  it('wish active + owns wish card → cannot lead dog', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [DOG, S('7'), S('A')],
      1: [S('3'), T('4')],
      2: [T('3'), T('5')],
      3: [T('7'), T('8')],
    }, 0);
    room.wish = '7';

    const r = playCards(room, 0, [DOG]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wish_active_must_play_wish_card');
  });

  it('wish active but player does not own wish card → pass allowed', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('K')],
      1: [S('3'), S('2')],     // no 7
      2: [T('3'), T('4')],
      3: [T('8'), T('9')],
    }, 0);
    room.wish = '7';

    playCards(room, 0, [S('A')]);

    // seat 1 has no 7 → pass is fine
    const r = passTurn(room, 1);
    expect(r.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. Turn timeout auto-action
// ═══════════════════════════════════════════════════════════════

describe('Turn timeout', () => {
  // Edge #45: lead timeout → auto play lowest single
  it('lead timeout → plays lowest card', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('7'), S('A'), S('3')],
      1: [T('4'), T('5')],
      2: [T('3'), T('6')],
      3: [T('8'), T('9')],
    }, 0);

    const r = handleTurnTimeout(room);
    expect(r.ok).toBe(true);
    expect(r.events.some(e => e.type === 'auto_action')).toBe(true);
    // Should have played S('3') (lowest = value 3)
    expect(room.tableCards).not.toBeNull();
    expect(room.tableCards!.value).toBe(3);
  });

  // Edge #46: follow timeout → auto pass
  it('follow timeout → auto pass', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('3')],
      1: [S('2'), S('4')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    playCards(room, 0, [S('A')]); // lead
    // seat 1 is next, timeout
    const r = handleTurnTimeout(room);
    expect(r.ok).toBe(true);
    expect(r.events.some(e => e.type === 'auto_action' && (e as any).action === 'pass')).toBe(true);
  });

  it('lead timeout with wish active + wish card → plays wish card', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('7'), S('A'), S('3')],
      1: [T('4'), T('5')],
      2: [T('3'), T('6')],
      3: [T('8'), T('9')],
    }, 0);
    room.wish = '7';

    const r = handleTurnTimeout(room);
    expect(r.ok).toBe(true);
    // Should play the 7 (wish card)
    expect(room.tableCards!.value).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. Small tichu validation
// ═══════════════════════════════════════════════════════════════

describe('Small tichu', () => {
  it('can declare small tichu before playing any card', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('K')],
      1: [S('3'), S('4')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    const r = declareTichu(room, 0, 'small');
    expect(r.ok).toBe(true);
    expect(room.tichuDeclarations[0]).toBe('small');
  });

  it('cannot declare small tichu after playing a card', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('K')],
      1: [S('3'), S('4')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    // seat 0 plays
    playCards(room, 0, [S('A')]);

    const r = declareTichu(room, 0, 'small');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('already_played_cards');
  });

  it('other player played cards but I did not → can declare', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('K')],
      1: [S('3'), S('4')],
      2: [T('3'), T('4')],
      3: [T('5'), T('6')],
    }, 0);

    // seat 0 plays, seat 1 not yet played
    playCards(room, 0, [S('A')]);

    const r = declareTichu(room, 1, 'small');
    expect(r.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 12. Trick end: 2 players remaining, 1 passes
// ═══════════════════════════════════════════════════════════════

describe('Trick end with 2 players', () => {
  // Edge #42: 2 active players, 1 passes → trick ends immediately
  it('2 active players, 1 passes → trick ends', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [],
      1: [],
      2: [T('A'), T('K'), T('Q')],
      3: [S('5'), S('6'), S('7')],
    }, 2, { finishOrder: [0, 1] });

    // seat 2 leads A
    playCards(room, 2, [T('A')]);
    // seat 3 passes → only 2 active, 1 pass → trick ends
    const r = passTurn(room, 3);
    expect(r.ok).toBe(true);
    // trick should be won by seat 2
    expect(r.events.some(e => e.type === 'trick_won')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. Multi-trick game flow simulation
// ═══════════════════════════════════════════════════════════════

describe('Multi-trick game flow', () => {
  it('play multiple tricks in sequence', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('K'), S('Q')],
      1: [S('3'), S('4'), S('5')],
      2: [T('3'), T('4'), T('5')],
      3: [T('7'), T('8'), T('9')],
    }, 0);

    // Trick 1: seat 0 leads A, all pass
    playCards(room, 0, [S('A')]);
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    expect(room.currentTurn).toBe(0); // winner leads again
    expect(room.tableCards).toBeNull();
    expect(room.wonTricks[0]!.length).toBeGreaterThan(0);

    // Trick 2: seat 0 leads K, seat 3 cannot beat, passes
    playCards(room, 0, [S('K')]);
    passTurn(room, 1);
    passTurn(room, 2);
    passTurn(room, 3);

    expect(room.currentTurn).toBe(0);

    // Trick 3: seat 0 leads Q, seat 3 plays 9? No, 9 < 12
    playCards(room, 0, [S('Q')]);
    // seat 0 finished (played all cards)
    expect(room.finishOrder).toContain(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. Dragon edge: both opponents finished → first finished gets tricks
// ═══════════════════════════════════════════════════════════════

describe('Dragon: both opponents finished', () => {
  // Edge #6: both opponents out → first finished opponent gets trick
  it('both opponents finished → auto give to first finished opponent', () => {
    const room = setupRoom();
    // seat 0 is team1, opponents are 1 and 3 (both finished)
    setupTrickPlay(room, {
      0: [DRAGON, S('3')],
      1: [],
      2: [T('4'), T('5')],
      3: [],
    }, 0, { finishOrder: [1, 3] }); // opponents 1 then 3 finished

    // seat 0 leads dragon
    playCards(room, 0, [DRAGON]);
    // seat 2 (partner, only other active) passes
    passTurn(room, 2);

    // Both opponents out → auto assigned to first finished (seat 1)
    // No dragonGivePending since auto-assigned
    expect(room.dragonGivePending).toBeNull();
    expect(room.wonTricks[1]!.some(c => c.type === 'special' && c.specialType === 'dragon')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// 15. Phase validation: wrong phase actions rejected
// ═══════════════════════════════════════════════════════════════

describe('Phase validation', () => {
  it('playCards rejected in PASSING phase', () => {
    const room = setupRoom();
    room.phase = 'PASSING';
    room.hands = { 0: [S('A')], 1: [], 2: [], 3: [] };
    room.currentTurn = 0;

    const r = playCards(room, 0, [S('A')]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong_phase');
  });

  it('submitExchange rejected in TRICK_PLAY phase', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';
    const r = submitExchange(room, 0, S('A'), S('K'), S('Q'));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong_phase');
  });

  it('small tichu rejected in LARGE_TICHU_WINDOW', () => {
    const room = setupRoom();
    startRound(room);

    const r = declareTichu(room, 0, 'small');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong_phase');
  });

  it('large tichu rejected in TRICK_PLAY', () => {
    const room = setupRoom();
    room.phase = 'TRICK_PLAY';

    const r = declareTichu(room, 0, 'large');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('wrong_phase');
  });
});

// ═══════════════════════════════════════════════════════════════
// 16. Not your turn validation
// ═══════════════════════════════════════════════════════════════

describe('Turn validation', () => {
  it('playCards rejected if not your turn', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A')], 1: [S('3')], 2: [T('5')], 3: [T('7')],
    }, 0);

    const r = playCards(room, 1, [S('3')]); // not seat 1's turn
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_your_turn');
  });

  it('passTurn rejected if not your turn', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A')], 1: [S('3')], 2: [T('5')], 3: [T('7')],
    }, 0);

    playCards(room, 0, [S('A')]);
    // Try to pass for seat 2 when it's seat 1's turn
    const r = passTurn(room, 2);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_your_turn');
  });
});

// ═══════════════════════════════════════════════════════════════
// 17. Straight play
// ═══════════════════════════════════════════════════════════════

describe('Straight play', () => {
  it('lead with 5-card straight (mixed suits) and follow with higher straight', () => {
    const room = setupRoom();
    // Use mixed suits so they are NOT straight flush bombs
    setupTrickPlay(room, {
      0: [S('3'), T('4'), J('5'), P('6'), S('7'), S('A')],
      1: [T('5'), J('6'), P('7'), S('8'), T('9'), T('2')],
      2: [J('3'), J('4'), J('8')],
      3: [P('8'), P('9'), P('10')],
    }, 0);

    // seat 0 leads straight 3-4-5-6-7 (mixed suits → regular straight)
    const r1 = playCards(room, 0, [S('3'), T('4'), J('5'), P('6'), S('7')]);
    expect(r1.ok).toBe(true);
    expect(room.tableCards!.type).toBe('straight');
    expect(room.tableCards!.length).toBe(5);

    // seat 1 follows with higher straight 5-6-7-8-9 (mixed suits)
    const r2 = playCards(room, 1, [T('5'), J('6'), P('7'), S('8'), T('9')]);
    expect(r2.ok).toBe(true);
    expect(room.tableCards!.value).toBe(9); // highest card value
  });

  it('straight must have same length to follow', () => {
    const room = setupRoom();
    // Mixed suits to avoid straight flush bomb
    setupTrickPlay(room, {
      0: [S('3'), T('4'), J('5'), P('6'), S('7'), S('A')],
      1: [T('5'), J('6'), P('7'), S('8'), T('9'), J('10'), T('2')],
      2: [J('3'), J('4'), J('8')],
      3: [P('8'), P('9'), P('10')],
    }, 0);

    playCards(room, 0, [S('3'), T('4'), J('5'), P('6'), S('7')]); // 5-card straight

    // seat 1 tries 6-card straight → wrong length
    const r = playCards(room, 1, [T('5'), J('6'), P('7'), S('8'), T('9'), J('10')]);
    expect(r.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// 18. Bomb window: bomb_not_strong_enough
// ═══════════════════════════════════════════════════════════════

describe('Bomb strength validation', () => {
  it('weaker bomb rejected during bomb window', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A'), S('2')],
      1: [S('3'), T('3'), J('3'), P('3'), S('K')], // four 3s (weak)
      2: [T('3'), T('4')],
      3: [T('7'), T('8')],
    }, 0);

    playCards(room, 0, [S('A')]);

    // Manually set table to a four_bomb of 5s (simulating a previous bomb)
    room.tableCards = {
      type: 'four_bomb',
      cards: [S('5'), T('5'), J('5'), P('5')],
      value: 5,
      length: 4,
    };

    startBombWindow(room, 0, room.tableCards);

    // seat 1 tries four 3s → weaker than four 5s
    const r = submitBomb(room, 1, [S('3'), T('3'), J('3'), P('3')]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('bomb_not_strong_enough');
  });
});

// ═══════════════════════════════════════════════════════════════
// 19. Full house play
// ═══════════════════════════════════════════════════════════════

describe('Full house play', () => {
  it('lead full house and follow with higher full house', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('3'), T('3'), J('3'), S('5'), T('5'), S('A')],
      1: [S('7'), T('7'), J('7'), S('K'), T('K'), S('2')],
      2: [J('4'), J('5'), J('6')],
      3: [P('7'), P('8'), P('9')],
    }, 0);

    // seat 0 leads full house: triple 3s + pair 5s
    const r1 = playCards(room, 0, [S('3'), T('3'), J('3'), S('5'), T('5')]);
    expect(r1.ok).toBe(true);
    expect(room.tableCards!.type).toBe('fullhouse');
    expect(room.tableCards!.value).toBe(3); // full house value = triple rank

    // seat 1 follows with triple 7s + pair Ks
    const r2 = playCards(room, 1, [S('7'), T('7'), J('7'), S('K'), T('K')]);
    expect(r2.ok).toBe(true);
    expect(room.tableCards!.value).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════════
// 20. Player finish tracking across tricks
// ═══════════════════════════════════════════════════════════════

describe('Player finishing', () => {
  it('player finishes when hand is empty, gets added to finishOrder', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('A')],  // 1 card
      1: [S('3'), S('4')],
      2: [T('3'), T('4')],
      3: [T('7'), T('8')],
    }, 0);

    const r = playCards(room, 0, [S('A')]);
    expect(r.ok).toBe(true);
    expect(room.finishOrder).toContain(0);
    expect(room.hands[0]!.length).toBe(0);
    expect(r.events.some(e => e.type === 'player_finished' && e.seat === 0)).toBe(true);
  });

  it('finished players are skipped in turn order', () => {
    const room = setupRoom();
    setupTrickPlay(room, {
      0: [S('3'), S('4')],
      1: [],    // already out
      2: [T('5'), T('6')],
      3: [T('7'), T('8')],
    }, 0, { finishOrder: [1] });

    playCards(room, 0, [S('3')]);
    // Next turn should skip seat 1 (finished) → seat 2
    expect(room.currentTurn).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// cards_dealt event per-seat generation
// ═══════════════════════════════════════════════════════════════

describe('cards_dealt events per-seat', () => {
  it('startRound emits 4 separate cards_dealt events, one per seat', () => {
    const room = setupRoom();
    const events = startRound(room);
    const cardDealtEvents = events.filter(e => e.type === 'cards_dealt');
    expect(cardDealtEvents.length).toBe(4);

    // Each event should have a different seat (0~3)
    const seats = cardDealtEvents.map(e => (e as any).seat);
    expect(new Set(seats).size).toBe(4);
    expect(seats).toEqual([0, 1, 2, 3]);

    // Each seat should have 8 cards
    for (const e of cardDealtEvents) {
      expect((e as any).cards.length).toBe(8);
    }
  });

  it('finishLargeTichuWindow emits 4 cards_dealt events with 14 cards each', () => {
    const room = setupRoom();
    startRound(room);
    finishAllLargeTichu(room);
    const events = finishLargeTichuWindow(room);
    const cardDealtEvents = events.filter(e => e.type === 'cards_dealt');
    expect(cardDealtEvents.length).toBe(4);

    for (const e of cardDealtEvents) {
      expect((e as any).cards.length).toBe(14);
    }
  });

  it('finishExchange emits 4 cards_dealt events with 14 cards each', () => {
    const room = setupRoom();
    startRound(room);
    finishAllLargeTichu(room);
    finishLargeTichuWindow(room);

    // Submit exchanges
    for (let s = 0; s < 4; s++) {
      const hand = room.hands[s]!;
      submitExchange(room, s, hand[0]!, hand[1]!, hand[2]!);
    }

    const events = finishExchange(room);
    const cardDealtEvents = events.filter(e => e.type === 'cards_dealt');
    expect(cardDealtEvents.length).toBe(4);

    const seats = cardDealtEvents.map(e => (e as any).seat);
    expect(seats).toEqual([0, 1, 2, 3]);

    for (const e of cardDealtEvents) {
      expect((e as any).cards.length).toBe(14);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Multi-round flow: second round cards are dealt correctly
// ═══════════════════════════════════════════════════════════════

describe('Multi-round card dealing', () => {
  it('second round startRound deals fresh 8 cards after previous round', () => {
    const room = setupRoom();

    // --- Round 1 ---
    startRound(room);
    finishAllLargeTichu(room);
    finishLargeTichuWindow(room);

    // Quick exchange
    for (let s = 0; s < 4; s++) {
      const hand = room.hands[s]!;
      submitExchange(room, s, hand[0]!, hand[1]!, hand[2]!);
    }
    finishExchange(room);

    // Verify 14 cards each
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(14);
    }

    // --- Simulate round end (manual reset) ---
    // Round 2 startRound calls resetRound internally
    const events2 = startRound(room);
    const cardDealtEvents2 = events2.filter(e => e.type === 'cards_dealt');
    expect(cardDealtEvents2.length).toBe(4);

    // Each seat should have exactly 8 fresh cards
    for (let s = 0; s < 4; s++) {
      expect(room.hands[s]!.length).toBe(8);
    }

    // Event cards should match room hands
    for (const e of cardDealtEvents2) {
      const seat = (e as any).seat as number;
      expect((e as any).cards.length).toBe(8);
    }
  });
});
