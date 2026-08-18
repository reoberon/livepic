export const INVALID_IMAGE_SRC = 'invalid-url';

export function mockImageLoading() {
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

    if (value === INVALID_IMAGE_SRC) {
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
