#!/usr/bin/env node

import 'dotenv/config';
import generate from './commands/generate.js';
import preview from './commands/preview.js';

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  const [, , command, ...args] = process.argv;

  switch (command) {
    case 'generate':
      await generate(args);
      break;

    case 'preview':
      await preview(args);
      break;

    default:
      console.log(`Usage:
    livepic generate [gridSize] [--skip-sprite]
    livepic preview [port]
    livepic preview [-g <gridSize>] [-s <pictureSize>] [-p <port>]

Preview options:
    -g, --grid-size <gridSize>        Number of cells per grid side (positive odd integer)
    -s, --picture-size <pictureSize>  Cell size in pixels (positive integer)
    -p, --port <port>                Server port (1024-65535)`);
      process.exit(command ? 1 : 0);
  }
}
