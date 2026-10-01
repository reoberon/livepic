// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createLivePic, defineLivePic, LivePic, LIVE_PIC_TAG } from './index.js';

describe('defineLivePic custom tag conflict', () => {
  it('rejects another tag and preserves the custom tag used by the factory', () => {
    const tag = 'interactive-portrait';
    const otherTag = 'animated-portrait';
    defineLivePic(tag);

    expect.soft(() => defineLivePic(otherTag)).toThrow(new RegExp(`(?=.*${tag})(?=.*${otherTag})`));

    expect(customElements.get(tag)).toBe(LivePic);
    expect(customElements.get(otherTag)).toBeUndefined();
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();
    expect(createLivePic({ sprite: '/sprite.webp' }).localName).toBe(tag);

    expect.soft(() => defineLivePic()).toThrow(new RegExp(`(?=.*${tag})(?=.*${LIVE_PIC_TAG})`));

    expect(customElements.get(tag)).toBe(LivePic);
    expect(customElements.get(otherTag)).toBeUndefined();
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();
    expect(createLivePic({ sprite: '/sprite.webp' }).localName).toBe(tag);
  });
});
