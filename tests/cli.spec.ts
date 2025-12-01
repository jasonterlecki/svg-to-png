import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli, executeCli, type CliFlags } from '../src/cli';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(testDir, 'fixtures');
const simpleSvgPath = path.join(fixturesDir, 'simple.svg');
const silentLogger = { info: () => undefined, verbose: () => undefined, error: () => undefined };

const { renderSvgFileMock, renderSvgMock, renderSvgUrlMock, shutdownRendererMock } = vi.hoisted(() => {
  const renderResult = {
    buffer: Buffer.from('mock-image'),
    width: 32,
    height: 32,
  };
  const renderFileMock = vi.fn(async (_input: string, options?: { format?: string }) => ({
    ...renderResult,
    format: (options?.format ?? 'png') as 'png' | 'jpeg' | 'webp',
  }));
  const renderInlineMock = vi.fn(async (_source: { svg: string }, options?: { format?: string }) => ({
    ...renderResult,
    format: (options?.format ?? 'png') as 'png' | 'jpeg' | 'webp',
  }));
  const renderUrlMock = vi.fn(async (_url: string, options?: { format?: string }) => ({
    ...renderResult,
    format: (options?.format ?? 'png') as 'png' | 'jpeg' | 'webp',
  }));
  const shutdownMock = vi.fn(async () => undefined);
  return {
    renderSvgFileMock: renderFileMock,
    renderSvgMock: renderInlineMock,
    renderSvgUrlMock: renderUrlMock,
    shutdownRendererMock: shutdownMock,
  };
});

vi.mock('../src/index', () => ({
  renderSvgFile: renderSvgFileMock,
  renderSvg: renderSvgMock,
  renderSvgUrl: renderSvgUrlMock,
  shutdownRenderer: shutdownRendererMock,
}));

describe('CLI', () => {
  let tmpDir: string;
  const baseFlags: CliFlags = {
    out: undefined,
    outDir: undefined,
    format: 'png',
    width: undefined,
    height: undefined,
    scale: undefined,
    background: undefined,
    css: undefined,
    time: undefined,
    concurrency: 1,
    silent: true,
    verbose: false,
    disableExternalStyles: false,
    preset: undefined,
    presetFile: undefined,
    listPresets: false,
    stdin: false,
    inputRaw: undefined,
    url: undefined,
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svg2raster-cli-'));
    renderSvgFileMock.mockClear();
    renderSvgMock.mockClear();
    renderSvgUrlMock.mockClear();
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
    expect(files.sort()).toEqual(['a.jpg', 'b.jpg']);
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

  it('honors cancellation signals during execution', async () => {
    const outFile = path.join(tmpDir, 'cancel.png');
    const controller = new AbortController();
    const promise = executeCli(
      [simpleSvgPath],
      { ...baseFlags, out: outFile },
      { signal: controller.signal, logger: silentLogger },
    );
    controller.abort();
    await expect(promise).rejects.toThrow(/cancelled/i);
  });

  it('applies options from a preset file', async () => {
    const presetPath = path.join(tmpDir, 'svg2raster.presets.json');
    const presets = {
      presets: [
        {
          name: 'thumb',
          description: 'Thumbnail export',
          options: {
            format: 'jpeg',
            width: 128,
            background: '#fff',
          },
        },
      ],
    };
    await fs.writeFile(presetPath, JSON.stringify(presets, null, 2));

    const outputPath = path.join(tmpDir, 'thumb.jpg');
    await executeCli(
      [simpleSvgPath],
      {
        ...baseFlags,
        out: outputPath,
        format: undefined,
        preset: 'thumb',
        presetFile: presetPath,
      },
      { logger: silentLogger },
    );

    expect(renderSvgFileMock).toHaveBeenCalledTimes(1);
    const [, options] = renderSvgFileMock.mock.calls[0];
    expect(options.format).toBe('jpeg');
    expect(options.width).toBe(128);
    expect(options.background).toBe('#fff');
  });

  it('throws when preset cannot be found', async () => {
    await expect(
      executeCli(
        [simpleSvgPath],
        { ...baseFlags, preset: 'missing', format: undefined },
        { logger: silentLogger },
      ),
    ).rejects.toThrow(/Preset "missing"/);
  });

  it('renders inline SVG provided via --input-raw', async () => {
    const outFile = path.join(tmpDir, 'inline.png');
    await executeCli(
      [],
      {
        ...baseFlags,
        out: outFile,
        inputRaw: ['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
      },
      { logger: silentLogger },
    );
    expect(renderSvgMock).toHaveBeenCalledTimes(1);
    const output = await fs.readFile(outFile, 'utf8');
    expect(output).toBe('mock-image');
  });

  it('renders a remote SVG URL input', async () => {
    const outFile = path.join(tmpDir, 'remote.png');
    await executeCli(
      ['https://example.com/icon.svg'],
      { ...baseFlags, out: outFile },
      { logger: silentLogger },
    );
    expect(renderSvgUrlMock).toHaveBeenCalledTimes(1);
    const output = await fs.readFile(outFile, 'utf8');
    expect(output).toBe('mock-image');
  });
});
