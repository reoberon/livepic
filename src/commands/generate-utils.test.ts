import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import readline from 'node:readline';
import {
  ensureApiToken,
  ensureInputFileExists,
  getGridSizeFromArgs,
  handleOptionInput,
  parseArgs,
  promptForConfirmation,
  promptForNumber,
  renderOptions,
  round,
  writeSpriteMetadata,
} from './generate-utils.js';
import { GenerateContext } from './types.js';

const stdinIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;

class FakeConfirmationInput extends EventEmitter {
  readonly isTTY: boolean;
  readonly resume = vi.fn();
  readonly pause = vi.fn();
  setRawMode?: (enabled: boolean) => unknown;

  constructor({ isTTY = true, supportsRawMode = true } = {}) {
    super();
    this.isTTY = isTTY;

    if (supportsRawMode) {
      this.setRawMode = vi.fn<(enabled: boolean) => void>();
    }
  }

  sendKey(key: string) {
    this.emit('data', Buffer.from(key));
  }
}

describe('generate utils', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();

    if (stdinIsTTYDescriptor) {
      Object.defineProperty(process.stdin, 'isTTY', stdinIsTTYDescriptor);
    } else {
      Reflect.deleteProperty(process.stdin, 'isTTY');
    }

    delete process.env.LIVEPIC_AUTO_CONFIRM;
  });

  it('parses args without sprite flags', () => {
    vi.stubEnv('LIVEPIC_SKIP_SPRITE', undefined);

    expect(parseArgs([])).toEqual({ gridArg: undefined, skipSprite: false });
    expect(parseArgs(['7'])).toEqual({ gridArg: '7', skipSprite: false });
  });

  it('skips sprite generation when the environment flag is set', () => {
    vi.stubEnv('LIVEPIC_SKIP_SPRITE', 'true');

    expect(parseArgs(['3'])).toEqual({ gridArg: '3', skipSprite: true });
  });

  it('skips sprite generation with the CLI flag when the environment flag is absent', () => {
    vi.stubEnv('LIVEPIC_SKIP_SPRITE', undefined);

    expect(parseArgs(['5', '--skip-sprite'])).toEqual({ gridArg: '5', skipSprite: true });
  });

  it('validates grid size and exits on invalid', () => {
    expect(getGridSizeFromArgs('5')).toBe(5);
    expect(() => getGridSizeFromArgs('2')).toThrow(/exit 1/);
    expect(() => getGridSizeFromArgs('-1')).toThrow(/exit 1/);
  });

  it('handles promptForConfirmation in non-interactive mode without env', async () => {
    delete process.env.LIVEPIC_AUTO_CONFIRM;
    const input = new FakeConfirmationInput({ isTTY: false });

    const result = await promptForConfirmation('Question?', input);
    expect(result).toBe(false);
  });

  it('handles promptForConfirmation in non-interactive mode with env auto-confirm', async () => {
    process.env.LIVEPIC_AUTO_CONFIRM = 'true';
    const input = new FakeConfirmationInput({ isTTY: false });

    const result = await promptForConfirmation('Question?', input);
    expect(result).toBe(true);
  });

  it('fails safely when interactive confirmation is unavailable', async () => {
    const input = new FakeConfirmationInput({ supportsRawMode: false });

    const result = await promptForConfirmation('Question?', input);

    expect(result).toBe(false);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('Interactive confirmation is unavailable'),
    );
    expect(input.resume).not.toHaveBeenCalled();
    expect(input.listenerCount('data')).toBe(0);
  });

  it('exits when REPLICATE_API_TOKEN is missing', () => {
    vi.stubEnv('REPLICATE_API_TOKEN', undefined);

    expect(() => ensureApiToken()).toThrow(/exit 1/);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('REPLICATE_API_TOKEN is missing'),
    );
  });

  it('exits when input file is missing', () => {
    const missingPath = path.join(os.tmpdir(), 'does-not-exist.webp');
    expect(() => ensureInputFileExists(missingPath)).toThrow(/exit 1/);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Input file not found'));
  });

  describe('renderOptions', () => {
    it.each([
      {
        options: ['Yes', 'No'],
        selected: 0,
        expected: '\rProceed? [Yes]   No ',
      },
      {
        options: ['First', 'Second', 'Third'],
        selected: 1,
        expected: '\rProceed?  First   [Second]   Third ',
      },
    ])('renders option $selected as selected', ({ options, selected, expected }) => {
      renderOptions('Proceed?', options, selected);

      expect(stdoutSpy).toHaveBeenCalledWith(expected);
    });
  });

  describe('handleOptionInput', () => {
    const createHandlers = () => ({
      onExit: vi.fn(),
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onSubmit: vi.fn(),
    });

    it.each([
      { key: '\u001b[D', expectedHandler: 'onPrevious' },
      { key: '\u001b[A', expectedHandler: 'onPrevious' },
      { key: '\u001b[C', expectedHandler: 'onNext' },
      { key: '\u001b[B', expectedHandler: 'onNext' },
    ] as const)('dispatches $key to $expectedHandler', ({ key, expectedHandler }) => {
      const handlers = createHandlers();

      handleOptionInput(Buffer.from(key), handlers);

      expect(handlers[expectedHandler]).toHaveBeenCalledTimes(1);
      expect(
        Object.values(handlers).filter((handler) => handler.mock.calls.length > 0),
      ).toHaveLength(1);
    });

    it('dispatches the submit key', () => {
      const handlers = createHandlers();

      handleOptionInput(Buffer.from('\r'), handlers);

      expect(handlers.onSubmit).toHaveBeenCalledTimes(1);
      expect(handlers.onExit).not.toHaveBeenCalled();
      expect(handlers.onPrevious).not.toHaveBeenCalled();
      expect(handlers.onNext).not.toHaveBeenCalled();
    });

    it('dispatches the exit key', () => {
      const handlers = createHandlers();

      handleOptionInput(Buffer.from('\u0003'), handlers);

      expect(handlers.onExit).toHaveBeenCalledTimes(1);
      expect(handlers.onPrevious).not.toHaveBeenCalled();
      expect(handlers.onNext).not.toHaveBeenCalled();
      expect(handlers.onSubmit).not.toHaveBeenCalled();
    });
  });

  it.each([
    {
      name: 'returns true when submitting the default Yes option',
      keys: ['\r'],
      expectedResult: true,
    },
    {
      name: 'returns false when selecting No with the right arrow',
      keys: ['\u001b[C', '\r'],
      expectedResult: false,
    },
  ])('$name', async ({ keys, expectedResult }) => {
    const input = new FakeConfirmationInput();

    const resultPromise = promptForConfirmation('Proceed?', input);
    expect(input.setRawMode).toHaveBeenCalledWith(true);
    expect(input.resume).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('data')).toBe(1);

    keys.forEach((key) => input.sendKey(key));

    const result = await resultPromise;
    expect(result).toBe(expectedResult);
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(input.pause).toHaveBeenCalledTimes(1);
    expect(input.listenerCount('data')).toBe(0);
  });

  it('renders the confirmation initially and after the selection changes', async () => {
    const input = new FakeConfirmationInput();

    const resultPromise = promptForConfirmation('Proceed?', input);
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const initialRender = stdoutSpy.mock.lastCall;

    input.sendKey('\u001b[C');

    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(stdoutSpy.mock.lastCall).not.toEqual(initialRender);

    input.sendKey('\r');
    await resultPromise;
  });

  it('prompts for number and falls back to default on invalid input', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });

    const question = vi.fn((_message: string, cb: (answer: string) => void) => cb('not-a-number'));
    const close = vi.fn();
    vi.spyOn(readline, 'createInterface').mockReturnValue({
      question,
      close,
    } as unknown as readline.Interface);

    const value = await promptForNumber('Enter number:', 10);
    expect(value).toBe(10);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid value. Using default: 10'),
    );
  });

  it('writes sprite metadata and creates directory if missing', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-meta-'));
    const outputDir = path.join(tmp, 'output');
    const context = { outputDir } as unknown as GenerateContext;

    await writeSpriteMetadata(context, { gridSize: 3, pictureSize: 160 });

    const metaPath = path.join(outputDir, 'sprite.json');
    expect(fs.existsSync(outputDir)).toBe(true);
    const content = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    expect(content).toEqual({ gridSize: 3, pictureSize: 160 });
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Sprite metadata saved'));
  });

  it('returns false when montage is not available', async () => {
    vi.resetModules();
    vi.doMock('node:child_process', () => ({
      execFile: (...args: unknown[]) => {
        const cb = args.at(-1);
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
        if (typeof cb === 'function') cb(error, '', '');
      },
    }));

    const { ensureMontageAvailable } = await import('./generate-utils.js');
    const result = await ensureMontageAvailable();
    expect(result).toBe(false);

    vi.doUnmock('node:child_process');
    vi.resetModules();
  });

  it('throws for montage errors other than ENOENT', async () => {
    vi.resetModules();
    vi.doMock('node:child_process', () => ({
      execFile: (...args: unknown[]) => {
        const cb = args.at(-1);
        const error = Object.assign(new Error('boom'), { code: 'EACCES' });
        if (typeof cb === 'function') cb(error, '', '');
      },
    }));

    const { ensureMontageAvailable } = await import('./generate-utils.js');
    await expect(ensureMontageAvailable()).rejects.toThrow('boom');

    vi.doUnmock('node:child_process');
    vi.resetModules();
  });

  it('returns true when montage is available', async () => {
    vi.resetModules();
    vi.doMock('node:child_process', () => ({
      execFile: (...args: unknown[]) => {
        const cb = args.at(-1);
        if (typeof cb === 'function') cb(null, 'Version: test', '');
      },
    }));

    const { ensureMontageAvailable } = await import('./generate-utils.js');
    const result = await ensureMontageAvailable();
    expect(result).toBe(true);

    vi.doUnmock('node:child_process');
    vi.resetModules();
  });

  it('rounds numbers to the given precision', () => {
    expect(round(1.2345, 1)).toBe(1);
    expect(round(1.235, 100)).toBe(1.24);
    expect(round(1235, 100)).toBe(1235);
  });
});
