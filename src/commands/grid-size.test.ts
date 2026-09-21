import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseGridSize } from './grid-size.js';

describe('parseGridSize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([3, '3', 5, '7'])('accepts a supported grid size: %s', (value) => {
    expect(parseGridSize(value)).toBe(Number(value));
  });

  it.each([undefined, '', 'abc', -1, 0, 1, '1', 2, 4, 3.5, NaN, Infinity])(
    'rejects an unsupported grid size: %s',
    (value) => {
      const exitError = new Error('Invalid grid size caused process.exit');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw exitError;
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => parseGridSize(value)).toThrow(exitError);
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        `Invalid grid size: ${value}. Expected an odd integer >= 3.`,
      );
    },
  );
});
