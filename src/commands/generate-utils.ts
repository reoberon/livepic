import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import readline from 'node:readline';
import { DEFAULT_GRID_SIZE, DEFAULT_INPUT_FILE } from './constants.js';
import { GenerateContext } from './types.js';

const execFileAsync = promisify(execFile);
const SKIP_SPRITE_FLAG = '--skip-sprite';
export const TERMINAL_KEY = {
  CTRL_C: '\u0003',
  ENTER: '\r',
  ARROW_LEFT: '\u001b[D',
  ARROW_UP: '\u001b[A',
  ARROW_RIGHT: '\u001b[C',
  ARROW_DOWN: '\u001b[B',
} as const;

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
    console.error('Grid size must be a positive integer, e.g. `pnpm run generate 5`');
    process.exit(1);
  }

  if (Number(parsed) % 2 !== 1) {
    console.error('Grid size must be an odd integer, e.g. `pnpm run generate 5`');
    process.exit(1);
  }

  return parsed;
}

export function renderOptions(message: string, options: readonly string[], selected: number) {
  const display = options
    .map((option, index) => (index === selected ? `[${option}]` : ` ${option} `))
    .join('  ');

  process.stdout.write(`\r${message} ${display}`);
}

type OptionInputHandlers = {
  onExit: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit: () => void;
};

type ConfirmationInput = {
  readonly isTTY?: boolean;
  setRawMode?: (enabled: boolean) => unknown;
  resume: () => unknown;
  pause: () => unknown;
  on: (event: 'data', handler: (data: Buffer) => void) => unknown;
  off: (event: 'data', handler: (data: Buffer) => void) => unknown;
};

type InteractiveConfirmationInput = ConfirmationInput & {
  readonly isTTY: true;
  setRawMode: (enabled: boolean) => unknown;
};

type ConfirmationSetup =
  | { type: 'resolved'; result: boolean; output: string }
  | { type: 'interactive'; input: InteractiveConfirmationInput };

export function handleOptionInput(data: Buffer, handlers: OptionInputHandlers) {
  const key = data.toString();

  switch (key) {
    case TERMINAL_KEY.CTRL_C:
      handlers.onExit();
      return;

    case TERMINAL_KEY.ARROW_LEFT:
    case TERMINAL_KEY.ARROW_UP:
      handlers.onPrevious();
      return;

    case TERMINAL_KEY.ARROW_RIGHT:
    case TERMINAL_KEY.ARROW_DOWN:
      handlers.onNext();
      return;

    case TERMINAL_KEY.ENTER:
      handlers.onSubmit();
      return;
  }
}

function isInteractiveInput(input: ConfirmationInput): input is InteractiveConfirmationInput {
  return input.isTTY === true && typeof input.setRawMode === 'function';
}

function getConfirmationSetup(
  message: string,
  input: ConfirmationInput,
  autoConfirm: boolean,
): ConfirmationSetup {
  if (!input.isTTY) {
    if (autoConfirm) {
      return {
        type: 'resolved',
        result: true,
        output: `${message} [auto-confirmed via LIVEPIC_AUTO_CONFIRM]`,
      };
    }

    return {
      type: 'resolved',
      result: false,
      output:
        'Non-interactive session detected. Set LIVEPIC_AUTO_CONFIRM to proceed without prompts.',
    };
  }

  if (!isInteractiveInput(input)) {
    return {
      type: 'resolved',
      result: false,
      output: `Interactive confirmation is unavailable: stdin.setRawMode must be a function, received ${typeof input.setRawMode}.`,
    };
  }

  return { type: 'interactive', input };
}

function startInteractiveInput(
  input: InteractiveConfirmationInput,
  handleData: (data: Buffer) => void,
) {
  input.setRawMode(true);
  input.resume();
  input.on('data', handleData);
}

function stopInteractiveInput(
  input: InteractiveConfirmationInput,
  handleData: (data: Buffer) => void,
) {
  input.setRawMode(false);
  input.pause();
  input.off('data', handleData);
}

export async function promptForConfirmation(
  message: string,
  input: ConfirmationInput = process.stdin,
) {
  const setup = getConfirmationSetup(
    message,
    input,
    process.env.LIVEPIC_AUTO_CONFIRM !== undefined,
  );

  if (setup.type === 'resolved') {
    logWithNewLine(setup.output);
    return setup.result;
  }

  const options = ['Yes', 'No'];
  let selected = 0;

  return new Promise<boolean>((resolve) => {
    const handleData = (data: Buffer) => {
      handleOptionInput(data, {
        onExit: () => process.exit(),
        onPrevious: () => {
          selected = (selected + options.length - 1) % options.length;
          renderOptions(message, options, selected);
        },
        onNext: () => {
          selected = (selected + 1) % options.length;
          renderOptions(message, options, selected);
        },
        onSubmit: () => {
          stopInteractiveInput(setup.input, handleData);
          process.stdout.write('\n');
          resolve(selected === 0);
        },
      });
    };

    startInteractiveInput(setup.input, handleData);
    renderOptions(message, options, selected);
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
  meta: { gridSize: number; pictureSize: number },
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
