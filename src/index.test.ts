// @vitest-environment jsdom

import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ImageLoader, LivePic, defineLivePic, LIVE_PIC_TAG } from './index.js';
import { DEFAULT_FPS, DEFAULT_GRID_SIZE, DEFAULT_SIZE } from './livepic/constants.js';
import { Attribute, LivePicOptions } from './livepic/types.js';

const INVALID_URL = 'invalid-url';

beforeAll(() => {
  setViewportSize();
});

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

    await expect(loader.load(INVALID_URL)).rejects.toBe('failed');
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

describe('LivePic web component', () => {
  beforeEach(() => {
    resetLivePicStatics();
    mockFrameTiming();
    mockAnimationFrame();
    mockImageLoading();
  });

  afterEach(() => {
    cleanupLivePicTest();
  });

  it('registers custom element idempotently', () => {
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();

    expect(defineLivePic()).toBe(true);
    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);

    expect(() => defineLivePic()).not.toThrow();
    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
  });

  it('check live-pic structure', () => {
    const el = createLivePic();
    const shadowRoot = el.shadowRoot;

    expect(shadowRoot).not.toBe(null);
    expect(shadowRoot!.querySelector('style')).not.toBe(null);
    expect(shadowRoot!.querySelector('.livepic')).not.toBe(null);
  });

  it('finds alias attribute values', () => {
    const el = createLivePic();
    el.setAttribute('aliasname', 'aliasvalue');

    const attribute: Attribute = {
      name: 'realname',
      type: 'string',
      aliases: ['aliasname'],
    };

    expect(el.tryFindAliasValue(attribute)).toBe('aliasvalue');
  });

  it('warns about deprecated attribute usage', () => {
    const el = createLivePic();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const attribute: Attribute = {
      name: 'test',
      type: 'number',
      deprecated: true,
      replaces: 'newtest',
    };

    if (el.hasAttribute('test')) {
      el.removeAttribute('test');
    }

    el.validateAttribute(attribute);
    expect(console.warn).not.toBeCalled();

    el.setAttribute('test', 'yo');

    el.validateAttribute(attribute);
    expect(console.warn).toBeCalledWith(
      `The "test" attribute is deprecated. Please use "newtest" instead.`,
    );
  });

  it('warns about deprecated attribute without replacement info', () => {
    const el = createLivePic();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const attribute: Attribute = {
      name: 'oldattr',
      type: 'string',
      deprecated: true,
    };

    el.setAttribute('oldattr', 'somevalue');

    el.validateAttribute(attribute);
    expect(console.warn).toBeCalledWith(
      `The "oldattr" attribute is deprecated. Check documentation for more information.`,
    );
  });

  it('returns an error message when required attribute not provided', () => {
    const el = createLivePic();
    const attribute: Attribute = { name: 'test', type: 'number', required: true };

    if (el.hasAttribute('test')) {
      el.removeAttribute('test');
    }

    expect(el.validateAttribute(attribute)).toStrictEqual({
      value: NaN,
      error: `Required test attribute was not provided`,
    });

    el.setAttribute('test', '123');
    expect(el.validateAttribute(attribute)).toStrictEqual({ value: 123 });
  });

  it('returns default values for not provided attributes', () => {
    const el = createLivePic();
    if (el.hasAttribute('test')) {
      el.removeAttribute('test');
    }

    let attribute: Attribute = { name: 'test', type: 'number', defaultValue: 120 };
    expect(el.validateAttribute(attribute)).toStrictEqual({ value: 120 });

    attribute = { name: 'test', type: 'number' };
    expect(el.validateAttribute(attribute)).toStrictEqual({ value: NaN });

    attribute = { name: 'test', type: 'string', defaultValue: 'somevalue' };
    expect(el.validateAttribute(attribute)).toStrictEqual({ value: 'somevalue' });
  });

  it('correctly validates number attributes', () => {
    const el = createLivePic();
    if (el.hasAttribute('test')) {
      el.removeAttribute('test');
    }

    const attribute: Attribute = { name: 'test', type: 'number' };
    expect(el.validateAttribute(attribute)).toStrictEqual({ value: NaN });

    el.setAttribute('test', '123');
    expect(el.validateAttribute(attribute)).toStrictEqual({ value: 123 });

    el.setAttribute('test', 'not a number');
    expect(el.validateAttribute(attribute)).toStrictEqual({
      value: NaN,
      error: `Value of test attribute is not a valid number`,
    });

    el.setAttribute('test', 'Infinity');
    expect(el.validateAttribute(attribute)).toStrictEqual({
      value: NaN,
      error: `Value of test attribute is not a valid number`,
    });
  });

  it('validates constrained string attributes', () => {
    const el = createLivePic();
    const attribute: Attribute = {
      name: 'test',
      type: 'string',
      defaultValue: 'static',
      values: ['static', 'frame'],
    };

    el.setAttribute('test', 'frame');
    expect(el.validateAttribute(attribute)).toStrictEqual({ value: 'frame' });

    el.setAttribute('test', 'always');
    expect(el.validateAttribute(attribute)).toStrictEqual({
      value: 'static',
      error: `Value of test attribute must be one of: static, frame`,
    });
  });

  it('validates constrained number attributes', () => {
    const el = createLivePic();

    el.setAttribute('test', '1.5');
    expect(el.validateAttribute({ name: 'test', type: 'number', integer: true })).toStrictEqual({
      value: NaN,
      error: `Value of test attribute must be an integer`,
    });

    el.setAttribute('test', '2');
    expect(el.validateAttribute({ name: 'test', type: 'number', min: 3 })).toStrictEqual({
      value: NaN,
      error: `Value of test attribute must be at least 3`,
    });

    el.setAttribute('test', '0');
    expect(el.validateAttribute({ name: 'test', type: 'number', positive: true })).toStrictEqual({
      value: NaN,
      error: `Value of test attribute must be greater than 0`,
    });

    el.setAttribute('test', '4');
    expect(el.validateAttribute({ name: 'test', type: 'number', odd: true })).toStrictEqual({
      value: NaN,
      error: `Value of test attribute must be an odd integer`,
    });
  });

  it('rejects invalid LivePic numeric attributes', () => {
    const el = createLivePic();
    el.setAttribute('sprite', '/sprite.webp');
    el.setAttribute('size', '-10');
    el.setAttribute('gridSize', '2');
    el.setAttribute('fps', '0');

    const [, errors] = el.collectOptions();

    expect(errors).toEqual([
      'Value of size attribute must be at least 1',
      'Value of gridSize attribute must be at least 3',
      'Value of fps attribute must be greater than 0',
    ]);
  });

  it("doesn't fallback if all required attributes provided correctly", async () => {
    const el = createLivePic();
    el.setAttribute('sprite', '/sprite.webp');
    el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);

    document.body.appendChild(el);
    el.connectedCallback();

    // Wait for the async loadSprite() operation to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    const shadowRoot = el.shadowRoot!;
    expect(shadowRoot.querySelector('.error')).toBe(null);
  });

  it('applies styles from attributes', async () => {
    const el = createLivePic();
    el.setAttribute('sprite', '/sprite.webp');
    el.setAttribute('size', '80');
    el.setAttribute('gridSize', '3');
    el.getBoundingClientRect = () => new DOMRect(0, 0, 80, 80);

    document.body.appendChild(el);
    el.connectedCallback();

    // Wait for sprite load to apply sprite sizing/background
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(el.$el.style.width).toBe('80px');
    expect(el.$el.style.height).toBe('80px');
    expect(el.$el.style.backgroundSize).toBe('240px 240px');
    expect(el.$el.style.backgroundImage).toContain('sprite.webp');

    el.disconnectedCallback();
  });

  it('shows error overlay without destroying structure on fallback', () => {
    const el = createLivePic();
    el.fallback('Test error');

    const shadowRoot = el.shadowRoot!;
    expect(shadowRoot.querySelector('.error')).not.toBe(null);
    expect(shadowRoot.querySelector('.error')!.textContent).toBe('Test error');

    // Structure should not be destroyed
    expect(shadowRoot.querySelector('.livepic')).not.toBe(null);
    expect(shadowRoot.querySelector('style')).not.toBe(null);
  });

  describe('placeholder loading', () => {
    it('loads placeholder and sets background image before sprite loads', async () => {
      const el = createLivePic();
      el.setAttribute('size', '100');
      el.setAttribute('gridSize', '5');
      el.setAttribute('sprite', '/sprite.webp');
      el.setAttribute('placeholder', '/placeholder.webp');
      el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);

      // Initialize options but call loadPlaceholder directly to test it in isolation
      [el.options] = el.collectOptions();
      el.initStyles();
      el.loadPlaceholder();

      // Wait for placeholder to load
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(el.$el.style.backgroundImage).toContain('placeholder.webp');
      expect(el.$el.style.backgroundSize).toContain('100px 100px');

      // Now load sprite to ensure it replaces placeholder
      await el.loadSprite();
      expect(el.$el.style.backgroundImage).toContain('sprite.webp');
      expect(el.$el.style.backgroundSize).toBe('500px 500px');
    });

    it('warns when placeholder loading fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const el = createLivePic();
      el.setAttribute('sprite', '/sprite.webp');
      el.setAttribute('placeholder', INVALID_URL);
      el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);

      document.body.appendChild(el);
      el.connectedCallback();

      // Wait for placeholder loading to fail
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Placeholder loading failed'));
    });

    it('aborts placeholder loading when sprite loads', async () => {
      const el = createLivePic();
      el.setAttribute('size', '100');
      el.setAttribute('gridSize', '5');
      el.setAttribute('sprite', '/sprite.webp');
      el.setAttribute('placeholder', '/placeholder.webp');
      el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);

      document.body.appendChild(el);
      el.connectedCallback();

      // Wait for sprite to load (aborts placeholder if still in progress)
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Sprite should be loaded and background image should be sprite
      expect(el.$el.style.backgroundImage).toContain('sprite.webp');
      expect(el.$el.style.backgroundSize).toBe('500px 500px');
    });

    it('does not load placeholder when not provided', () => {
      const el = createLivePic();
      el.setAttribute('sprite', '/sprite.webp');
      el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);

      // Initialize options before calling loadPlaceholder
      [el.options] = el.collectOptions();
      el.loadPlaceholder();

      expect(el.placeholder).toBeNull();
    });
  });

  describe('static animation loop', () => {
    it('starts the shared animation loop', () => {
      expect(LivePic.rafId).toBeNull();

      LivePic.startLoop();

      expect(LivePic.rafId).not.toBeNull();
      expect(requestAnimationFrame).toHaveBeenCalled();

      // Clean up
      LivePic.stopLoop();
    });

    it('stops the shared animation loop', () => {
      LivePic.startLoop();
      expect(LivePic.rafId).not.toBeNull();

      LivePic.stopLoop();

      expect(LivePic.rafId).toBeNull();
      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('does not start multiple loops', () => {
      LivePic.startLoop();
      const firstRafId = LivePic.rafId;

      LivePic.startLoop();

      expect(LivePic.rafId).toBe(firstRafId);

      // Clean up
      LivePic.stopLoop();
    });

    it('does not keep the animation loop alive when there is no pending work', () => {
      const frames: FrameRequestCallback[] = [];
      vi.mocked(requestAnimationFrame).mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });

      LivePic.startLoop();
      expect(frames).toHaveLength(1);

      frames[0](0);

      expect(LivePic.rafId).toBeNull();
      expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    });

    it('reschedules the animation loop when an update is throttled by fps', () => {
      const frames: FrameRequestCallback[] = [];
      vi.mocked(requestAnimationFrame).mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });

      const el = createLivePic();
      el.options = livePicOptions();
      el.rect = new DOMRect(0, 0, 100, 100);
      el.maxDistanceX = 800;
      el.maxDistanceY = 600;
      el.isVisible = true;
      el.trackingActive = true;
      el.lastFrameTime = Number.MAX_SAFE_INTEGER;
      LivePic.pointerX = 800;
      LivePic.pointerY = 600;
      LivePic.pointerVersion = 1;
      LivePic.activeInstances.add(el);

      LivePic.startLoop();
      frames[0](0);

      expect(frames).toHaveLength(2);
      expect(LivePic.rafId).toBe(2);

      LivePic.activeInstances.clear();
      LivePic.stopLoop();
    });

    it('handles stopLoop when not running', () => {
      LivePic.rafId = null;

      // Should not throw
      LivePic.stopLoop();

      expect(LivePic.rafId).toBeNull();
    });
  });

  it('updates background position based on pointer', async () => {
    const el = createLivePic();
    el.setAttribute('sprite', '/sprite.webp');
    el.setAttribute('size', '100');
    el.setAttribute('gridSize', '5');
    el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);

    document.body.appendChild(el);
    el.connectedCallback();

    // Wait for the async loadSprite() operation to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate pointer at bottom-right corner
    LivePic.pointerX = 800;
    LivePic.pointerY = 600;
    el.rect = new DOMRect(0, 0, 100, 100);
    el.maxDistanceX = 800;
    el.maxDistanceY = 600;
    el.isVisible = true;
    el.updateFrame();

    expect(el.$el.style.backgroundPosition).toBe('100% 100%');
    el.disconnectedCallback();
  });

  describe('calculatePosition', () => {
    const setupForCalc = () => {
      const el = createLivePic();
      el.options = livePicOptions({ sprite: '/sprite.webp' });
      el.rect = new DOMRect(0, 0, 100, 100);
      el.maxDistanceX = 400;
      el.maxDistanceY = 300;
      return el;
    };

    it('returns center frame when pointer is at element center', () => {
      const el = setupForCalc();
      LivePic.pointerX = 50;
      LivePic.pointerY = 50;

      expect(el.calculatePosition()).toBe('50% 50%');
    });

    it('clamps to first frame when pointer is far above/left', () => {
      const el = setupForCalc();
      LivePic.pointerX = -500;
      LivePic.pointerY = -500;

      expect(el.calculatePosition()).toBe('0% 0%');
    });

    it('maps half-way distance to the correct grid cell', () => {
      const el = setupForCalc();
      const centerX = el.rect!.left + el.rect!.width / 2;
      const centerY = el.rect!.top + el.rect!.height / 2;
      LivePic.pointerX = centerX + el.maxDistanceX! / 2;
      LivePic.pointerY = centerY + el.maxDistanceY! / 2;

      expect(el.calculatePosition()).toBe('75% 75%');
    });
  });

  describe('options and geometry', () => {
    it('collects defaults and required attributes', () => {
      const el = createLivePic();
      el.setAttribute('sprite', '/img.png');

      const opts = el.collectOptions()[0];

      expect(opts).toMatchObject({
        size: DEFAULT_SIZE,
        placeholder: '',
        gridSize: DEFAULT_GRID_SIZE,
        fps: DEFAULT_FPS,
        sprite: '/img.png',
      });
    });

    it('uses static layout tracking by default', () => {
      const el = createLivePic();
      el.setAttribute('sprite', '/img.png');

      const opts = el.collectOptions()[0];

      expect(opts.layoutTracking).toBe('static');
    });

    it('get an error message when required sprite attribute is missing', () => {
      const el = createLivePic();
      expect(el.collectOptions()[1].length).toBeGreaterThan(0);
    });

    it('computes rect info and visibility', () => {
      const el = createLivePic();
      el.$el.getBoundingClientRect = () => new DOMRect(100, 50, 100, 100);

      el.updateRect();

      expect(el.maxDistanceX).toBe(600); // max(100, 800 - 200)
      expect(el.maxDistanceY).toBe(450); // max(50, 600 - 150)
      expect(el.isVisible).toBe(true);
    });
  });

  it('skips frame update when not visible', () => {
    const el = createLivePic();
    el.options = livePicOptions();
    el.rect = new DOMRect(0, 0, 100, 100);
    el.maxDistanceX = 800;
    el.maxDistanceY = 600;
    LivePic.pointerX = 800;
    LivePic.pointerY = 600;
    el.trackingActive = true;
    el.isVisible = false;

    const calcSpy = vi.spyOn(el, 'calculatePosition');
    el.updateFrame();

    expect(calcSpy).not.toHaveBeenCalled();
  });

  it('refreshes geometry every frame when layoutTracking is frame', () => {
    const el = createLivePic();
    el.options = livePicOptions({ layoutTracking: 'frame' });
    el.rect = new DOMRect(0, 0, 100, 100);
    el.maxDistanceX = 800;
    el.maxDistanceY = 600;
    el.trackingActive = true;
    el.isVisible = true;
    el.$el.getBoundingClientRect = vi.fn(() => new DOMRect(700, 500, 100, 100));
    LivePic.pointerX = 800;
    LivePic.pointerY = 600;
    LivePic.pointerVersion = 1;

    const shouldContinue = el.updateFrame(1000);

    expect(el.$el.getBoundingClientRect).toHaveBeenCalled();
    expect(el.$el.style.backgroundPosition).toBe('50% 50%');
    expect(shouldContinue).toBe(true);
  });

  it('reacts to IntersectionObserver visibility changes', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let ioCallback: IntersectionObserverCallback | undefined;

    // @ts-expect-error override global IntersectionObserver
    globalThis.IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) {
        ioCallback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds: ReadonlyArray<number> = [];
    };
    // ensure window also sees the mock
    globalThis.window.IntersectionObserver = globalThis.IntersectionObserver;

    const el = createLivePic();
    const startSpy = vi.spyOn(el, 'startTracking');
    const stopSpy = vi.spyOn(el, 'stopTracking');
    const scheduleRectUpdateSpy = vi.spyOn(el, 'scheduleRectUpdate');

    el.observeVisibility();
    expect(observe).toHaveBeenCalledWith(el);
    const mockObserver = el['visibilityObserver']!;

    ioCallback?.([{ isIntersecting: false } as IntersectionObserverEntry], mockObserver);
    expect(el.isVisible).toBe(false);
    expect(stopSpy).toHaveBeenCalled();

    ioCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], mockObserver);
    expect(el.isVisible).toBe(true);
    expect(scheduleRectUpdateSpy).toHaveBeenCalled();
    expect(startSpy).toHaveBeenCalled();
  });
});

