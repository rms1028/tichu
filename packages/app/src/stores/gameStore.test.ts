/**
 * Regression tests for 2026-04 bugs documented in CLAUDE.md §13.
 *
 * Scope: pure state-reducer logic on useGameStore. No UI, no MMKV,
 * no socket. The vitest.config.ts alias rewrites 'react-native' to a
 * minimal shim so this file can run under Node.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore.js';

beforeEach(() => {
  // Reset the store to a known starting point. We set only the fields
  // our assertions touch; other fields keep their INITIAL_STATE values.
  useGameStore.setState({
    currentTurn: -1,
    isMyTurn: false,
    mySeat: 0,
    turnStartedAt: 0,
    turnDuration: 30000,
    trickWonEvent: null,
    dragonGiveRequired: false,
    dragonGiveSeat: -1,
  });
});

describe('onTurnChanged — turnDuration === 0 sentinel', () => {
  // Regression: commit 819c150. An earlier version used `if (turnDuration)`
  // to decide whether to apply the new value, which treated the 0
  // sentinel ("no timer / unlimited") as falsy and silently kept the
  // stale 30000ms default. The fix was an explicit
  // `turnDuration !== undefined` check. If that check ever regresses to
  // truthy, this test fails.

  it('applies turnDuration=0 verbatim (0 sentinel = unlimited)', () => {
    useGameStore.getState().onTurnChanged(1, 0);
    expect(useGameStore.getState().turnDuration).toBe(0);
  });

  it('applies turnDuration=30000 as normal', () => {
    useGameStore.getState().onTurnChanged(1, 30000);
    expect(useGameStore.getState().turnDuration).toBe(30000);
  });

  it('leaves turnDuration untouched when the event omits it', () => {
    useGameStore.setState({ turnDuration: 15000 });
    useGameStore.getState().onTurnChanged(2); // no duration arg
    expect(useGameStore.getState().turnDuration).toBe(15000);
  });

  it('updates turn seat + isMyTurn flag in the same call', () => {
    // mySeat = 0 from beforeEach
    useGameStore.getState().onTurnChanged(0, 0);
    expect(useGameStore.getState().currentTurn).toBe(0);
    expect(useGameStore.getState().isMyTurn).toBe(true);

    useGameStore.getState().onTurnChanged(2, 0);
    expect(useGameStore.getState().currentTurn).toBe(2);
    expect(useGameStore.getState().isMyTurn).toBe(false);
  });

  it('respects pending dragon-give (does not reset it on turn change)', () => {
    // If dragon_give_required is set, turn change must not clobber it —
    // the dragon-give modal has priority over the turn-timer UI.
    useGameStore.setState({
      dragonGiveRequired: true,
      dragonGiveSeat: 2,
    });
    useGameStore.getState().onTurnChanged(3, 30000);
    expect(useGameStore.getState().dragonGiveRequired).toBe(true);
    expect(useGameStore.getState().dragonGiveSeat).toBe(2);
  });
});
