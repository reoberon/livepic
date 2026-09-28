// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createLivePic, LIVE_PIC_TAG } from './index.js';

class ForeignLivePic extends HTMLElement {}

describe('createLivePic with an occupied tag', () => {
  it('rejects a tag registered to another constructor', () => {
    customElements.define(LIVE_PIC_TAG, ForeignLivePic);

    expect(() => createLivePic({ sprite: '/sprite.webp' })).toThrow(
      `Cannot register LivePic with tag "${LIVE_PIC_TAG}": it is already registered to ForeignLivePic, expected LivePic.`,
    );
    expect(customElements.get(LIVE_PIC_TAG)).toBe(ForeignLivePic);
  });
});
