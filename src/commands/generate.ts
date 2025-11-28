import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import Replicate from 'replicate';
import pAll from 'p-all';
import {
  DEFAULT_INPUT_FILE,
  DEFAULT_PHOTO_PREFIX,
  DEFAULT_PUPIL_BOUND,
  DEFAULT_ROTATE_BOUND,
  DEFAULT_CONCURRENCY,
  MODEL_VERSION_ID as model,
} from './constants.js';
import { GenerateContext, GridSetup, Step } from './types.js';
import {
  ensureApiToken,
  ensureInputFileExists,
  ensureMontageAvailable,
  getGridSizeFromArgs,
  logWithNewLine,
  parseArgs,
  promptForConfirmation,
  promptForNumber,
  registerLogLine,
  resetRenderedLines,
  updateLogLine,
  writeFileSafe,
  writeSpriteMetadata,
  round,
} from './generate-utils.js';

const BASE_DIR = process.cwd();
const execFileAsync = promisify(execFile);

export default async function runGenerate(args: string[] = []) {
  resetRenderedLines();

  const { gridArg, skipSprite } = parseArgs(args);
  const gridSize = getGridSizeFromArgs(gridArg);
  ensureApiToken();

  const setup: GridSetup = {
    X_STEPS: gridSize,
    Y_STEPS: gridSize,
    ROTATE_BOUND: DEFAULT_ROTATE_BOUND,
    PUPIL_BOUND: DEFAULT_PUPIL_BOUND,
    PHOTO_PREFIX: DEFAULT_PHOTO_PREFIX,
    FILE_NAME: DEFAULT_INPUT_FILE,
  };

  const steps = buildStepGrid(setup);
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const imagePath = path.resolve(BASE_DIR, setup.FILE_NAME);
  ensureInputFileExists(imagePath);
  const image = fs.readFileSync(imagePath);

  const context: GenerateContext = {
    setup,
    replicate,
    image,
    outputDir: path.join(BASE_DIR, 'output'),
  };

  const cost = steps.flat().length * 0.00098;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  console.log(
    `Generating ${gridSize * gridSize} photos (${gridSize}x${gridSize} grid).\nEstimated cost: ${formatter.format(cost)}`,
  );

  const shouldProceed = await promptForConfirmation('Continue with generation?');

  if (!shouldProceed) {
    console.log('Aborted by user.');
    process.exit(0);
  }

  console.log(
    'Track generation progress with the Replicate dashbord: https://replicate.com/dashboard',
  );
  const generatedAll = await generateAllWithRetries(steps.flat(), context);

  if (generatedAll) {
    if (skipSprite) {
      logWithNewLine('Sprite creation skipped (--skip-sprite).');
      return;
    }

    const shouldBuildSprite = await promptForConfirmation('Proceed to create sprite?');
    if (shouldBuildSprite) {
      const spriteSize = await promptForNumber('Sprite cell size in px (default 160): ', 160);
      const created = await createSprite(context, spriteSize);
      if (created) {
        await writeSpriteMetadata(context, {
          gridSize: setup.X_STEPS,
          pictureSize: spriteSize,
        });
      }
    } else {
      logWithNewLine('Sprite creation skipped by user request.');
    }
  } else {
    logWithNewLine('Skipping sprite creation because not all images were generated.');
  }
}

function buildStepGrid(setup: GridSetup) {
  const { X_STEPS, Y_STEPS, PHOTO_PREFIX, ROTATE_BOUND, PUPIL_BOUND } = setup;

  const valueAt = (
    stepIndex: number,
    totalSteps: number,
    bound: number,
    { invert = false } = {},
  ) => {
    if (totalSteps === 1) return 0;
    const normalized = (stepIndex / (totalSteps - 1)) * 2 - 1; // range -1..1
    const value = bound * normalized;
    return round(invert ? -value : value, 10);
  };

  const steps: Step[][] = [];

  for (let y = 0; y < Y_STEPS; y += 1) {
    const row = [];

    for (let x = 0; x < X_STEPS; x += 1) {
      const index = y * X_STEPS + x;
      row.push({
        x,
        y,
        index,
        rotate_yaw: valueAt(x, X_STEPS, ROTATE_BOUND),
        rotate_pitch: valueAt(y, Y_STEPS, ROTATE_BOUND),
        pupil_x: valueAt(x, X_STEPS, PUPIL_BOUND),
        pupil_y: valueAt(y, Y_STEPS, PUPIL_BOUND, { invert: true }),
        filename: `${PHOTO_PREFIX}_${String(index).padStart(3, '0')}.webp`,
        crop_factor: 1.5,
        output_quality: 100,
      });
    }

    steps.push(row);
  }

  return steps;
}

