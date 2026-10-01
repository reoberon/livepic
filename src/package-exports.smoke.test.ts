// @vitest-environment jsdom

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import * as root from 'livepic';
import * as legacy from 'livepic/dist/index.js';

describe('package compatibility exports', () => {
  it('preserves the legacy root entry and ImageLoader constructor', async () => {
    const { ImageLoadTask } = await import('../dist/livepic/image-load-task.js');
    const loader: root.ImageLoader = new legacy.ImageLoader();
    const legacyLoader: legacy.ImageLoader = loader;

    expect(legacy).toBe(root);
    expect(root.ImageLoader).toBe(ImageLoadTask);
    expect(legacyLoader).toBeInstanceOf(ImageLoadTask);
    expect(loader.status).toBe('not_started');
  });

  it('auto-registers through the legacy browser entry', async () => {
    expect(customElements.get(root.LIVE_PIC_TAG)).toBeUndefined();

    const legacyBrowser = await import('livepic/dist/browser.js');
    const browser = await import('livepic/browser');

    expect(legacyBrowser).toBe(browser);
    expect(customElements.get(root.LIVE_PIC_TAG)).toBe(root.LivePic);
  });

  it('resolves declarations and supports ImageLoader as a TypeScript type', () => {
    const diagnostics = execFileSync(process.execPath, [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'es2022',
      '--module',
      'NodeNext',
      'src/package-exports.smoke.test.ts',
    ]);

    expect(diagnostics.toString()).toBe('');
  });
});
