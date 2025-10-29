import { describe, it, expect } from 'vitest';
import { shouldEmit } from '../src/lib/diff';

describe('shouldEmit', () => {
  const base = '2025-10-29T12:00:00.000Z';

  it('returns false if updatedAt is missing', () => {
    expect(shouldEmit({ updatedAtIso: undefined, lastSyncIso: base })).toBe(false);
  });

  it('returns false if updatedAt is invalid', () => {
    expect(shouldEmit({ updatedAtIso: 'nope', lastSyncIso: base })).toBe(false);
  });

  it('returns true when updatedAt > lastSync and > seenAt', () => {
    expect(
      shouldEmit({
        updatedAtIso: '2025-10-29T12:10:00.000Z',
        lastSyncIso: '2025-10-29T12:05:00.000Z',
        seenAtIso: '2025-10-29T12:06:00.000Z',
      }),
    ).toBe(true);
  });

  it('returns false when updatedAt <= lastSync', () => {
    expect(
      shouldEmit({
        updatedAtIso: '2025-10-29T12:05:00.000Z',
        lastSyncIso: '2025-10-29T12:05:00.000Z',
        seenAtIso: '2025-10-29T12:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('returns false when updatedAt <= seenAt', () => {
    expect(
      shouldEmit({
        updatedAtIso: '2025-10-29T12:07:00.000Z',
        lastSyncIso: '2025-10-29T12:00:00.000Z',
        seenAtIso: '2025-10-29T12:08:00.000Z',
      }),
    ).toBe(false);
  });
});