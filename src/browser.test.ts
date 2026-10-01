// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { LivePic, LIVE_PIC_TAG } from './index.js';

describe('browser entry', () => {
  it('auto-registers custom element', async () => {
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();

    await import('./browser.js');

    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
  });
});
