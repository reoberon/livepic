import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INPUT_FILE, SPRITE_FILE } from './constants.js';

const makeBlob = () => {
  const { File } = globalThis;
  if (File) return new File([], 'avatar.webp', { type: 'image/webp' });
  return new Blob([], { type: 'image/webp' });
};
const mockRun = vi.fn().mockResolvedValue([
  {
    blob: async () => makeBlob(),
  },
]);
vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(function MockReplicate() {
    return { run: mockRun };
  }),
}));

const execFileMock = vi.fn((...args: unknown[]) => {
  const cb = args.at(-1);
  if (typeof cb === 'function') cb(null, '', '');
});
vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('p-all', () => ({
  default: (tasks: Array<() => Promise<unknown>>) => Promise.all(tasks.map((fn) => fn())),
}));

// Avoid .env loading interfering with tests
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('generate command helpers', () => {
  let tmp: string;
  let outputDir: string;

  beforeEach(() => {
    vi.resetModules();
    mockRun.mockClear();

    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-gen-'));
    outputDir = path.join(tmp, 'output');
    vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    const inputPath = path.join(tmp, DEFAULT_INPUT_FILE);
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    fs.writeFileSync(inputPath, 'fake-image');

    vi.stubEnv('REPLICATE_API_TOKEN', 'test-token');
    vi.stubEnv('LIVEPIC_AUTO_CONFIRM', '1');
    vi.stubEnv('LIVEPIC_SKIP_SPRITE', undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
    vi.restoreAllMocks();
    execFileMock.mockClear();
    vi.unstubAllEnvs();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('runs generation flow and writes output file', async () => {
    const { default: runGenerate } = await import('./generate.js');

    await runGenerate(['3', '--skip-sprite']);

    const files = fs.readdirSync(outputDir);
    expect(files.some((f) => f.endsWith('.webp'))).toBe(true);
  });

  it('rejects a single-cell grid before generating images', async () => {
    const exitError = new Error('process.exit(1)');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError;
    });
    const { default: runGenerate } = await import('./generate.js');

    await expect(runGenerate(['1'])).rejects.toBe(exitError);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockRun).not.toHaveBeenCalled();
    expect(execFileMock).not.toHaveBeenCalled();
    expect(fs.existsSync(outputDir)).toBe(false);
  });

  it('invokes montage with generated frames and sprite output settings when not skipping', async () => {
    const { default: runGenerate } = await import('./generate.js');

    await runGenerate(['3']);

    const frames = fs.readdirSync(outputDir).filter((file) => file.endsWith('.webp'));
    expect(execFileMock).toHaveBeenLastCalledWith(
      'montage',
      expect.arrayContaining(frames),
      { cwd: outputDir },
      expect.any(Function),
    );

    const montageArgs = execFileMock.mock.calls.at(-1)?.[1] as string[];
    expect(montageArgs.at(-1)).toBe(path.basename(SPRITE_FILE));

    for (const [flag, value] of [
      ['-resize', '160x160'],
      ['-tile', '3x3'],
      ['-geometry', '160x160+0+0'],
      ['-background', 'none'],
    ]) {
      expect(montageArgs.slice(montageArgs.indexOf(flag), montageArgs.indexOf(flag) + 2)).toEqual([
        flag,
        value,
      ]);
    }
  });

  it('writes sprite metadata with the grid and cell sizes after montage succeeds', async () => {
    const { default: runGenerate } = await import('./generate.js');

    await runGenerate(['3']);

    const metadata = JSON.parse(fs.readFileSync(path.join(outputDir, 'sprite.json'), 'utf8'));
    expect(metadata).toEqual({ gridSize: 3, pictureSize: 160 });
  });
});
