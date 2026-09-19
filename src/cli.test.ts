import { afterEach, describe, expect, it, vi } from 'vitest';

const originalArgv = process.argv.slice();

const mockGenerate = vi.fn();
const mockPreview = vi.fn();

type RunCliOptions = {
  generateImpl?: (...args: unknown[]) => unknown;
  previewImpl?: (...args: unknown[]) => unknown;
};

async function runCli(argv: string[], options: RunCliOptions = {}) {
  vi.resetModules();
  mockGenerate.mockReset();
  mockPreview.mockReset();
  if (options.generateImpl) mockGenerate.mockImplementation(options.generateImpl);
  if (options.previewImpl) mockPreview.mockImplementation(options.previewImpl);
  vi.doMock('./commands/generate.js', () => ({ default: mockGenerate }));
  vi.doMock('./commands/preview.js', () => ({ default: mockPreview }));
  vi.doMock('dotenv/config', () => ({}));

  process.argv = argv;

  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  await import('./cli.js');
  await new Promise((resolve) => setImmediate(resolve));

  return { exitSpy, logSpy, errorSpy };
}

afterEach(() => {
  process.argv = originalArgv.slice();
  vi.resetModules();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('cli', () => {
  it('dispatches generate with args', async () => {
    const { exitSpy } = await runCli(['node', 'cli', 'generate', '5', '--skip-sprite']);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(mockGenerate).toHaveBeenCalledWith(['5', '--skip-sprite']);
  });

  it('dispatches preview with args', async () => {
    const { exitSpy } = await runCli(['node', 'cli', 'preview', '-p', '4000']);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(mockPreview).toHaveBeenCalledWith(['-p', '4000']);
  });

  it.each([
    { scenario: 'no command', args: [], exitCode: 0 },
    { scenario: 'an unknown command', args: ['unknown'], exitCode: 1 },
  ])('shows usage and exits $exitCode for $scenario', async ({ args, exitCode }) => {
    const { exitSpy, logSpy } = await runCli(['node', 'cli', ...args]);

    expect(exitSpy).toHaveBeenCalledWith(exitCode);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/usage/i));
  });

  it('documents commands and supported flags in usage', async () => {
    const { logSpy } = await runCli(['node', 'cli']);
    const help = logSpy.mock.calls.flat().join('\n');

    expect(help.split(/[^\w-]+/)).toEqual(
      expect.arrayContaining([
        'livepic',
        'generate',
        'preview',
        '--skip-sprite',
        '-g',
        '--grid-size',
        '-s',
        '--picture-size',
        '-p',
        '--port',
      ]),
    );
  });

  it.each([
    ['generate', { generateImpl: () => Promise.reject(new Error('boom')) }],
    ['preview', { previewImpl: () => Promise.reject(new Error('boom')) }],
  ])('logs error and exits when %s rejects', async (command, options) => {
    const { exitSpy, errorSpy } = await runCli(['node', 'cli', command], options);

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    expect((errorSpy.mock.calls[0][0] as Error).message).toBe('boom');
  });
});
