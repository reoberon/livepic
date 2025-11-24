import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import readline from 'node:readline';
import { DEFAULT_GRID_SIZE, DEFAULT_INPUT_FILE } from './constants.js';
import { GenerateContext } from './types.js';

const execFileAsync = promisify(execFile);
const SKIP_SPRITE_FLAG = '--skip-sprite';

let renderedLines = 0;

export function resetRenderedLines() {
  renderedLines = 0;
}

export function ensureApiToken() {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error('REPLICATE_API_TOKEN is missing. Set it in your environment or .env file.');
    process.exit(1);
  }
}

export function ensureInputFileExists(imagePath: string) {
  if (fs.existsSync(imagePath)) return;

  console.error(
    `Input file not found at ${imagePath}. Place your source image there (default: ${DEFAULT_INPUT_FILE}).`,
  );
  process.exit(1);
}

export function parseArgs(args: string[]) {
  const gridArg = args.find((arg) => !arg.startsWith('--'));
  const skipSprite =
    args.includes(SKIP_SPRITE_FLAG) || process.env.LIVEPIC_SKIP_SPRITE !== undefined;
  return { gridArg, skipSprite };
}

export function getGridSizeFromArgs(rawValue?: string) {
  if (!rawValue) return DEFAULT_GRID_SIZE;

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error('Grid size must be a positive integer, e.g. `npm run generate 5`');
    process.exit(1);
  }

  if (Number(parsed) % 2 !== 1) {
    console.error('Grid size must be an odd integer, e.g. `npm run generate 5`');
    process.exit(1);
  }

  return parsed;
}

export async function promptForConfirmation(message: string) {
  if (!process.stdin.isTTY) {
    if (process.env.LIVEPIC_AUTO_CONFIRM !== undefined) {
      logWithNewLine(`${message} [auto-confirmed via LIVEPIC_AUTO_CONFIRM]`);
      return true;
    }
    logWithNewLine(
      'Non-interactive session detected. Set LIVEPIC_AUTO_CONFIRM to proceed without prompts.',
    );
    return false;
  }

  const options = ['Yes', 'No'];
  let selected = 0;

  const render = () => {
    const display = options
      .map((option, index) => (index === selected ? `[${option}]` : ` ${option} `))
      .join('  ');

    process.stdout.write(`\r${message} ${display}`);
  };

  return new Promise<boolean>((resolve) => {
    const handleData = (data: Buffer) => {
      const key = data.toString();

      if (key === '\u0003') {
        process.exit();
      }

      const moveLeft = key === '\u001b[D' || key === '\u001b[A';
      const moveRight = key === '\u001b[C' || key === '\u001b[B';

      if (moveLeft) {
        selected = (selected + options.length - 1) % options.length;
        render();
        return;
      }

      if (moveRight) {
        selected = (selected + 1) % options.length;
        render();
        return;
      }

      if (key === '\r') {
        cleanup();
        process.stdout.write('\n');
        resolve(selected === 0);
      }
    };

    const cleanup = () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      process.stdin.off('data', handleData);
    };

    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on('data', handleData);
    render();
  });
}

export async function promptForNumber(message: string, defaultValue: number) {
  if (!process.stdin.isTTY) return defaultValue;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => rl.question(message, resolve));
  rl.close();

  const parsed = Number(answer.trim());
  if (Number.isNaN(parsed) || parsed <= 0) {
    logWithNewLine(`Invalid value. Using default: ${defaultValue}`);
    return defaultValue;
  }

  return parsed;
}

export async function writeSpriteMetadata(
  context: GenerateContext,
  meta: { gridSize: number; spritePictureSize: number },
) {
  if (!fs.existsSync(context.outputDir)) {
    fs.mkdirSync(context.outputDir, { recursive: true });
  }

  const metaPath = path.join(context.outputDir, 'sprite.json');
  const payload = JSON.stringify(meta, null, 2);

  await writeFileSafe(metaPath, payload, 'utf8');
  logWithNewLine(`Sprite metadata saved to output/sprite.json`);
}

export function logWithNewLine(message: string) {
  renderedLines += 1;
  process.stdout.write(`${message}\n`);
}

export function registerLogLine(message: string, lineWidth: number) {
  const lineIndex = renderedLines;
  renderedLines += 1;
  process.stdout.write(`${padLine(message, lineWidth)}\n`);
  return lineIndex;
}

export function updateLogLine(lineIndex: number, message: string, lineWidth: number) {
  const distanceUp = renderedLines - lineIndex;
  const moveUp = distanceUp > 0 ? `\x1b[${distanceUp}A` : '';
  const moveDown = distanceUp > 0 ? `\x1b[${distanceUp}B` : '';
  process.stdout.write(`${moveUp}\r${padLine(message, lineWidth)}${moveDown}\r`);
}

export async function ensureMontageAvailable() {
  try {
    await execFileAsync('montage', ['-version']);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function writeFileSafe(
  filePath: string,
  data: string | NodeJS.ArrayBufferView,
  encoding?: BufferEncoding,
) {
  await fs.promises.writeFile(filePath, data, encoding);
}

function padLine(message: string, length: number) {
  return message.padEnd(length, ' ');
}

export function round(value: number, precision: number) {
  return Math.round(value * precision) / precision;
}
