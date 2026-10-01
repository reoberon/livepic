// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createLivePic, defineLivePic, LivePic, LIVE_PIC_TAG } from './index.js';

describe('createLivePic custom tag registration', () => {
  it('creates a LivePic after custom tag registration', () => {
    defineLivePic('custom-live-pic');

    const element = createLivePic({ sprite: '/sprite.webp' });

    expect(element).toBeInstanceOf(LivePic);
    expect(element.localName).toBe('custom-live-pic');
    expect(element.getAttribute('sprite')).toBe('/sprite.webp');
    expect(element.isConnected).toBe(false);
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();
  });
});
