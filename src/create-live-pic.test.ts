// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from 'vitest';
import { createLivePic, defineLivePic } from './index.js';

beforeAll(() => {
  defineLivePic();
});

describe('createLivePic', () => {
  it('sets provided options as attributes', () => {
    const element = createLivePic({
      sprite: '/sprite.webp',
      placeholder: '/placeholder.webp',
      gridSize: 7,
      size: 120,
      fps: 24,
      layoutTracking: 'frame',
      offscreenBehavior: 'continue',
    });

    expect(element.getAttribute('sprite')).toBe('/sprite.webp');
    expect(element.getAttribute('placeholder')).toBe('/placeholder.webp');
    expect(element.getAttribute('gridSize')).toBe('7');
    expect(element.getAttribute('size')).toBe('120');
    expect(element.getAttribute('fps')).toBe('24');
    expect(element.getAttribute('layoutTracking')).toBe('frame');
    expect(element.getAttribute('offscreenBehavior')).toBe('continue');
  });

  it('does not create attributes for omitted options', () => {
    const element = createLivePic({ sprite: '/sprite.webp' });

    expect(element.hasAttribute('placeholder')).toBe(false);
    expect(element.hasAttribute('gridSize')).toBe(false);
    expect(element.hasAttribute('size')).toBe(false);
    expect(element.hasAttribute('fps')).toBe(false);
    expect(element.hasAttribute('layoutTracking')).toBe(false);
    expect(element.hasAttribute('offscreenBehavior')).toBe(false);
  });

  it('does not create attributes for undefined options', () => {
    const element = createLivePic({
      sprite: '/sprite.webp',
      placeholder: undefined,
    });

    expect(element.hasAttribute('placeholder')).toBe(false);
  });
});
