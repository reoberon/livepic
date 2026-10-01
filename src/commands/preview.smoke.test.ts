import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePath, startPreviewServer } from './preview.js';

describe('preview smoke', () => {
  it('resolves browser modules', () => {
    const resolved = resolvePath({
      pathname: '/dist/index.js',
      cwd: process.cwd(),
      spritePath: path.join(process.cwd(), 'output', 'AvatarSprite.webp'),
    });
    expect(resolved).toBeTruthy();
    expect(resolved && resolved.endsWith(path.join('dist', 'index.js'))).toBe(true);
  });

  it('serves HTML and assets', async ({ skip }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-'));
    const outputDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, 'sprite.json'),
      JSON.stringify({ gridSize: 3, pictureSize: 120 }),
    );
    fs.writeFileSync(path.join(outputDir, 'AvatarSprite.webp'), Buffer.from([0]));
    fs.writeFileSync(path.join(tmpDir, '.env'), 'REPLICATE_API_TOKEN=test-token');

    let server: Awaited<ReturnType<typeof startPreviewServer>> | undefined;

    try {
      try {
        server = await startPreviewServer({
          port: 0,
          cwd: tmpDir,
          open: false,
          exitOnError: false,
          host: '0.0.0.0',
        });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EACCES' || code === 'EPERM') {
          skip(`Port binding is not permitted in this environment (${code})`);
        }
        throw error;
      }

      const address = server.address();
      expect(typeof address === 'object' && address?.address).toBe('0.0.0.0');
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body.startsWith('<!DOCTYPE html>')).toBe(true);

      const scriptSrc = body.match(/<script type="module" src="([^"]+)"><\/script>/)?.[1] ?? '';
      expect(scriptSrc).toBe('/dist/browser.js');

      // Consume response bodies so keep-alive connections do not delay server shutdown.
      const jsRes = await fetch(`${baseUrl}${scriptSrc}`);
      expect(jsRes.status).toBe(200);
      await jsRes.arrayBuffer();

      for (const modulePath of [
        '/dist/index.js',
        '/dist/livepic/constants.js',
        '/dist/livepic/attributes.js',
        '/dist/livepic/image-load-task.js',
      ]) {
        const moduleResponse = await fetch(`${baseUrl}${modulePath}`);
        expect(moduleResponse.status).toBe(200);
        await moduleResponse.arrayBuffer();
      }

      const spriteRes = await fetch(`${baseUrl}/output/AvatarSprite.webp`);
      expect(spriteRes.status).toBe(200);
      await spriteRes.arrayBuffer();

      for (const privatePath of ['/.env', '/output/sprite.json', '/dist/cli.js']) {
        const privateResponse = await fetch(`${baseUrl}${privatePath}`);
        expect(privateResponse.status).toBe(404);
        expect(await privateResponse.text()).toBe('Not found');
      }
    } finally {
      try {
        const runningServer = server;
        if (runningServer) {
          await new Promise<void>((resolve, reject) => {
            runningServer.close((error?: Error) => (error ? reject(error) : resolve()));
          });
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });

  it('serves the included demo sprite without generated output', async ({ skip }) => {
    let server: Awaited<ReturnType<typeof startPreviewServer>> | undefined;

    try {
      try {
        server = await startPreviewServer({
          port: 0,
          cwd: process.cwd(),
          open: false,
          gridSize: 25,
          pictureSize: 150,
          spriteFile: 'docs/assets/AvatarSprite.webp',
          exitOnError: false,
        });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EACCES' || code === 'EPERM') {
          skip(`Port binding is not permitted in this environment (${code})`);
        }
        throw error;
      }

      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const htmlResponse = await fetch(baseUrl);
      expect(htmlResponse.status).toBe(200);
      const html = await htmlResponse.text();
      expect(html).toContain('sprite="/docs/assets/AvatarSprite.webp"');
      expect(html).toContain('gridSize="25" size="150"');
      expect(html).toContain('src="/dist/browser.js"');

      const spriteResponse = await fetch(`${baseUrl}/docs/assets/AvatarSprite.webp`);
      expect(spriteResponse.status).toBe(200);
      expect(spriteResponse.headers.get('content-type')).toBe('image/webp');
      await spriteResponse.arrayBuffer();

      const browserResponse = await fetch(`${baseUrl}/dist/browser.js`);
      expect(browserResponse.status).toBe(200);
      await browserResponse.arrayBuffer();
    } finally {
      const runningServer = server;
      if (runningServer) {
        await new Promise<void>((resolve, reject) => {
          runningServer.close((error?: Error) => (error ? reject(error) : resolve()));
        });
      }
    }
  });

  it('serves a sprite under dist whose filename contains URL special characters', async ({
    skip,
  }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-sprite-url-'));
    const spriteFile = 'dist/Avatar#&%Sprite.webp';
    const spritePath = path.join(tmpDir, spriteFile);
    fs.mkdirSync(path.dirname(spritePath), { recursive: true });
    fs.writeFileSync(spritePath, Buffer.from([1, 2, 3]));

    let server: Awaited<ReturnType<typeof startPreviewServer>> | undefined;

    try {
      try {
        server = await startPreviewServer({
          port: 0,
          cwd: tmpDir,
          open: false,
          gridSize: 3,
          pictureSize: 120,
          spriteFile,
          exitOnError: false,
        });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EACCES' || code === 'EPERM') {
          skip(`Port binding is not permitted in this environment (${code})`);
        }
        throw error;
      }

      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const baseUrl = `http://127.0.0.1:${port}`;

      const html = await (await fetch(baseUrl)).text();
      const spriteUrl = html.match(/sprite="([^"]+)"/)?.[1] ?? '';
      expect(spriteUrl).toBe('/dist/Avatar%23%26%25Sprite.webp');

      const spriteResponse = await fetch(`${baseUrl}${spriteUrl}`);
      expect(spriteResponse.status).toBe(200);
      expect(Buffer.from(await spriteResponse.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
    } finally {
      try {
        const runningServer = server;
        if (runningServer) {
          await new Promise<void>((resolve, reject) => {
            runningServer.close((error?: Error) => (error ? reject(error) : resolve()));
          });
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });
});
