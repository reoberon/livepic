import { Attribute, LivePicOptions } from './livepic/types.js';
import { DEFAULT_TAG } from './livepic/constants.js';
import { ATTRIBUTES } from './livepic/attributes.js';

export class LivePic extends HTMLElement {
  $el: HTMLElement;
  lastFrameTime: number;
  maxDistanceX: number | null;
  maxDistanceY: number | null;
  rect: DOMRect | null;
  isVisible: boolean;
  rectUpdateQueued: boolean;
  rectVersion: number;
  lastRectVersion: number;
  lastPointerVersion: number;
  trackingActive: boolean;
  visibilityObserver: IntersectionObserver | null;
  options: LivePicOptions | null;

  static activeInstances = new Set<LivePic>();
  static rafId: number | null = null;
  static pointerX: number | null = null;
  static pointerY: number | null = null;
  static pointerVersion = 0;
  static viewportListenersAttached = false;
  static handleViewportChange = () => {
    LivePic.activeInstances.forEach((instance) => instance.scheduleRectUpdate());
  };
  static handlePointerMove = (e: MouseEvent | TouchEvent) => {
    const point = 'touches' in e ? e.touches[0] : e;
    LivePic.pointerX = point.clientX;
    LivePic.pointerY = point.clientY;
    LivePic.pointerVersion += 1;
  };

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    this.lastFrameTime = 0;
    this.maxDistanceX = null;
    this.maxDistanceY = null;
    this.rect = null;
    this.isVisible = false;
    this.rectUpdateQueued = false;
    this.rectVersion = 0;
    this.lastRectVersion = -1;
    this.lastPointerVersion = -1;
    this.trackingActive = false;
    this.visibilityObserver = null;
    this.options = null;

    this.$el = document.createElement('div');
    this.$el.classList.add('livepic');

    const style = document.createElement('style');
    style.textContent = `
      .livepic { overflow: hidden; aspect-ratio: 1; position: relative; }
      .error {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.7);
        color: #ff4444;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        font-weight: bold;
        text-align: center;
        padding: 10px;
        box-sizing: border-box;
        pointer-events: none;
      }
    `;

