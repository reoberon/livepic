import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import readline from 'node:readline';
import {
  ensureApiToken,
  ensureInputFileExists,
  getGridSizeFromArgs,
  parseArgs,
  promptForConfirmation,
  promptForNumber,
  round,
  writeSpriteMetadata,
} from './generate-utils.js';
import { GenerateContext } from './types.js';

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;

describe('generate utils', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as any);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LIVEPIC_SKIP_SPRITE;
    delete process.env.LIVEPIC_AUTO_CONFIRM;
    delete process.env.REPLICATE_API_TOKEN;
  });

  it('parses args and env flags', () => {
    delete process.env.LIVEPIC_SKIP_SPRITE;
    expect(parseArgs([])).toEqual({ gridArg: undefined, skipSprite: false });
    expect(parseArgs(['7'])).toEqual({ gridArg: '7', skipSprite: false });

    process.env.LIVEPIC_SKIP_SPRITE = 'true';
    expect(parseArgs(['3'])).toEqual({ gridArg: '3', skipSprite: true });
    expect(parseArgs(['5', '--skip-sprite'])).toEqual({ gridArg: '5', skipSprite: true });
  });

  it('validates grid size and exits on invalid', () => {
    expect(getGridSizeFromArgs('5')).toBe(5);
    expect(() => getGridSizeFromArgs('2')).toThrow(/exit 1/);
    expect(() => getGridSizeFromArgs('-1')).toThrow(/exit 1/);
  });

  it('handles promptForConfirmation in non-interactive mode without env', async () => {
    delete process.env.LIVEPIC_AUTO_CONFIRM;
    const original = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });

    const result = await promptForConfirmation('Question?');
    expect(result).toBe(false);

    if (original) {
      Object.defineProperty(process.stdin, 'isTTY', original);
    }
  });

  it('handles promptForConfirmation in non-interactive mode with env auto-confirm', async () => {
    process.env.LIVEPIC_AUTO_CONFIRM = 'true';
    const original = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });

    const result = await promptForConfirmation('Question?');
    expect(result).toBe(true);

    if (original) {
      Object.defineProperty(process.stdin, 'isTTY', original);
    }
  });

  it('exits when REPLICATE_API_TOKEN is missing', () => {
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

  it('handles interactive promptForConfirmation navigation', async () => {
    const original = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });

    const hadRawMode = typeof (process.stdin as any).setRawMode === 'function';
    if (!hadRawMode) {
      (process.stdin as any).setRawMode = () => {};
    }
    const setRawModeSpy = vi.spyOn(process.stdin as any, 'setRawMode').mockImplementation(() => {});
    vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin as any);
    vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin as any);
    vi.spyOn(process.stdin, 'off').mockReturnValue(process.stdin as any);

    let dataHandler: ((chunk: Buffer) => void) | undefined;
    vi.spyOn(process.stdin, 'on').mockImplementation((event: string, handler: any) => {
      if (event === 'data') {
        dataHandler = handler as (chunk: Buffer) => void;
      }
      return process.stdin as any;
    });

    const resultPromise = promptForConfirmation('Proceed?');
    expect(setRawModeSpy).toHaveBeenCalledWith(true);
    expect(dataHandler).toBeDefined();

    // Move selection right to "No" then confirm
    dataHandler?.(Buffer.from('\u001b[C'));
    dataHandler?.(Buffer.from('\r'));

    const result = await resultPromise;
    expect(result).toBe(false);
    expect(stdoutSpy).toHaveBeenCalled();

    if (!hadRawMode) {
      delete (process.stdin as any).setRawMode;
    }
    if (original) {
      Object.defineProperty(process.stdin, 'isTTY', original);
    }
  });

  it('prompts for number and falls back to default on invalid input', async () => {
    const original = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });

    const question = vi.fn((_message: string, cb: (answer: string) => void) => cb('not-a-number'));
    const close = vi.fn();
    vi.spyOn(readline, 'createInterface').mockReturnValue({ question, close } as any);

    const value = await promptForNumber('Enter number:', 10);
    expect(value).toBe(10);
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid value. Using default: 10'),
    );

    if (original) {
      Object.defineProperty(process.stdin, 'isTTY', original);
    }
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
      execFile: (...args: any[]) => {
        const cb = args.at(-1);
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
        cb(error, '', '');
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
      execFile: (...args: any[]) => {
        const cb = args.at(-1);
        const error = Object.assign(new Error('boom'), { code: 'EACCES' });
        cb(error, '', '');
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
      execFile: (...args: any[]) => {
        const cb = args.at(-1);
        cb(null, 'Version: test', '');
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
