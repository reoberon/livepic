// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createLivePic, defineLivePic, LivePic, LIVE_PIC_TAG } from './index.js';

describe('defineLivePic default tag conflict', () => {
  it('rejects a custom tag after the factory registers the default tag', () => {
    createLivePic({ sprite: '/sprite.webp' });
    const tag = 'interactive-portrait';

    expect.soft(() => defineLivePic(tag)).toThrow(new RegExp(`(?=.*${tag})(?=.*${LIVE_PIC_TAG})`));

    expect(customElements.get(tag)).toBeUndefined();
    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
    expect(createLivePic({ sprite: '/sprite.webp' }).localName).toBe(LIVE_PIC_TAG);
  });
});
