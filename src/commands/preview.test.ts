import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePort, resolvePath } from './preview.js';

const cwd = process.cwd();

describe('preview helpers', () => {
  it('parses ports', () => {
    expect(parsePort('4000')).toBe(4000);
    expect(parsePort('abc')).toBeNull();
    expect(parsePort('-1')).toBeNull();
    expect(parsePort()).toBeNull();
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
