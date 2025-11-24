import { Attribute, LivePicOptions } from './livepic/types.js';
import { DEFAULT_TAG } from './livepic/constants.js';
import { ATTRIBUTES } from './livepic/attributes.js';

export class LivePic extends HTMLElement {
  $el: HTMLElement;
  lastFrameTime: number;
  rafId: number | null;
  pointerX: number | null;
  pointerY: number | null;
  maxDistanceX: number | null;
  maxDistanceY: number | null;
  rect: DOMRect | null;
  isVisible: boolean;
  trackingActive: boolean;
  visibilityObserver: IntersectionObserver | null;
  options: LivePicOptions | null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });

    this.lastFrameTime = 0;
    this.rafId = null;
    this.pointerX = null;
    this.pointerY = null;
    this.maxDistanceX = null;
    this.maxDistanceY = null;
    this.rect = null;
    this.isVisible = false;
    this.trackingActive = false;
    this.visibilityObserver = null;
    this.options = null;

    this.$el = document.createElement('div');
    this.$el.classList.add('livepic');

    const style = document.createElement('style');
    style.innerText = `.livepic { overflow: hidden; aspect-ratio: 1; }`;

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
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML = `<p style="color: red;">${message}</p>`;
    } else {
      console.error(message);
    }
  }

  disconnectedCallback() {
    this.stopTracking();

    if (this.visibilityObserver) {
      this.visibilityObserver.disconnect();
      this.visibilityObserver = null;
    }
  }

  handleTouch = (e: TouchEvent) => {
    const touch = e.touches[0];
    this.updateCoordinates(touch);
  };

  updateCoordinates = (e: MouseEvent | Touch) => {
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
  };

  updateRect = () => {
    this.rect = this.$el.getBoundingClientRect();
    const { left, right, top, bottom } = this.rect;

    this.maxDistanceX = Math.max(left, innerWidth - right);
    this.maxDistanceY = Math.max(top, innerHeight - bottom);

    this.isVisible = this.updateVisability();
  };

  updateVisability = () => this.horizontallyVisible() && this.verticallyVisible();
  horizontallyVisible = () => this.rect!.right >= 0 && this.rect!.left <= window.innerWidth;
  verticallyVisible = () => this.rect!.bottom >= 0 && this.rect!.top <= window.innerHeight;

  updateFrame = () => {
    if (!this.trackingActive) {
      this.rafId = null;
      return;
    }

    this.rafId = requestAnimationFrame(this.updateFrame);

    if (!this.isVisible) return;
    if (this.pointerX === null || this.pointerY === null) return;
    if (document.visibilityState === 'hidden') return;

    const now = performance.now();
    if (now - this.lastFrameTime < 1000 / this.options!.fps) return;
    this.lastFrameTime = now;

    this.$el.style.backgroundPosition = this.calculatePosition();
  };

  calculatePosition() {
    const { left, top, width, height } = this.rect!;
    const centerX = left + width / 2;
    const centerY = top + height / 2;

    const deltaX = this.pointerX! - centerX;
    const deltaY = this.pointerY! - centerY;

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
    window.addEventListener('resize', this.updateRect);
    window.addEventListener('scroll', this.updateRect, { passive: true });
    document.addEventListener('mousemove', this.updateCoordinates);
    document.addEventListener('touchmove', this.handleTouch, { passive: true });
    this.updateRect();

    if (this.rafId === null) {
      this.updateFrame();
    }
  }

  stopTracking() {
    if (!this.trackingActive) return;

    window.removeEventListener('resize', this.updateRect);
    window.removeEventListener('scroll', this.updateRect);
    document.removeEventListener('mousemove', this.updateCoordinates);
    document.removeEventListener('touchmove', this.handleTouch);
    this.trackingActive = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
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
          this.updateRect();
          this.startTracking();
        } else {
          this.stopTracking();
        }
      },
      { threshold: 0 },
    );

    this.visibilityObserver.observe(this);
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
