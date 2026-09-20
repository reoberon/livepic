import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  parsePort,
  parsePositiveInteger,
  parsePreviewArgs,
  resolvePath,
  startPreviewServer,
  extractGridMetadata,
} from './preview.js';
import fs from 'node:fs';
import os from 'node:os';

const cwd = process.cwd();

describe('preview helpers', () => {
  afterEach(() => {
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
    { flag: '--grid-size', value: '0', message: 'Invalid grid size: 0' },
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
      message: 'gridSize must be a positive integer.',
    },
    {
      scenario: 'gridSize is even',
      gridSize: 4,
      pictureSize: 160,
      message: 'gridSize must be an odd integer.',
    },
    {
      scenario: 'pictureSize is not positive',
      gridSize: 5,
      pictureSize: 0,
      message: 'pictureSize must be a positive integer.',
    },
  ])('exits when $scenario', async ({ gridSize, pictureSize, message }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-invalid-'));
    const exitError = new Error('Preview process exited');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw exitError;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      fs.mkdirSync(path.join(tmpDir, 'output'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'output', 'AvatarSprite.webp'), Buffer.from([0]));

      await expect(
        startPreviewServer({
          port: 0,
          cwd: tmpDir,
          open: false,
          gridSize,
          pictureSize,
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