function createLivePic() {
  defineLivePic();
  return new LivePic();
}

function livePicOptions(overrides: Partial<LivePicOptions> = {}): LivePicOptions {
  return {
    size: 100,
    gridSize: 5,
    sprite: '/img.png',
    fps: 60,
    layoutTracking: 'static',
    ...overrides,
  };
}

function setViewportSize() {
  Object.assign(window, { innerWidth: 800, innerHeight: 600 });
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
}

function mockFrameTiming() {
  let tick = 0;
  vi.spyOn(globalThis.performance, 'now').mockImplementation(() => {
    tick += 1000;
    return tick;
  });
}

function mockAnimationFrame() {
  globalThis.requestAnimationFrame = vi.fn().mockReturnValue(1);
  globalThis.cancelAnimationFrame = vi.fn();
  Object.assign(window, {
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  });
}

function mockImageLoading() {
  // @ts-expect-error override global Image for test env
  globalThis.Image = window.Image = MockImage;
}

class MockImage {
  private _src = '';
  private listeners: Record<string, Array<() => void>> = { load: [], error: [] };

  addEventListener(event: 'load' | 'error', cb: () => void) {
    this.listeners[event]?.push(cb);
  }

  removeEventListener(event: 'load' | 'error', cb: () => void) {
    this.listeners[event] = (this.listeners[event] ?? []).filter((fn) => fn !== cb);
  }

  set src(value: string) {
    this._src = value;

    if (value === INVALID_URL) {
      // simulate async load failure
      Promise.reject().catch(() => this.listeners.error?.forEach((fn) => fn()));
      return;
    }

    // simulate async load success
    Promise.resolve().then(() => this.listeners.load?.forEach((fn) => fn()));
  }

  get src() {
    return this._src;
  }
}

function cleanupLivePicTest() {
  document.body.innerHTML = '';
  LivePic.stopLoop();
  resetLivePicStatics();
  vi.restoreAllMocks();
}

function resetLivePicStatics() {
  LivePic.activeInstances.clear();
  LivePic.rafId = null;
  LivePic.pointerX = null;
  LivePic.pointerY = null;
  LivePic.pointerVersion = 0;
}
