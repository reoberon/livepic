// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createLivePic, LIVE_PIC_TAG } from './index.js';

describe('createLivePic without custom element registration', () => {
  it('throws instead of returning an unregistered element', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'customElements');
    Object.defineProperty(window, 'customElements', { configurable: true, value: undefined });

    try {
      expect(() => createLivePic({ sprite: '/sprite.webp' })).toThrow(
        `Cannot create LivePic with tag "${LIVE_PIC_TAG}": customElements is unavailable.`,
      );
    } finally {
      if (descriptor) Object.defineProperty(window, 'customElements', descriptor);
    }
  });
});
