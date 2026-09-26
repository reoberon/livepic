import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPreviewServer } from '../dist/commands/preview.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await startPreviewServer({
  port: 3000,
  cwd: packageRoot,
  open: true,
  gridSize: 25,
  pictureSize: 150,
  spriteFile: 'docs/assets/AvatarSprite.webp',
});
