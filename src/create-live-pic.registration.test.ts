// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createLivePic, LivePic, LIVE_PIC_TAG } from './index.js';

describe('createLivePic registration', () => {
  it('registers and creates a disconnected LivePic element', () => {
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();

    const element = createLivePic({ sprite: '/sprite.webp' });

    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
    expect(element).toBeInstanceOf(LivePic);
    expect(element.localName).toBe(LIVE_PIC_TAG);
    expect(element.isConnected).toBe(false);
  });
});
