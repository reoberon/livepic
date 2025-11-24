import path from 'node:path';
import { SPRITE_FILE, SPRITE_META } from './constants.js';

export function contentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.webp':
      return 'image/webp';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

export function safeJoin(root: string, requestPath: string) {
  const cleaned = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath;
  const joined = path.normalize(path.join(root, cleaned));
  return joined.startsWith(root) ? joined : null;
}

export function renderHtml(params: {
  gridSize: number;
  spritePictureSize: number;
  spriteSrc: string;
}) {
  const { gridSize, spritePictureSize, spriteSrc } = params;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LivePic Preview</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; }
      body { display: flex; align-items: center; justify-content: center; background: #f5f5f5; flex-wrap: wrap; align-content: center; }
      live-pic { border: 2px solid #000; }
    </style>
    <script type="module" src="/dist/browser.js"></script>
  </head>
  <body>
    <live-pic gridSize="${gridSize}" size="${spritePictureSize}" spriteSrc="${spriteSrc}"></live-pic>
  </body>
</html>`;
}

export function spriteFilePath(cwd: string) {
  return path.join(cwd, SPRITE_FILE);
}

export function spriteMetaPath(cwd: string) {
  return path.join(cwd, SPRITE_META);
}
