// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createLivePic, LivePic, LIVE_PIC_TAG } from './index.js';
import { DEFAULT_FPS, DEFAULT_GRID_SIZE, DEFAULT_SIZE } from './livepic/constants.js';

describe('createLivePic', () => {
  it('registers and creates a disconnected LivePic element', () => {
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();

    const element = createLivePic({ sprite: '/sprite.webp' });

    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
    expect(element).toBeInstanceOf(LivePic);
    expect(element.isConnected).toBe(false);
  });

  it('sets provided options as attributes', () => {
    const element = createLivePic({
      sprite: '/sprite.webp',
      placeholder: '/placeholder.webp',
      gridSize: 7,
      size: 120,
      fps: 24,
      layoutTracking: 'frame',
    });

    expect(element.getAttribute('sprite')).toBe('/sprite.webp');
    expect(element.getAttribute('placeholder')).toBe('/placeholder.webp');
    expect(element.getAttribute('gridSize')).toBe('7');
    expect(element.getAttribute('size')).toBe('120');
    expect(element.getAttribute('fps')).toBe('24');
    expect(element.getAttribute('layoutTracking')).toBe('frame');
  });

  it('leaves omitted options to the component defaults', () => {
    const element = createLivePic({ sprite: '/sprite.webp' });

    expect(element.hasAttribute('placeholder')).toBe(false);
    expect(element.hasAttribute('gridSize')).toBe(false);
    expect(element.hasAttribute('size')).toBe(false);
    expect(element.hasAttribute('fps')).toBe(false);
    expect(element.hasAttribute('layoutTracking')).toBe(false);
    expect(element.collectOptions()[0]).toEqual({
      sprite: '/sprite.webp',
      placeholder: '',
      gridSize: DEFAULT_GRID_SIZE,
      size: DEFAULT_SIZE,
      fps: DEFAULT_FPS,
      layoutTracking: 'static',
    });
  });

  it('does not create attributes for undefined options', () => {
    const element = createLivePic({
      sprite: '/sprite.webp',
      placeholder: undefined,
    });

    expect(element.hasAttribute('placeholder')).toBe(false);
  });
});
