// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { LivePic, defineLivePic } from './index.js';

describe('defineLivePic custom tag registration', () => {
  it('registers the custom element with a custom tag', () => {
    const tag = 'custom-live-pic';

    expect(customElements.get(tag)).toBeUndefined();
    expect(defineLivePic(tag)).toBe(true);
    expect(customElements.get(tag)).toBe(LivePic);
  });
});
