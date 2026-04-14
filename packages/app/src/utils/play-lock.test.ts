/**
 * Regression test for CLAUDE.md §13 #3 (playLock 영구 잠김).
 *
 * Asserts that scheduleLockRelease eventually calls the release callback
 * after the configured duration — the exact property whose absence
 * caused the 2026-04 Play-button-stuck bug.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { scheduleLockRelease, PLAY_LOCK_DURATION_MS } from './play-lock.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('scheduleLockRelease', () => {
  it('does not release synchronously (lock must persist across the call)', () => {
    vi.useFakeTimers();
    const release = vi.fn();
    scheduleLockRelease(release);
    expect(release).not.toHaveBeenCalled();
  });

  it('releases exactly after the default PLAY_LOCK_DURATION_MS', () => {
    vi.useFakeTimers();
    const release = vi.fn();
    scheduleLockRelease(release);

    vi.advanceTimersByTime(PLAY_LOCK_DURATION_MS - 1);
    expect(release).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('accepts a custom duration', () => {
    vi.useFakeTimers();
    const release = vi.fn();
    scheduleLockRelease(release, 250);
    vi.advanceTimersByTime(249);
    expect(release).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('returns a handle that can be cleared to cancel the release', () => {
    vi.useFakeTimers();
    const release = vi.fn();
    const handle = scheduleLockRelease(release);
    clearTimeout(handle);
    vi.advanceTimersByTime(PLAY_LOCK_DURATION_MS * 2);
    expect(release).not.toHaveBeenCalled();
  });

  it('default duration is 1000ms (matches the 2026-04 incident fix)', () => {
    // Guard against someone silently dropping the default below a
    // double-tap-safe threshold. 1000ms is the value that was proven
    // to work in production after the §13 #3 fix.
    expect(PLAY_LOCK_DURATION_MS).toBe(1000);
  });
});
