// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createLivePic, defineLivePic, LivePic, LIVE_PIC_TAG } from './index.js';

describe('defineLivePic failed registration', () => {
  it('allows the factory to register the default tag after an invalid tag is rejected', () => {
    expect(() => defineLivePic('invalid')).toThrow();

    const element = createLivePic({ sprite: '/sprite.webp' });

    expect(element).toBeInstanceOf(LivePic);
    expect(element.localName).toBe(LIVE_PIC_TAG);
    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
    expect(customElements.get('invalid')).toBeUndefined();
  });
});
