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
      preview(args);
      break;

    default:
      console.log(`Usage:
    livepic generate [gridSize] [--skip-sprite]
    livepic preview [port]`);
      process.exit(command ? 1 : 0);
  }
}
