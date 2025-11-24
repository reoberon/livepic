import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startPreviewServer } from './preview.js';

describe('preview smoke', () => {
  it('serves HTML and assets', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-'));
    const outputDir = path.join(tmpDir, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(outputDir, 'sprite.json'),
      JSON.stringify({ gridSize: 3, spritePictureSize: 120 }),
    );
    fs.writeFileSync(path.join(outputDir, 'AvatarSprite.webp'), Buffer.from([0]));

    let server: Awaited<ReturnType<typeof startPreviewServer>> | undefined;

    try {
      server = await startPreviewServer({ port: 0, cwd: tmpDir, open: false, exitOnError: false });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM') {
        // Port binding not allowed in sandbox; skip.
        return;
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

    const jsRes = await fetch(`${baseUrl}/dist/index.js`);
    expect(jsRes.status).toBe(200);

    const spriteRes = await fetch(`${baseUrl}/output/AvatarSprite.webp`);
    expect(spriteRes.status).toBe(200);

    server.close();
  });
});
