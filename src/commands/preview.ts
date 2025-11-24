import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { DEFAULT_PORT, SPRITE_FILE } from './constants.js';
import {
  contentType,
  renderHtml,
  safeJoin,
  spriteFilePath,
  spriteMetaPath,
} from './preview-utils.js';

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..', '..');
const distDir = path.join(packageRoot, 'dist');

export default async function preview(args: string[] = []) {
  const port = parsePort(args[0]) ?? DEFAULT_PORT;
  const cwd = process.cwd();
  await startPreviewServer({ port, cwd, open: true });
}

export async function startPreviewServer({
  port,
  cwd,
  open,
  exitOnError = true,
  host = '0.0.0.0',
}: {
  port: number;
  cwd: string;
  open: boolean;
  exitOnError?: boolean;
  host?: string;
}) {
  const metaPath = spriteMetaPath(cwd);
  const spritePath = spriteFilePath(cwd);

  if (!existsSync(metaPath)) {
    console.error(`Sprite metadata not found at ${metaPath}. Run generate first.`);
    process.exit(1);
  }
  if (!existsSync(spritePath)) {
    console.error(`Sprite image not found at ${spritePath}. Run generate first.`);
    process.exit(1);
  }

  let gridSize: number;
  let spritePictureSize: number;

  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    gridSize = meta.gridSize;
    spritePictureSize = meta.spritePictureSize;
  } catch {
    console.error(
      `Failed to read sprite metadata at ${metaPath}. Run generate first to create it.`,
    );
    process.exit(1);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    // Serve dynamic HTML at root
    if (pathname === '/') {
      const html = renderHtml({
        gridSize,
        spritePictureSize,
        spriteSrc: `/${SPRITE_FILE}`,
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
      return;
    }

    const filePath = resolvePath({ pathname, cwd });
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
      console.error(`Port ${port} is already in use. Try another one: npm run preview -- <port>`);
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
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  const url = `http://${displayHost}:${realPort}/`;
  console.log(`Preview server running at ${url}`);
  if (open) {
    await openInBrowser(url);
  }

  return server;
}

export function parsePort(raw?: string) {
  if (!raw) return null;
  const num = Number(raw);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export function resolvePath({ pathname, cwd }: { pathname: string; cwd: string }) {
  // Dist files served from package dist directory
  if (pathname.startsWith('/dist/')) {
    const candidate = safeJoin(distDir, pathname.replace('/dist/', ''));
    return candidate && existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
  }

  const candidate = safeJoin(cwd, pathname);
  if (candidate && existsSync(candidate)) {
    if (statSync(candidate).isDirectory()) {
      const indexInside = path.join(candidate, 'index.html');
      return existsSync(indexInside) ? indexInside : null;
    }
    return candidate;
  }

  return null;
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
