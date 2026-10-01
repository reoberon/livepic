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
    livepic preview [-g <gridSize>] [-s <pictureSize>] [-p <port>] [--host <host>]

Generate arguments:
    gridSize                        Number of cells per grid side (odd integer >= 3, default 5)

Preview options:
    -g, --grid-size <gridSize>        Number of cells per grid side (odd integer >= 3)
    -s, --picture-size <pictureSize>  Cell size in pixels (positive integer)
    -p, --port <port>                Server port (1024-65535)
    --host <host>                    Bind address (default 127.0.0.1)`);
      process.exit(command ? 1 : 0);
  }
}
