import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(testDir, 'fixtures');
const simpleSvgPath = path.join(fixturesDir, 'simple.svg');

const { renderSvgFileMock, shutdownRendererMock } = vi.hoisted(() => {
  const renderMock = vi.fn(async (_input: string, options?: { format?: string }) => ({
    buffer: Buffer.from('mock-image'),
    width: 32,
    height: 32,
    format: (options?.format ?? 'png') as 'png' | 'jpeg' | 'webp',
  }));
  const shutdownMock = vi.fn(async () => undefined);
  return { renderSvgFileMock: renderMock, shutdownRendererMock: shutdownMock };
});

vi.mock('../src/index', () => ({
  renderSvgFile: renderSvgFileMock,
  shutdownRenderer: shutdownRendererMock,
}));

describe('CLI', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svg2raster-cli-'));
    renderSvgFileMock.mockClear();
    shutdownRendererMock.mockClear();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('renders a single file to a specific output path', async () => {
    const outFile = path.join(tmpDir, 'icon.png');
    await runCli(['node', 'cli', simpleSvgPath, '--out', outFile, '--silent']);
    const output = await fs.readFile(outFile, 'utf8');
    expect(output).toBe('mock-image');
    expect(renderSvgFileMock).toHaveBeenCalledTimes(1);
    expect(renderSvgFileMock.mock.calls[0][0]).toBe(path.resolve(simpleSvgPath));
  });

  it('renders multiple files into a directory with inferred names', async () => {
    const copyA = path.join(tmpDir, 'a.svg');
    const copyB = path.join(tmpDir, 'b.svg');
    await fs.copyFile(simpleSvgPath, copyA);
    await fs.copyFile(simpleSvgPath, copyB);
    const outDir = path.join(tmpDir, 'output');

    await runCli([
      'node',
      'cli',
      copyA,
      copyB,
      '--out-dir',
      outDir,
      '--format',
      'jpeg',
      '--silent',
    ]);

    const files = await fs.readdir(outDir);
    expect(files.sort()).toEqual(['a.jpeg', 'b.jpeg']);
    expect(renderSvgFileMock).toHaveBeenCalledTimes(2);
  });

  it('throws when --out is combined with multiple inputs', async () => {
    const first = path.join(tmpDir, 'first.svg');
    const second = path.join(tmpDir, 'second.svg');
    await fs.copyFile(simpleSvgPath, first);
    await fs.copyFile(simpleSvgPath, second);

    await expect(
      runCli(['node', 'cli', first, second, '--out', path.join(tmpDir, 'out.png'), '--silent']),
    ).rejects.toThrow('--out can only be used with a single input');
  });
});
