import path from 'node:path';
import * as http from 'node:http';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  parsePort,
  parsePositiveInteger,
  parsePreviewArgs,
  resolvePath,
  startPreviewServer,
  extractGridMetadata,
} from './preview.js';
import * as fs from 'node:fs';
import os from 'node:os';

vi.mock('node:http', { spy: true });
vi.mock('node:fs', { spy: true });

const cwd = process.cwd();

class FakeOccupiedPortServer extends EventEmitter {
  readonly error = Object.assign(new Error('Port 4000 is already in use'), {
    code: 'EADDRINUSE',
  });

  readonly listen = vi.fn(() => {
    this.emit('error', this.error);
    return this;
  });
}

class FakePreviewFileSystem {
  readonly existsSync = vi.fn(() => true);
}

describe('preview helpers', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it('parses positive integers', () => {
    expect(parsePositiveInteger('1')).toBe(1);
    expect(parsePositiveInteger('0')).toBeNull();
    expect(parsePositiveInteger('-1')).toBeNull();
    expect(parsePositiveInteger('abc')).toBeNull();
    expect(parsePositiveInteger('')).toBeNull();
    expect(parsePositiveInteger(undefined)).toBeNull();
    expect(parsePositiveInteger(NaN)).toBeNull();
    expect(parsePositiveInteger(Infinity)).toBeNull();
    expect(parsePositiveInteger(-Infinity)).toBeNull();
    expect(parsePositiveInteger(1.3)).toBeNull();
    expect(parsePositiveInteger('31.2')).toBeNull();
  });

  it('parses ports', () => {
    expect(parsePort('4000')).toBe(4000);
    expect(parsePort('1023')).toBeNull();
    expect(parsePort('1024')).toBe(1024);
    expect(parsePort('65535')).toBe(65535);
    expect(parsePort('65536')).toBeNull();
    expect(parsePort('abc')).toBeNull();
    expect(parsePort('-1')).toBeNull();
    expect(parsePort()).toBeNull();
  });

  it('parses preview args with single positional port', () => {
    expect(parsePreviewArgs(['4000'])).toEqual({ port: 4000 });
  });

  it('parses preview args with flags', () => {
    expect(parsePreviewArgs(['-g', '3'])).toEqual({ gridSize: 3 });
    expect(parsePreviewArgs(['--grid-size=3', '-s', '160'])).toEqual({
      gridSize: 3,
      pictureSize: 160,
    });
    expect(parsePreviewArgs(['-g', '5', '--picture-size', '160', '--port', '4000'])).toEqual({
      gridSize: 5,
      pictureSize: 160,
      port: 4000,
    });
    expect(parsePreviewArgs(['--grid-size=7', '-s', '200', '-p', '5000'])).toEqual({
      gridSize: 7,
      pictureSize: 200,
      port: 5000,
    });
    expect(parsePreviewArgs(['-g=7', '-unknown-attr', '200', '-p', '5000'])).toEqual({
      gridSize: 7,
      port: 5000,
    });
  });

  it('fails on invalid single positional port', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parsePreviewArgs(['abc'])).toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith('Invalid port: abc');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it.each([
    {
      flag: '--grid-size',
      value: '0',
      message: 'Invalid grid size: 0. Expected an odd integer >= 3.',
    },
    { flag: '-g', value: '1', message: 'Invalid grid size: 1. Expected an odd integer >= 3.' },
    {
      flag: '--grid-size',
      value: '2',
      message: 'Invalid grid size: 2. Expected an odd integer >= 3.',
    },
    {
      flag: '--grid-size',
      value: '4',
      message: 'Invalid grid size: 4. Expected an odd integer >= 3.',
    },
    { flag: '-s', value: '', message: 'Invalid picture size: ' },
    { flag: '--port', value: '70000', message: 'Invalid port: 70000' },
  ])('fails on invalid value for $flag', ({ flag, value, message }) => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parsePreviewArgs([flag, value])).toThrow('exit');
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(message);
    expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('fails when preview runs without sprite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-no-sprite-'));
    const exitError = new Error('Preview process exited');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(startPreviewServer({ port: 0, cwd: tmpDir, open: false })).rejects.toBe(
        exitError,
      );

      const expectedPath = path.join(tmpDir, 'output', 'AvatarSprite.webp');
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        `Sprite image not found at ${expectedPath}. Create it by running the generate command.`,
      );
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('suggests the livepic CLI command when the preview port is already in use', async () => {
    const server = new FakeOccupiedPortServer();
    const fileSystem = new FakePreviewFileSystem();
    vi.spyOn(http, 'createServer').mockReturnValue(server as unknown as http.Server);
    vi.spyOn(fs, 'existsSync').mockImplementation(fileSystem.existsSync);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      startPreviewServer({
        port: 4000,
        cwd,
        open: false,
        gridSize: 5,
        pictureSize: 160,
        exitOnError: false,
      }),
    ).rejects.toBe(server.error);

    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      'Port 4000 is already in use. Try another one: livepic preview <port>',
    );
  });

  it('exits when required metadata properties are missing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-missing-prop-'));
    fs.mkdirSync(path.join(tmpDir, 'output'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'output', 'AvatarSprite.webp'), Buffer.from([0]));
    fs.writeFileSync(path.join(tmpDir, 'output', 'sprite.json'), JSON.stringify({ gridSize: 5 }));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      startPreviewServer({ port: 0, cwd: tmpDir, open: false, exitOnError: false }),
    ).rejects.toThrow('exit');

    expect(errorSpy).toHaveBeenCalledWith(
      'Property pictureSize was not explicitly provided. Please provide it as a command line argument or as a sprite.json file property.',
    );
  });

  it.each([
    {
      scenario: 'gridSize is not positive',
      gridSize: 0,
      pictureSize: 160,
      message: 'Invalid grid size: 0. Expected an odd integer >= 3.',
    },
    {
      scenario: 'gridSize is even',
      gridSize: 4,
      pictureSize: 160,
      message: 'Invalid grid size: 4. Expected an odd integer >= 3.',
    },
    {
      scenario: 'gridSize is 1 in arguments',
      gridSize: 1,
      pictureSize: 160,
      message: 'Invalid grid size: 1. Expected an odd integer >= 3.',
    },
    {
      scenario: 'gridSize is 1 in sprite.json',
      gridSize: 1,
      pictureSize: 160,
      fromMetadata: true,
      message: 'Invalid grid size: 1. Expected an odd integer >= 3.',
    },
    {
      scenario: 'pictureSize is not positive',
      gridSize: 5,
      pictureSize: 0,
      message: 'pictureSize must be a positive integer.',
    },
  ])('exits when $scenario', async ({ gridSize, pictureSize, message, fromMetadata }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-invalid-'));
    const exitError = new Error('Preview process exited');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      fs.mkdirSync(path.join(tmpDir, 'output'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'output', 'AvatarSprite.webp'), Buffer.from([0]));
      if (fromMetadata) {
        fs.writeFileSync(
          path.join(tmpDir, 'output', 'sprite.json'),
          JSON.stringify({ gridSize, pictureSize }),
        );
      }

      await expect(
        startPreviewServer({
          port: 0,
          cwd: tmpDir,
          open: false,
          gridSize: fromMetadata ? undefined : gridSize,
          pictureSize: fromMetadata ? undefined : pictureSize,
          exitOnError: false,
        }),
      ).rejects.toBe(exitError);
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(message);
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('extractGridMetadata', () => {
    let tmpDir: string;
    let metaPath: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-meta-'));
      metaPath = path.join(tmpDir, 'output', 'sprite.json');
      fs.mkdirSync(path.dirname(metaPath), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('exits when metadata is missing', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => extractGridMetadata(tmpDir)).toThrow('exit');
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        `Sprite metadata not found at ${metaPath}. Make sure to have a valid sprite.json or provide required properties via CLI.`,
      );
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('exits when metadata contains invalid JSON', () => {
      fs.writeFileSync(metaPath, '{bad json');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => extractGridMetadata(tmpDir)).toThrow('exit');
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        `Failed to read sprite metadata at ${metaPath}. Make sure it is a valid JSON file.`,
      );
      expect(exitSpy).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('extracts grid metadata from valid JSON', () => {
      fs.writeFileSync(metaPath, JSON.stringify({ gridSize: 5, pictureSize: 160 }));

      expect(extractGridMetadata(tmpDir)).toEqual({ gridSize: 5, pictureSize: 160 });
    });
  });

  it('resolves cwd files', () => {
    const resolved = resolvePath({ pathname: '/package.json', cwd });
    expect(resolved).toBe(path.join(cwd, 'package.json'));
  });

  it('rejects traversal outside cwd', () => {
    const resolved = resolvePath({ pathname: '/../etc/outside', cwd });
    expect(resolved).toBeNull();
  });
});
