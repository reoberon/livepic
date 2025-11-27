import { Attribute, LivePicOptions, ImageLoadStatus } from './livepic/types.js';
import { DEFAULT_TAG, DEFAULT_SIZE } from './livepic/constants.js';
import { ATTRIBUTES } from './livepic/attributes.js';

export class ImageLoader {
  image: HTMLImageElement;
  status: ImageLoadStatus;

  constructor() {
    this.image = new Image();
    this.status = 'not_started';
  }

  inProgress() {
    return this.status === 'loading' || this.status === 'not_started';
  }

  async load(src: string) {
    this.status = 'loading';
    return new Promise<ImageLoadStatus>((resolve, reject) => {
      if (!src) {
        this.status = 'failed';
        return reject(this.status);
      }

      const onLoad = () => {
        this.image.removeEventListener('error', onError);

        if (this.status === 'aborted') {
          return reject(this.status);
        }

        this.status = 'loaded';
        resolve(this.status);
      };

      const onError = () => {
        this.image.removeEventListener('load', onLoad);
        this.image.src = '';
        this.status = 'failed';
        reject(this.status);
      };

      this.image.addEventListener('load', onLoad, { once: true });
      this.image.addEventListener('error', onError, { once: true });

      this.image.src = src;
    });
  }

  abort() {
    if (this.inProgress()) {
      this.status = 'aborted';
      this.image.src = '';
    }
  }
}

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
  errors: string[];
  sprite: ImageLoader;
  placeholder: ImageLoader | null;

  static activeInstances = new Set<LivePic>();
  static rafId: number | null = null;
  static pointerX: number | null = null;
  static pointerY: number | null = null;
  static pointerVersion = 0;
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
    this.errors = [];
    this.sprite = new ImageLoader();
    this.placeholder = null;

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
    [this.options, this.errors] = this.collectOptions();

    if (this.errors.length > 0) {
      this.fallback(this.errors.join('\n'));
      return;
    }

    this.initStyles();
    this.loadPlaceholder();
    this.loadSprite()
      .then(() => {
        this.observeVisibility();
        this.updateRect();
        this.startTracking();
      })
      .catch(() => {
        // Sprite loading failed, fallback already called in loadSprite()
      });
  }

  collectOptions() {
    type Attr = (typeof ATTRIBUTES)[number];

    type Options = {
      [A in Attr as A['name']]: A['type'] extends 'number' ? number : string;
    };

    const supportedAttributes: Attribute[] = ATTRIBUTES;
    const errors: string[] = [];

    const options = supportedAttributes.reduce<Options>((prev, attribute) => {
      const { value, error } = this.validateAttribute(attribute);

      if (error) {
        errors.push(error);
      }

      prev[attribute.name] = value;
      return prev;
    }, {} as Options);

    const res: [LivePicOptions, string[]] = [options as LivePicOptions, errors];
    return res;
  }

  tryFindAliasValue(attribute: Attribute) {
    if (!attribute.aliases) {
      return null;
    }

    for (const alias of attribute.aliases) {
      if (this.hasAttribute(alias)) {
        return this.getAttribute(alias)!;
      }
    }
    return null;
  }

  validateAttribute(attribute: Attribute): { value: number | string; error?: string } {
    const { name, defaultValue, type, required } = attribute;
    const fallbackValue = defaultValue ?? (type === 'number' ? NaN : '');
    const deprecated = 'deprecated' in attribute && attribute.deprecated === true;
    const rawValue = this.hasAttribute(name)
      ? this.getAttribute(name)
      : this.tryFindAliasValue(attribute);

    if (deprecated && rawValue !== null) {
      const replaces = attribute.replaces
        ? `Please use "${attribute.replaces}" instead.`
        : 'Check documentation for more information.';
      console.warn(`The "${name}" attribute is deprecated. ${replaces}`);
    }

    if (required && rawValue === null) {
      return {
        value: fallbackValue,
        error: `Required ${name} attribute was not provided`,
      };
    }

    switch (type) {
      case 'string': {
        const value = rawValue !== null ? rawValue : fallbackValue;
        return { value };
      }

      case 'number': {
        if (rawValue === null) {
          return { value: fallbackValue };
        }

        const value = Number(rawValue);
        if (Number.isNaN(value)) {
          return {
            value: fallbackValue,
            error: `Value of ${name} attribute is not a valid number`,
          };
        }

        return { value };
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

  loadPlaceholder() {
    const src = this.options!.placeholder;
    if (!src) return;

    this.placeholder = new ImageLoader();

    this.placeholder
      .load(src)
      .then(() => {
        this.$el.style.backgroundImage = `url(${src})`;
      })
      .catch(() => {
        console.warn(`Placeholder loading failed for src: ${src}`);
      });
  }

  async loadSprite() {
    const src = this.options!.sprite;
    return new Promise<void>((resolve, reject) => {
      this.sprite
        .load(src)
        .then(() => {
          const placeholder = this.placeholder;
          if (placeholder && placeholder.inProgress()) {
            placeholder.abort();
          }

          this.$el.style.backgroundImage = `url(${src})`;
          resolve();
        })
        .catch(() => {
          this.fallback('Sprite loading failed');
          reject();
        });
    });
  }

  fallback(message: string) {
    if (!this.$el) {
      console.error(message);
      return;
    }

    const size = this.options?.size ?? DEFAULT_SIZE;
    this.$el.style.width ||= `${size}px`;
    this.$el.style.height ||= `${size}px`;

    let errorEl = this.$el.querySelector('.error');
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

    // Check if position has changed before FPS throttling to avoid unnecessary lastFrameTime updates
    const pointerVersion = LivePic.pointerVersion;
    if (pointerVersion === this.lastPointerVersion && this.rectVersion === this.lastRectVersion)
      return;

    if (now - this.lastFrameTime < 1000 / this.options!.fps) return;
    this.lastFrameTime = now;

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

    // not the first instance, skip setting up shared listeners
    if (LivePic.activeInstances.size > 1) {
      return;
    }

    document.addEventListener('mousemove', LivePic.handlePointerMove);
    document.addEventListener('touchmove', LivePic.handlePointerMove, { passive: true });
    window.addEventListener('resize', LivePic.handleViewportChange);
    window.addEventListener('scroll', LivePic.handleViewportChange, { passive: true });

    LivePic.startLoop();
  }

  stopTracking() {
    if (!this.trackingActive) return;
    this.trackingActive = false;

    LivePic.activeInstances.delete(this);
    // other instances still active, skip removing shared listeners
    if (LivePic.activeInstances.size > 0) {
      return;
    }

    document.removeEventListener('mousemove', LivePic.handlePointerMove);
    document.removeEventListener('touchmove', LivePic.handlePointerMove);
    window.removeEventListener('resize', LivePic.handleViewportChange);
    window.removeEventListener('scroll', LivePic.handleViewportChange);

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
