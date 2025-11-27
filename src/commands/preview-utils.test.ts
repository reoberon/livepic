import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentType, renderHtml, safeJoin } from './preview-utils.js';

describe('preview-utils', () => {
  it('returns expected content type', () => {
    expect(contentType('file.html')).toBe('text/html; charset=utf-8');
    expect(contentType('image.webp')).toBe('image/webp');
    expect(contentType('unknown.bin')).toBe('application/octet-stream');
  });

  it('joins paths safely', () => {
    const root = '/root/base';
    expect(safeJoin(root, 'nested/file.txt')).toBe(path.join(root, 'nested/file.txt'));
    expect(safeJoin(root, '../etc/passwd')).toBeNull();
    expect(safeJoin(root, '/../outside')).toBeNull();
    expect(safeJoin(root, './inside')).toBe(path.join(root, 'inside'));
    expect(safeJoin(root, 'double/../inside')).toBe(path.join(root, 'inside'));
    expect(safeJoin(root, '/nested/../file.txt')).toBe(path.join(root, 'file.txt'));
  });

  it('correctly renders HTML with provided attributes', () => {
    const params = {
      gridSize: 5,
      spritePictureSize: 160,
      sprite: '/output/AvatarSprite.webp',
    };

    const html = renderHtml(params);

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html');
    expect(html.endsWith('</html>')).toBe(true);
    expect(html).toContain('<body');
    expect(html).toContain('</body>');

    const livePicMatch = html.match(/<live-pic[^>]*>/);
    expect(livePicMatch).not.toBeNull();
    const livePicTag = livePicMatch![0];
    expect(livePicTag).toContain(`gridSize="${params.gridSize}"`);
    expect(livePicTag).toContain(`size="${params.spritePictureSize}"`);
    expect(livePicTag).toContain(`sprite="${params.sprite}"`);
  });
});
