import { Attribute, LivePicOptions } from './livepic/types.js';
import { DEFAULT_TAG, DEFAULT_SIZE } from './livepic/constants.js';
import { ATTRIBUTES } from './livepic/attributes.js';
import { ImageLoader } from './livepic/image-loader.js';

export { ImageLoader };

export class LivePic extends HTMLElement {
  $el: HTMLElement;
  lastFrameTime = 0;
  maxDistanceX: number | null = null;
  maxDistanceY: number | null = null;
  rect: DOMRect | null = null;
  isVisible = false;
  rectUpdateQueued = false;
  rectVersion = 0;
  lastRectVersion = -1;
  lastPointerVersion = -1;
  trackingActive = false;
  visibilityObserver: IntersectionObserver | null = null;
  options: LivePicOptions | null = null;
  errors: string[] = [];
  sprite = new ImageLoader();
  placeholder: ImageLoader | null = null;

  static activeInstances = new Set<LivePic>();
  static rafId: number | null = null;
  static pointerX: number | null = null;
  static pointerY: number | null = null;
  static pointerVersion = 0;
  static handleViewportChange = () => {
    LivePic.activeInstances.forEach((instance) => instance.scheduleRectUpdate());
    LivePic.startLoop();
  };
  static handlePointerMove = (e: MouseEvent | TouchEvent) => {
    const point = 'touches' in e ? e.touches[0] : e;
    LivePic.pointerX = point.clientX;
    LivePic.pointerY = point.clientY;
    LivePic.pointerVersion += 1;
    LivePic.startLoop();
  };

  static addSharedListeners() {
    document.addEventListener('mousemove', LivePic.handlePointerMove);
    document.addEventListener('touchmove', LivePic.handlePointerMove, { passive: true });
    window.addEventListener('resize', LivePic.handleViewportChange);
    window.addEventListener('scroll', LivePic.handleViewportChange, { passive: true });
  }

  static removeSharedListeners() {
    document.removeEventListener('mousemove', LivePic.handlePointerMove);
    document.removeEventListener('touchmove', LivePic.handlePointerMove);
    window.removeEventListener('resize', LivePic.handleViewportChange);
    window.removeEventListener('scroll', LivePic.handleViewportChange);
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

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
        const value = rawValue !== null ? rawValue : String(fallbackValue);
        if (attribute.values && !attribute.values.includes(value)) {
          return {
            value: fallbackValue,
            error: `Value of ${name} attribute must be one of: ${attribute.values.join(', ')}`,
          };
        }

        return { value };
      }

      case 'number': {
        if (rawValue === null) {
          return { value: fallbackValue };
        }

        const value = Number(rawValue);
        if (!Number.isFinite(value)) {
          return {
            value: fallbackValue,
            error: `Value of ${name} attribute is not a valid number`,
          };
        }

        if (attribute.integer && !Number.isInteger(value)) {
          return {
            value: fallbackValue,
            error: `Value of ${name} attribute must be an integer`,
          };
        }

        if (attribute.min !== undefined && value < attribute.min) {
          return {
            value: fallbackValue,
            error: `Value of ${name} attribute must be at least ${attribute.min}`,
          };
        }

        if (attribute.positive && value <= 0) {
          return {
            value: fallbackValue,
            error: `Value of ${name} attribute must be greater than 0`,
          };
        }

        if (attribute.odd && value % 2 !== 1) {
          return {
            value: fallbackValue,
            error: `Value of ${name} attribute must be an odd integer`,
          };
        }

        return { value };
      }
    }
  }

  initStyles() {
    const { size } = this.options!;

    this.$el.style.width = `${size}px`;
    this.$el.style.height = `${size}px`;
    this.$el.style.backgroundPosition = '50% 50%';
  }

  loadPlaceholder() {
    const { placeholder: src, size } = this.options!;
    if (!src) return;

    this.placeholder = new ImageLoader();

    this.placeholder
      .load(src)
      .then(() => {
        this.$el.style.backgroundSize = `${size}px ${size}px`;
        this.$el.style.backgroundImage = `url(${src})`;
      })
      .catch(() => {
        console.warn(`Placeholder loading failed for src: ${src}`);
      });
  }

  async loadSprite() {
    const { sprite: src, size, gridSize } = this.options!;
    return new Promise<void>((resolve, reject) => {
      this.sprite
        .load(src)
        .then(() => {
          const placeholder = this.placeholder;
          if (placeholder && placeholder.inProgress()) {
            placeholder.abort();
          }

          const spriteWidth = gridSize * size;
          this.$el.style.backgroundSize = `${spriteWidth}px ${spriteWidth}px`;
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

  updateFrame = (now = performance.now()): boolean => {
    if (!this.trackingActive) return false;

    const tracksLayoutEveryFrame = this.shouldTrackLayoutEveryFrame();
    if (tracksLayoutEveryFrame || this.rectUpdateQueued) {
      this.updateRect();
    }

    if (!this.canUpdateFrame()) return false;
    if (!this.frameStateChanged()) return tracksLayoutEveryFrame;
    if (this.isThrottled(now)) return true;

    this.applyFrame(now);
    return tracksLayoutEveryFrame;
  };

  shouldTrackLayoutEveryFrame(): boolean {
    return this.options!.layoutTracking === 'frame';
  }

  canUpdateFrame(): boolean {
    if (!this.isVisible) return false;
    if (document.visibilityState === 'hidden') return false;
    return LivePic.pointerX !== null && LivePic.pointerY !== null;
  }

  frameStateChanged(): boolean {
    return (
      LivePic.pointerVersion !== this.lastPointerVersion ||
      this.rectVersion !== this.lastRectVersion
    );
  }

  isThrottled(now: number): boolean {
    return now - this.lastFrameTime < 1000 / this.options!.fps;
  }

  applyFrame(now: number) {
    this.lastFrameTime = now;
    this.$el.style.backgroundPosition = this.calculatePosition(LivePic.pointerX, LivePic.pointerY);
    this.lastPointerVersion = LivePic.pointerVersion;
    this.lastRectVersion = this.rectVersion;
  }

  calculatePosition(pointerX = LivePic.pointerX, pointerY = LivePic.pointerY): string {
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
    if (this.trackingActive) {
      LivePic.startLoop();
      return;
    }

    this.trackingActive = true;
    LivePic.activeInstances.add(this);

    if (LivePic.activeInstances.size === 1) {
      LivePic.addSharedListeners();
    }

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

    LivePic.removeSharedListeners();

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
    LivePic.rafId = requestAnimationFrame(LivePic.runFrame);
  }

  static runFrame = () => {
    LivePic.rafId = null;

    const now = performance.now();
    let hasPendingFrame = false;
    LivePic.activeInstances.forEach((instance) => {
      hasPendingFrame = instance.updateFrame(now) || hasPendingFrame;
    });

    if (hasPendingFrame) {
      LivePic.startLoop();
    }
  };

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
