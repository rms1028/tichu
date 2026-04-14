/**
 * Play-lock release helper.
 *
 * Why this util exists: the inline `setTimeout` that auto-releases
 * `playLock` in ActionBar kept getting removed or altered during
 * refactors, reintroducing the 2026-04 "playLock 영구 잠김" bug
 * (CLAUDE.md §13 #3):
 *
 *   const lockBriefly = () => {
 *     setPlayLock(true);
 *     setTimeout(() => setPlayLock(false), 1000);  // ← this line
 *   };
 *
 * If the server rejects the play with `invalid_play`, the turn doesn't
 * change, so the `useEffect` reset (`if (!isMyTurn) setPlayLock(false)`)
 * never fires and the Play button becomes permanently stuck. The
 * setTimeout is the *only* way the lock gets released in that error
 * branch.
 *
 * Naming this util and giving it a test makes the regression a
 * two-step change (remove the import AND the setTimeout body) that's
 * easier to catch in code review. The test asserts the release happens
 * after the configured duration using fake timers.
 */

export const PLAY_LOCK_DURATION_MS = 1000;

/**
 * Schedule an automatic release of a play lock.
 *
 * Returns the timer handle so callers can cancel if the lock is
 * released earlier (e.g. on turn change). The default duration is
 * `PLAY_LOCK_DURATION_MS` — short enough to retry after a server
 * rejection, long enough to absorb a double-tap.
 */
export function scheduleLockRelease(
  release: () => void,
  durationMs: number = PLAY_LOCK_DURATION_MS,
): ReturnType<typeof setTimeout> {
  return setTimeout(release, durationMs);
}
