import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { DEFAULT_PORT, SPRITE_FILE } from './constants.js';
import { parseGridSize } from './grid-size.js';
import { contentType, renderHtml, safeJoin, spriteMetaPath } from './preview-utils.js';

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..', '..');
const distDir = path.join(packageRoot, 'dist');
const previewModules = new Set([
  '/dist/browser.js',
  '/dist/index.js',
  '/dist/livepic/constants.js',
  '/dist/livepic/attributes.js',
  '/dist/livepic/image-load-task.js',
]);

type PreviewCliArgs = {
  port?: number | null;
  gridSize?: number | null;
  pictureSize?: number | null;
  host?: string;
};

export default async function preview(args: string[] = []) {
  const {
    port: rawPort,
    gridSize: rawGridSize,
    pictureSize: rawPictureSize,
    host,
  } = parsePreviewArgs(args);
  const port = rawPort ?? DEFAULT_PORT;
  const gridSize = rawGridSize ?? undefined;
  const pictureSize = rawPictureSize ?? undefined;
  const cwd = process.cwd();
  await startPreviewServer({ port, cwd, gridSize, pictureSize, open: true, host });
}

export async function startPreviewServer({
  port,
  cwd,
  open,
  gridSize,
  pictureSize,
  spriteFile = SPRITE_FILE,
  exitOnError = true,
  host = '127.0.0.1',
}: {
  port: number;
  cwd: string;
  open: boolean;
  gridSize?: number;
  pictureSize?: number;
  spriteFile?: string;
  exitOnError?: boolean;
  host?: string;
}) {
  const spritePath = safeJoin(cwd, spriteFile);

  if (!spritePath || path.isAbsolute(spriteFile)) {
    throw new Error(`Invalid sprite file: ${spriteFile}. Expected a relative path inside ${cwd}.`);
  }

  if (!existsSync(spritePath)) {
    console.error(
      `Sprite image not found at ${spritePath}. Create it by running the generate command.`,
    );
    process.exit(1);
  }

  const spriteUrl = `/${path.relative(cwd, spritePath).split(path.sep).map(encodeURIComponent).join('/')}`;

  if (gridSize === undefined || pictureSize === undefined) {
    const meta = extractGridMetadata(cwd);
    gridSize ??= meta.gridSize && Number(meta.gridSize);
    pictureSize ??= meta.pictureSize && Number(meta.pictureSize);
  }

  if (gridSize === undefined || pictureSize === undefined) {
    const missingProp = gridSize === undefined ? 'gridSize' : 'pictureSize';
    console.error(
      `Property ${missingProp} was not explicitly provided. Please provide it as a command line argument or as a sprite.json file property.`,
    );
    process.exit(1);
  }

  gridSize = parseGridSize(gridSize);

  if (!Number.isInteger(pictureSize) || pictureSize <= 0) {
    console.error('pictureSize must be a positive integer.');
    process.exit(1);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    // Serve dynamic HTML at root
    if (pathname === '/') {
      const html = renderHtml({
        gridSize,
        pictureSize,
        sprite: spriteUrl,
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
      return;
    }

    const filePath = resolvePath({ pathname, cwd, spritePath });
    if (!filePath) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    res.setHeader('Content-Type', contentType(filePath));
    createReadStream(filePath).pipe(res);
  });

  server.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try another one: livepic preview <port>`);
    } else {
      console.error('Failed to start preview server:', err);
    }
    if (exitOnError) {
      process.exit(1);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const realPort = typeof address === 'object' && address ? address.port : port;
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host;
  const urlHost = isIP(displayHost) === 6 ? `[${displayHost}]` : displayHost;
  const url = `http://${urlHost}:${realPort}/`;
  console.log(`Preview server running at ${url}`);
  if (open) {
    await openInBrowser(url);
  }

  return server;
}

export function extractGridMetadata(cwd: string) {
  const metaPath = spriteMetaPath(cwd);
  if (!existsSync(metaPath)) {
    console.error(
      `Sprite metadata not found at ${metaPath}. Make sure to have a valid sprite.json or provide required properties via CLI.`,
    );
    process.exit(1);
  }

  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    return meta;
  } catch {
    console.error(
      `Failed to read sprite metadata at ${metaPath}. Make sure it is a valid JSON file.`,
    );
    process.exit(1);
  }
}

export function parsePort(raw?: string) {
  const port = parsePositiveInteger(raw);
  return port !== null && port <= 65535 && port >= 1024 ? port : null;
}

export function parsePositiveInteger(raw: string | number | undefined) {
  if (!raw) return null;
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export function parsePreviewArgs(args: string[]): PreviewCliArgs {
  const result: PreviewCliArgs = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const hasEquals = arg.includes('=');
    const isPositionalPort = !arg.startsWith('-') || /^-\d/.test(arg);
    const [key, value] = hasEquals ? arg.split('=').map((s) => s.trim()) : [arg, args[i + 1]];
    if (!hasEquals && !isPositionalPort) i++;

    switch (key) {
      case '--grid-size':
      case '-g': {
        result.gridSize = parseGridSize(value);
        break;
      }

      case '--picture-size':
      case '-s': {
        const pictureSize = parsePositiveInteger(value);
        if (pictureSize === null) {
          console.error(`Invalid picture size: ${value}`);
          process.exit(1);
        }
        result.pictureSize = pictureSize;
        break;
      }

      case '--port':
      case '-p': {
        const port = parsePort(value);
        if (port === null) {
          console.error(`Invalid port: ${value}`);
          process.exit(1);
        }
        result.port = port;
        break;
      }

      case '--host': {
        if (!value || value.startsWith('-')) {
          console.error(`Invalid host: ${value}. Expected a hostname or IP address.`);
          process.exit(1);
        }
        result.host = value;
        break;
      }

      default:
        if (args.length === 1 || isPositionalPort) {
          const port = parsePort(arg);
          if (port === null) {
            console.error(`Invalid port: ${arg}`);
            process.exit(1);
          }
          result.port = port;
        }
        break;
    }
  }

  return result;
}

export function resolvePath({
  pathname,
  cwd,
  spritePath,
}: {
  pathname: string;
  cwd: string;
  spritePath: string;
}) {
  if (safeJoin(cwd, pathname) === spritePath) return spritePath;
  if (!previewModules.has(pathname)) return null;

  const candidate = safeJoin(distDir, pathname.slice('/dist/'.length));
  return candidate && existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
}

async function openInBrowser(url: string) {
  const platform = process.platform;
  const commands: string[] = [];

  if (platform === 'darwin') commands.push(`open "${url}"`);
  else if (platform === 'win32') commands.push(`start "" "${url}"`);
  else commands.push(`xdg-open "${url}"`);

  for (const command of commands) {
    try {
      await execAsync(command);
      return;
    } catch {
      // Try next option
    }
  }

  console.log(`Could not auto-open browser. Please open: ${url}`);
}
