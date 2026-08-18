// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageLoader } from './image-loader.js';
import { INVALID_IMAGE_SRC, mockImageLoading } from '../../test-utils/image-loading.js';

describe('ImageLoader class', () => {
  beforeEach(() => {
    mockImageLoading();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inProgress returns correct status', () => {
    const loader = new ImageLoader();
    expect(loader.inProgress()).toBe(true); // not_started

    loader.status = 'loading';
    expect(loader.inProgress()).toBe(true);

    loader.status = 'loaded';
    expect(loader.inProgress()).toBe(false);

    loader.status = 'failed';
    expect(loader.inProgress()).toBe(false);

    loader.status = 'aborted';
    expect(loader.inProgress()).toBe(false);
  });

  it('loads image successfully', async () => {
    const loader = new ImageLoader();
    expect(loader.status).toBe('not_started');

    await loader.load('/test-image.webp');
    expect(loader.status).toBe('loaded');
    expect(loader.image.src).toContain('/test-image.webp');
  });

  it('handles image load failure when src not provided', async () => {
    const loader = new ImageLoader();

    await expect(loader.load('')).rejects.toBe('failed');
    expect(loader.status).toBe('failed');
    expect(loader.image.src).toBe('');
  });

  it('handles image load failure from the specified src', async () => {
    const loader = new ImageLoader();

    await expect(loader.load(INVALID_IMAGE_SRC)).rejects.toBe('failed');
    expect(loader.status).toBe('failed');
    expect(loader.image.src).toBe('');
  });

  it('aborts successfully', async () => {
    const loader = new ImageLoader();
    const loadPromise = loader.load('/test-image.webp');
    expect(loader.status).toBe('loading');

    loader.abort();
    await expect(loadPromise).rejects.toBe('aborted');
    expect(loader.status).toBe('aborted');
    expect(loader.image.src).toBe('');
  });

  it("doesn't abort when not in progress", () => {
    const loader = new ImageLoader();
    // Simulate completed state
    loader.status = 'loaded';
    loader.abort();
    expect(loader.status).toBe('loaded');
  });
});
