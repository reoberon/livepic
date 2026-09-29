import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentType, isPathWithinRoot, renderHtml, safeJoin } from './preview-utils.js';

describe('preview-utils', () => {
  it('returns expected content type', () => {
    expect(contentType('file.html')).toBe('text/html; charset=utf-8');
    expect(contentType('file.js')).toBe('text/javascript; charset=utf-8');
    expect(contentType('style.css')).toBe('text/css; charset=utf-8');
    expect(contentType('sprite.json')).toBe('application/json; charset=utf-8');
    expect(contentType('image.webp')).toBe('image/webp');
    expect(contentType('image.png')).toBe('image/png');
    expect(contentType('image.jpg')).toBe('image/jpeg');
    expect(contentType('image.jpeg')).toBe('image/jpeg');
    expect(contentType('image.svg')).toBe('image/svg+xml');
    expect(contentType('unknown.bin')).toBe('application/octet-stream');
  });

  it('joins paths safely', () => {
    const root = '/root/base';
    expect(safeJoin(root, 'nested/file.txt')).toBe(path.join(root, 'nested/file.txt'));
    expect(safeJoin(root, '../etc/passwd')).toBeNull();
    expect(safeJoin(root, '../base-secret/file.txt')).toBeNull();
    expect(safeJoin(root, '/../outside')).toBeNull();
    expect(safeJoin(root, '..sprites/avatar.webp')).toBe(path.join(root, '..sprites/avatar.webp'));
    expect(safeJoin(root, './inside')).toBe(path.join(root, 'inside'));
    expect(safeJoin(root, 'double/../inside')).toBe(path.join(root, 'inside'));
    expect(safeJoin(root, '/nested/../file.txt')).toBe(path.join(root, 'file.txt'));
  });

  it('identifies paths within a root', () => {
    const root = '/root/base';
    expect(isPathWithinRoot(root, root)).toBe(true);
    expect(isPathWithinRoot(root, path.join(root, '..sprites/avatar.webp'))).toBe(true);
    expect(isPathWithinRoot(root, path.join(root, 'nested/avatar.webp'))).toBe(true);
    expect(isPathWithinRoot(root, path.join(root, '../outside.webp'))).toBe(false);
    expect(isPathWithinRoot(root, path.join(root, '../base-secret/file.txt'))).toBe(false);
  });

  it('correctly renders HTML with provided attributes', () => {
    const params = {
      gridSize: 5,
      pictureSize: 160,
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
    expect(livePicTag).toContain(`size="${params.pictureSize}"`);
    expect(livePicTag).toContain(`sprite="${params.sprite}"`);
  });
});
