import path from 'node:path';
import { describe, expect, it, vi, afterEach } from 'vitest';
import * as previewModule from './preview.js';
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

  it('fails on invalid flagged values', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => parsePreviewArgs(['--grid-size', '0'])).toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith('Invalid grid size: 0');
    errorSpy.mockClear();

    expect(() => parsePreviewArgs(['-s', ''])).toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith('Invalid picture size: ');
    errorSpy.mockClear();

    expect(() => parsePreviewArgs(['--port', '70000'])).toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith('Invalid port: 70000');
    expect(exitSpy).toHaveBeenCalledTimes(3);
  });

  it('fails when preview runs without sprite', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(previewModule.default(['3001'])).rejects.toThrow('exit');

    const expectedPath = path.join(cwd, 'output', 'AvatarSprite.webp');
    expect(errorSpy).toHaveBeenCalledWith(
      `Sprite image not found at ${expectedPath}. Create it by running the generate command.`,
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

  it('exits on invalid gridSize or pictureSize', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-invalid-'));
    fs.mkdirSync(path.join(tmpDir, 'output'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'output', 'AvatarSprite.webp'), Buffer.from([0]));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      startPreviewServer({
        port: 0,
        cwd: tmpDir,
        open: false,
        gridSize: 0,
        pictureSize: 160,
        exitOnError: false,
      }),
    ).rejects.toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith('gridSize must be a positive integer.');
    errorSpy.mockClear();

    await expect(
      startPreviewServer({
        port: 0,
        cwd: tmpDir,
        open: false,
        gridSize: 4,
        pictureSize: 160,
        exitOnError: false,
      }),
    ).rejects.toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith('gridSize must be an odd integer.');
    errorSpy.mockClear();

    await expect(
      startPreviewServer({
        port: 0,
        cwd: tmpDir,
        open: false,
        gridSize: 5,
        pictureSize: 0,
        exitOnError: false,
      }),
    ).rejects.toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith('pictureSize must be a positive integer.');
  });

  it('extracts grid metadata or exits with error', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livepic-preview-meta-'));
    const metaPath = path.join(tmpDir, 'output', 'sprite.json');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => extractGridMetadata(tmpDir)).toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith(
      `Sprite metadata not found at ${metaPath}. Make sure to have a valid sprite.json or provide required properties via CLI.`,
    );

    fs.mkdirSync(path.dirname(metaPath), { recursive: true });
    fs.writeFileSync(metaPath, '{bad json');
    errorSpy.mockClear();
    expect(() => extractGridMetadata(tmpDir)).toThrow('exit');
    expect(errorSpy).toHaveBeenCalledWith(
      `Failed to read sprite metadata at ${metaPath}. Make sure it is a valid JSON file.`,
    );

    exitSpy.mockRestore();
    errorSpy.mockRestore();
    fs.writeFileSync(metaPath, JSON.stringify({ gridSize: 5, pictureSize: 160 }));
    expect(extractGridMetadata(tmpDir)).toEqual({ gridSize: 5, pictureSize: 160 });
  });

  it('resolves dist files', () => {
    const resolved = resolvePath({ pathname: '/dist/index.js', cwd });
    expect(resolved).toBeTruthy();
    expect(resolved && resolved.endsWith(path.join('dist', 'index.js'))).toBe(true);
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
