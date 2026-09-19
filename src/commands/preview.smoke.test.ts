import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePath, startPreviewServer } from './preview.js';

describe('preview smoke', () => {
  it('resolves dist files', () => {
    const resolved = resolvePath({ pathname: '/dist/index.js', cwd: process.cwd() });
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

    let server: Awaited<ReturnType<typeof startPreviewServer>> | undefined;

    try {
      try {
        server = await startPreviewServer({
          port: 0,
          cwd: tmpDir,
          open: false,
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

      const spriteRes = await fetch(`${baseUrl}/output/AvatarSprite.webp`);
      expect(spriteRes.status).toBe(200);
      await spriteRes.arrayBuffer();
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
