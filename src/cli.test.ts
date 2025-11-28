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

  it('shows usage and exits 0 when no command', async () => {
    const { exitSpy, logSpy } = await runCli(['node', 'cli']);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(`Usage:
    livepic generate [gridSize] [--skip-sprite]
    livepic preview [port]`);
  });

  it('shows usage and exits 1 on unknown command', async () => {
    const { exitSpy, logSpy } = await runCli(['node', 'cli', 'unknown']);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logSpy).toHaveBeenCalledWith(`Usage:
    livepic generate [gridSize] [--skip-sprite]
    livepic preview [port]`);
  });

  it('logs error and exits when command rejects', async () => {
    const { exitSpy, errorSpy } = await runCli(['node', 'cli', 'generate'], {
      generateImpl: () => {
        throw new Error('boom');
      },
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    expect((errorSpy.mock.calls[0][0] as Error).message).toBe('boom');
  });
});
