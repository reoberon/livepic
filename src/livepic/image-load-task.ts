import { ImageLoadStatus } from './types.js';

export class ImageLoadTask {
  image: HTMLImageElement = new Image();
  status: ImageLoadStatus = 'not_started';

  inProgress(): boolean {
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