    shadow.append(this.$el, style);
  }

  connectedCallback() {
    this.options = this.collectOptions();
    this.initStyles();
    this.loadSprite();
    this.observeVisibility();
    this.updateRect();
    this.startTracking();
  }

  collectOptions() {
    const attributes: Attribute[] = ATTRIBUTES;

    type Attr = (typeof attributes)[number];

    type Options = {
      [A in Attr as A['name']]: A['type'] extends 'number' ? number : string;
    };

    const options = attributes.reduce<Options>((prev, attribute) => {
      prev[attribute.name] = this.validateAttribute(attribute);
      return prev;
    }, {} as Options);

    return options as LivePicOptions;
  }

  validateAttribute(attribute: Attribute) {
    const { name, defaultValue, type } = attribute;

    if (!this.hasAttribute(name)) {
      if (defaultValue === undefined) {
        throw new Error(`Required ${name} attribute was not provided`);
      }

      return defaultValue;
    }

    switch (type) {
      case 'string':
        return this.getAttribute(name)!;

      case 'number': {
        const value = Number(this.getAttribute(name));
        if (Number.isNaN(value)) {
          throw new Error(`Value of ${name} attribute is not a valid number`);
        }

        return value;
      }
    }
  }

  initStyles() {
    const { size, gridSize } = this.options!;
    const spriteWidth = gridSize * size;

    this.$el.style.width = `${size}px`;
    this.$el.style.height = `${size}px`;
    this.$el.style.backgroundSize = `${spriteWidth}px ${spriteWidth}px`;
    this.$el.style.backgroundPosition = '50% 50%';
  }

  async loadSprite() {
    return new Promise((resolve, reject) => {
      const sprite = new Image();
      const src = this.options?.spriteSrc;

      if (!src) {
        this.fallback('Sprite src is missing');
        return reject(new Error('Sprite src is missing'));
      }

      const handleLoad = () => {
        this.$el.style.backgroundImage = `url(${src})`;
        sprite.removeEventListener('error', handleError);
        resolve(src);
      };

      const handleError = () => {
        this.fallback('Sprite loading failed');
        sprite.removeEventListener('load', handleLoad);
        reject(src);
      };

      sprite.addEventListener('load', handleLoad, { once: true });
      sprite.addEventListener('error', handleError, { once: true });

      sprite.src = src;
    });
  }

  fallback(message: string) {
    if (!this.shadowRoot) {
      console.error(message);
      return;
    }

    let errorEl = this.shadowRoot.querySelector('.error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.classList.add('error');
      this.$el.appendChild(errorEl);
    }
    errorEl.textContent = message;
  }

  disconnectedCallback() {
    this.stopTracking();

    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
  }

  updateRect = () => {
    this.rectUpdateQueued = false;
    this.rectVersion += 1;
    this.rect = this.$el.getBoundingClientRect();
    const { left, right, top, bottom } = this.rect;

    this.maxDistanceX = Math.max(left, innerWidth - right);
    this.maxDistanceY = Math.max(top, innerHeight - bottom);

    this.isVisible = this.updateVisability();
  };

  updateVisability = () => this.horizontallyVisible() && this.verticallyVisible();
  horizontallyVisible = () => this.rect!.right >= 0 && this.rect!.left <= window.innerWidth;
  verticallyVisible = () => this.rect!.bottom >= 0 && this.rect!.top <= window.innerHeight;

  scheduleRectUpdate = () => {
    if (this.rectUpdateQueued) return;
    this.rectUpdateQueued = true;
  };

  updateFrame = (now = performance.now()) => {
    if (!this.trackingActive) return;

    if (this.rectUpdateQueued) {
      this.updateRect();
    }

    if (!this.isVisible) return;
    const pointerX = LivePic.pointerX;
    const pointerY = LivePic.pointerY;
    if (pointerX === null || pointerY === null) return;
    if (document.visibilityState === 'hidden') return;

    if (now - this.lastFrameTime < 1000 / this.options!.fps) return;
    this.lastFrameTime = now;

    const pointerVersion = LivePic.pointerVersion;
    if (pointerVersion === this.lastPointerVersion && this.rectVersion === this.lastRectVersion)
      return;

    this.$el.style.backgroundPosition = this.calculatePosition(pointerX, pointerY);
    this.lastPointerVersion = pointerVersion;
    this.lastRectVersion = this.rectVersion;
  };

  calculatePosition(pointerX = LivePic.pointerX, pointerY = LivePic.pointerY) {
    if (pointerX === null || pointerY === null) {
      return this.$el.style.backgroundPosition;
    }

    const { left, top, width, height } = this.rect!;
    const centerX = left + width / 2;
    const centerY = top + height / 2;

    const deltaX = pointerX - centerX;
    const deltaY = pointerY - centerY;

    const normX = Math.max(-1, Math.min(1, deltaX / this.maxDistanceX!));
    const normY = Math.max(-1, Math.min(1, deltaY / this.maxDistanceY!));

    const { gridSize } = this.options!;
    const frameX = Math.round(((normX + 1) / 2) * (gridSize - 1));
    const frameY = Math.round(((normY + 1) / 2) * (gridSize - 1));

    const posX = (frameX / (gridSize - 1)) * 100;
    const posY = (frameY / (gridSize - 1)) * 100;

    return `${posX}% ${posY}%`;
  }

  startTracking() {
    if (this.trackingActive) return;
    this.trackingActive = true;
    LivePic.activeInstances.add(this);

    // that's a first instance
    if (LivePic.activeInstances.size !== 1) {
      return;
    }

    document.addEventListener('mousemove', LivePic.handlePointerMove);
    document.addEventListener('touchmove', LivePic.handlePointerMove, { passive: true });
    if (!LivePic.viewportListenersAttached) {
      window.addEventListener('resize', LivePic.handleViewportChange);
      window.addEventListener('scroll', LivePic.handleViewportChange, { passive: true });
      LivePic.viewportListenersAttached = true;
    }
    LivePic.startLoop();
  }

  stopTracking() {
    if (!this.trackingActive) return;
    this.trackingActive = false;

    LivePic.activeInstances.delete(this);
    if (LivePic.activeInstances.size !== 0) {
      return;
    }

    document.removeEventListener('mousemove', LivePic.handlePointerMove);
    document.removeEventListener('touchmove', LivePic.handlePointerMove);
    if (LivePic.viewportListenersAttached) {
      window.removeEventListener('resize', LivePic.handleViewportChange);
      window.removeEventListener('scroll', LivePic.handleViewportChange);
      LivePic.viewportListenersAttached = false;
    }
    LivePic.pointerX = null;
    LivePic.pointerY = null;
    LivePic.stopLoop();
  }

  observeVisibility() {
    if (typeof window === 'undefined') return;

    if (!('IntersectionObserver' in window)) {
      this.isVisible = true;
      return;
    }

    this.visibilityObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const currentlyVisible = entry?.isIntersecting ?? false;
        this.isVisible = currentlyVisible;
        if (currentlyVisible) {
          this.scheduleRectUpdate();
          this.startTracking();
        } else {
          this.stopTracking();
        }
      },
      { threshold: 0 },
    );

    this.visibilityObserver.observe(this);
  }

  static startLoop() {
    if (LivePic.rafId !== null) return;
    const step = () => {
      LivePic.rafId = requestAnimationFrame(step);
      const now = performance.now();
      LivePic.activeInstances.forEach((instance) => instance.updateFrame(now));
    };
    step();
  }

  static stopLoop() {
    if (LivePic.rafId !== null) {
      cancelAnimationFrame(LivePic.rafId);
      LivePic.rafId = null;
    }
  }
}

export const LIVE_PIC_TAG = DEFAULT_TAG;

export function defineLivePic(tag = LIVE_PIC_TAG) {
  if (!isCustomElementsAvailable()) return false;
  if (!customElements.get(tag)) {
    customElements.define(tag, LivePic);
  }
  return true;
}

function isCustomElementsAvailable() {
  return typeof window !== 'undefined' && window.customElements;
}
