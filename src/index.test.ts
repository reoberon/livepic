import { JSDOM } from 'jsdom';
import { performance as nodePerformance } from 'node:perf_hooks';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FPS, DEFAULT_GRID_SIZE, DEFAULT_SIZE } from './livepic/constants.js';

let LivePic: typeof import('./index.js').LivePic;
let defineLivePic: typeof import('./index.js').defineLivePic;
let LIVE_PIC_TAG: typeof import('./index.js').LIVE_PIC_TAG;

describe('LivePic web component', () => {
  beforeEach(async () => {
    setupDom();
    await loadModule();
  });

  afterEach(() => {
    if (typeof document !== 'undefined') {
      document.body.innerHTML = '';
    }
    vi.restoreAllMocks();
    // @ts-expect-error cleanup globals
    delete globalThis.window;
    // @ts-expect-error cleanup globals
    delete globalThis.document;
    // @ts-expect-error cleanup globals
    delete globalThis.customElements;
    // @ts-expect-error cleanup globals
    delete globalThis.HTMLElement;
    // @ts-expect-error cleanup globals
    delete globalThis.DOMRect;
    // @ts-expect-error cleanup globals
    delete globalThis.performance;
    // @ts-expect-error cleanup globals
    delete globalThis.IntersectionObserver;
  });

  it('registers custom element', () => {
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();
    defineLivePic();
    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
    defineLivePic();
    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
  });

  it('auto-registers through browser entry', async () => {
    expect(customElements.get(LIVE_PIC_TAG)).toBeUndefined();
    await import('./browser.js');
    expect(customElements.get(LIVE_PIC_TAG)).toBe(LivePic);
  });

  it('check live-pic structure', () => {
    const el = createLivePic();
    const shadowRoot = el.shadowRoot;

    expect(shadowRoot).not.toBe(null);
    expect(shadowRoot!.querySelector('style')).not.toBe(null);
    expect(shadowRoot!.querySelector('.livepic')).not.toBe(null);
  });

  it('applies styles from attributes', async () => {
    const el = createLivePic();
    el.setAttribute('spriteSrc', '/sprite.webp');
    el.setAttribute('size', '80');
    el.setAttribute('gridSize', '3');
    el.getBoundingClientRect = () => new DOMRect(0, 0, 80, 80);

    document.body.appendChild(el);
    el.connectedCallback();

    expect(el.$el.style.width).toBe('80px');
    expect(el.$el.style.height).toBe('80px');
    expect(el.$el.style.backgroundSize).toContain('240px 240px');

    await el.loadSprite();
    expect(el.$el.style.backgroundImage).toContain('/sprite.webp');

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

  it('updates background position based on pointer', () => {
    const el = createLivePic();
    el.setAttribute('spriteSrc', '/sprite.webp');
    el.setAttribute('size', '100');
    el.setAttribute('gridSize', '5');
    el.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);

    document.body.appendChild(el);
    el.connectedCallback();

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
    const baseOptions = { size: 100, gridSize: 5, spriteSrc: '/sprite.webp', fps: 60 };
    const setupForCalc = () => {
      const el = createLivePic();
      el.options = { ...baseOptions };
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
      el.setAttribute('spriteSrc', '/img.png');

      const opts = el.collectOptions()[0];

      expect(opts).toEqual({
        size: DEFAULT_SIZE,
        gridSize: DEFAULT_GRID_SIZE,
        fps: DEFAULT_FPS,
        spriteSrc: '/img.png',
      });
    });

    it('get an error message when required spriteSrc attribute is missing', () => {
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
    el.options = { size: 100, gridSize: 5, spriteSrc: '/img.png', fps: 60 };
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

function setupDom() {
  // Ensure performance exists before jsdom touches it
  // @ts-expect-error assign globals for test env
  globalThis.performance ??= nodePerformance;

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
  });

  // @ts-expect-error assign globals for test env
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.customElements = dom.window.customElements;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.DOMRect = dom.window.DOMRect;
  globalThis.performance = dom.window.performance ?? nodePerformance;
  let tick = 0;
  vi.spyOn(globalThis.performance, 'now').mockImplementation(() => {
    tick += 1000;
    return tick;
  });
  // Minimal viewport values for calculations
  Object.assign(dom.window, { innerWidth: 800, innerHeight: 600 });
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;

  globalThis.requestAnimationFrame = vi.fn().mockReturnValue(1);
  globalThis.cancelAnimationFrame = vi.fn();
  Object.assign(dom.window, {
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  });

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
      // simulate async load success
      Promise.resolve().then(() => this.listeners.load?.forEach((fn) => fn()));
    }

    get src() {
      return this._src;
    }
  }

  // @ts-expect-error override global Image for test env
  globalThis.Image = dom.window.Image = MockImage;

  return dom;
}

async function loadModule() {
  vi.resetModules();
  const module = await import('./index.js');
  LivePic = module.LivePic;
  defineLivePic = module.defineLivePic;
  LIVE_PIC_TAG = module.LIVE_PIC_TAG;
}