async function generateStepImage(context: GenerateContext, step: Step) {
  const outputPath = path.join(context.outputDir, step.filename);

  if (!fs.existsSync(context.outputDir)) {
    fs.mkdirSync(context.outputDir, { recursive: true });
  }

  const startMessage = `Generating ${step.filename}...`;
  const doneMessage = `Generated ${step.filename} [done]`;
  const skipMessage = `Skipping ${step.filename} (exists)`;
  const lineWidth = Math.max(startMessage.length, doneMessage.length, skipMessage.length);
  const lineIndex = registerLogLine(startMessage, lineWidth);

  if (fs.existsSync(outputPath)) {
    updateLogLine(lineIndex, skipMessage, lineWidth);
    return;
  }

  try {
    const output = await context.replicate.run(model, {
      input: {
        image: context.image,
        ...step,
      },
    });

    const fileOutput = Array.isArray(output) ? output[0] : output;

    if (!fileOutput) {
      throw new Error('No output from Replicate');
    }

    const blob = await fileOutput.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await writeFileSafe(outputPath, buffer);
    updateLogLine(lineIndex, doneMessage, lineWidth);
    return true;
  } catch (error) {
    updateLogLine(lineIndex, `Failed ${step.filename} [error]`, lineWidth);
    console.error(`Error generating ${step.filename}:`, error);
    return false;
  }
}

async function generateAllWithRetries(stepList: Step[], context: GenerateContext, maxAttempts = 2) {
  let attempt = 1;
  let pending = [...stepList];

  while (pending.length > 0 && attempt <= maxAttempts) {
    if (attempt > 1) {
      logWithNewLine(
        `Retrying ${pending.length} missing images (attempt ${attempt}/${maxAttempts})...`,
      );
    }

    const actions = pending.map((step) => async () => {
      const ok = await generateStepImage(context, step);
      return ok;
    });

    await pAll(actions, { concurrency: DEFAULT_CONCURRENCY, stopOnError: false });

    pending = pending.filter((step) => !isGenerated(context, step));
    attempt += 1;
  }

  if (pending.length === 0) {
    logWithNewLine('All images generated successfully.');
    return true;
  }

  const missing = pending.map((step) => step.filename).join(', ');
  console.error(
    `Could not generate ${pending.length} images after ${maxAttempts} attempts: ${missing}`,
  );
  process.exitCode = 1;
  return false;
}

function isGenerated(context: GenerateContext, step: Step) {
  const outputPath = path.join(context.outputDir, step.filename);
  return fs.existsSync(outputPath);
}

async function createSprite(context: GenerateContext, cellSize: number) {
  const tile = `${context.setup.X_STEPS}x${context.setup.Y_STEPS}`;
  if (!fs.existsSync(context.outputDir)) {
    logWithNewLine('Output directory not found. Generate frames first.');
    return false;
  }

  const files = fs
    .readdirSync(context.outputDir)
    .filter((file) => file.startsWith(`${context.setup.PHOTO_PREFIX}_`) && file.endsWith('.webp'))
    .sort();

  if (files.length === 0) {
    logWithNewLine('No generated frames found to build sprite.');
    return false;
  }

  const args = [
    ...files,
    '-resize',
    `${cellSize}x${cellSize}`,
    '-tile',
    tile,
    '-geometry',
    `${cellSize}x${cellSize}+0+0`,
    '-background',
    'none',
    'AvatarSprite.webp',
  ];

  logWithNewLine(`Building sprite with ${files.length} frames...`);

  try {
    const montageOk = await ensureMontageAvailable();
    if (!montageOk) {
      logWithNewLine(
        "ImageMagick 'montage' is required to build the sprite. Install ImageMagick or rerun with --skip-sprite.",
      );
      return false;
    }

    await execFileAsync('montage', args, { cwd: context.outputDir });
    logWithNewLine('Sprite created: output/AvatarSprite.webp');
    return true;
  } catch (error) {
    console.error('Failed to create sprite:', error);
    process.exitCode = 1;
    return false;
  }
}

// Based on https://github.com/kylan02/face_looker/blob/main/main.py
