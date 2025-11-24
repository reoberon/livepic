import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INPUT_FILE } from './constants.js';

const makeBlob = () => {
  const File = (globalThis as any).File;
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

const execFileMock = vi.fn((...args: any[]) => {
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
  beforeEach(() => {
    vi.resetModules();
    mockRun.mockClear();
  });

  afterEach(() => {
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
    vi.restoreAllMocks();
    execFileMock.mockClear();
    delete process.env.LIVEPIC_SKIP_SPRITE;
    delete process.env.LIVEPIC_AUTO_CONFIRM;
    delete process.env.REPLICATE_API_TOKEN;
  });

  it('runs generation flow and writes output file', async () => {
    // Arrange temp workspace
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-gen-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    const inputPath = path.join(tmp, DEFAULT_INPUT_FILE);
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    fs.writeFileSync(inputPath, 'fake-image');

    process.env.REPLICATE_API_TOKEN = 'test-token';
    process.env.LIVEPIC_AUTO_CONFIRM = '1'; // auto-confirm prompts

    const { default: runGenerate } = await import('./generate.js');

    await runGenerate(['1', '--skip-sprite']);

    const outputDir = path.join(tmp, 'output');
    const files = fs.readdirSync(outputDir);
    expect(files.some((f) => f.endsWith('.webp'))).toBe(true);

    cwdSpy.mockRestore();
  });

  it('builds sprite and metadata when not skipping', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-gen-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    const inputPath = path.join(tmp, DEFAULT_INPUT_FILE);
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    fs.writeFileSync(inputPath, 'fake-image');

    process.env.REPLICATE_API_TOKEN = 'test-token';
    process.env.LIVEPIC_AUTO_CONFIRM = '1';

    const { default: runGenerate } = await import('./generate.js');

    await runGenerate(['1']); // no --skip-sprite

    const outputDir = path.join(tmp, 'output');
    const files = fs.readdirSync(outputDir);
    expect(files.some((f) => f.endsWith('.webp'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'sprite.json'))).toBe(true);

    expect(execFileMock).toHaveBeenCalledWith(
      'montage',
      expect.any(Array),
      { cwd: outputDir },
      expect.any(Function),
    );

    cwdSpy.mockRestore();
  });
});
