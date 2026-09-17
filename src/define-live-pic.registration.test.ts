// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { defineLivePic, LivePic, LIVE_PIC_TAG } from './index.js';

describe('defineLivePic registration', () => {
  it('registers the default custom element idempotently', () => {
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();

    expect(defineLivePic()).toBe(true);
    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);

    expect(() => defineLivePic()).not.toThrow();
    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
  });
});
