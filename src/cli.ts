#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander';
import fg from 'fast-glob';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { SUPPORTED_FORMATS } from './config.js';
import type { OutputFormat, RenderOptions } from './types.js';
import { renderSvg, renderSvgFile, renderSvgUrl, shutdownRenderer } from './index.js';
import { getPresetSearchPaths, loadPresetByName, loadPresetCollection } from './presets.js';

const DEFAULT_CONCURRENCY = Math.max(1, Math.min(os.cpus()?.length ?? 4, 4));

export interface CliFlags {
  out?: string;
  outDir?: string;
  format?: OutputFormat;
  width?: number;
  height?: number;
  scale?: number;
  background?: string;
  css?: string;
  time?: number;
  concurrency: number;
  silent?: boolean;
  verbose?: boolean;
  disableExternalStyles?: boolean;
  preset?: string;
  presetFile?: string;
  listPresets?: boolean;
  stdin?: boolean;
  inputRaw?: string[];
  url?: string[];
}

type RenderJob =
  | {
      type: 'file';
      inputPath: string;
      outputPath: string;
      label: string;
    }
  | {
      type: 'url';
      url: string;
      outputPath: string;
      label: string;
    }
  | {
      type: 'inline';
      svg: string;
      baseUrl?: string;
      outputPath: string;
      label: string;
    };

type ResolvedInput =
  | {
      type: 'file';
      path: string;
      baseName: string;
      label: string;
    }
  | {
      type: 'url';
      url: string;
      baseName: string;
      label: string;
    }
  | {
      type: 'inline';
      svg: string;
      baseName: string;
      label: string;
      baseUrl?: string;
    };

interface Logger {
  info: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface CliExecutionOptions {
  signal?: AbortSignal;
  logger?: Logger;
}

export async function runCli(argv: readonly string[]): Promise<void> {
  const program = buildProgram();
  const parsed = await program.parseAsync(argv);
  const inputs = (parsed.args as string[]) ?? [];
  const options = parsed.opts<CliFlags>();
  options.presetFile = options.presetFile ? path.resolve(options.presetFile) : undefined;

  if (options.listPresets) {
    await listAvailablePresets(options);
    return;
  }

  const controller = new AbortController();
  let sigintCount = 0;
  const handleSigint = (): void => {
    sigintCount += 1;
    if (sigintCount === 1) {
      controller.abort();
    } else {
      process.exit(130);
    }
  };
  process.on('SIGINT', handleSigint);

  try {
    await executeCli(inputs, options, { signal: controller.signal });
  } finally {
    process.off('SIGINT', handleSigint);
  }
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name('svg2raster')
    .description('Convert SVG assets to PNG/JPEG/WebP using a headless Chromium renderer.')
    .argument('[inputs...]', 'Input SVG paths or glob patterns (quotes recommended for globs).')
    .option('-o, --out <file>', 'Output file path (single input only).')
    .option('--out-dir <dir>', 'Output directory for batch conversion.')
    .option('-f, --format <format>', 'Output format (png, jpeg, webp).', parseFormat)
    .option('-w, --width <pixels>', 'Target width in pixels.', (value) =>
      parsePositiveInteger(value, 'width'),
    )
    .option('-h, --height <pixels>', 'Target height in pixels.', (value) =>
      parsePositiveInteger(value, 'height'),
    )
    .option('-s, --scale <factor>', 'Device scale factor (e.g., 2 for @2x).', (value) =>
      parsePositiveFloat(value, 'scale'),
    )
    .option('-b, --background <color>', 'Background color or "transparent".')
    .option('--css <file>', 'Path to an extra CSS file to inject before rendering.')
    .option('-t, --time <seconds>', 'Timestamp (seconds) for animated SVGs.', (value) =>
      parseNonNegativeFloat(value, 'time'),
    )
    .option(
      '--concurrency <count>',
      'Number of parallel render jobs.',
      (value) => parsePositiveInteger(value, 'concurrency'),
      DEFAULT_CONCURRENCY,
    )
    .option('--disable-external-styles', 'Prevent loading external stylesheets referenced by the SVG.')
    .option('--stdin', 'Read SVG markup from STDIN (can be combined with other inputs).')
    .option('--input-raw <svg...>', 'Raw SVG markup to render (repeatable).', collectValues, [])
    .option('--url <address>', 'Remote SVG URL to render (repeatable).', collectValues, [])
    .option('--preset <name>', 'Load render options from a named preset.')
    .option('--preset-file <file>', 'Path to a presets JSON file (defaults to svg2raster.presets.json or ~/.config/svg2raster/).')
    .option('--list-presets', 'List available presets and exit.')
    .option('--silent', 'Suppress non-error log output.')
    .option('--verbose', 'Enable verbose log output.');

  return program;
}

export async function executeCli(
  inputs: string[],
  flags: CliFlags,
  context: CliExecutionOptions = {},
): Promise<void> {
  const logger = context.logger ?? createLogger(flags);
  const { filePatterns, urlInputs } = partitionInputArguments(inputs);
  const resolvedFilePaths = await resolveInputFiles(filePatterns);
  const extraUrls = flags.url ?? [];
  const remoteUrlInputs = [...urlInputs, ...extraUrls];
  const inlineMarkupSources: Array<{ svg: string; label: string }> = [];
  const rawInputs = flags.inputRaw ?? [];
  rawInputs.forEach((value, index) => {
    if (!value?.trim()) {
      throw new InvalidArgumentError('--input-raw value cannot be empty.');
    }
    inlineMarkupSources.push({ svg: value, label: `raw-${index + 1}` });
  });

  if (flags.stdin) {
    const stdinSvg = await readStdin();
    inlineMarkupSources.push({ svg: stdinSvg, label: 'stdin' });
  }

  const resolvedInputs: ResolvedInput[] = [];
  let fileIndex = 0;
  for (const filePath of resolvedFilePaths) {
    const parsed = path.parse(filePath);
    const fallbackName = `file-${++fileIndex}`;
    const baseName = sanitizeFileStem(parsed.name, fallbackName);
    resolvedInputs.push({
      type: 'file',
      path: path.resolve(filePath),
      baseName,
      label: filePath,
    });
  }

  let remoteIndex = 0;
  for (const urlInput of remoteUrlInputs) {
    const trimmed = urlInput?.trim();
    if (!trimmed) {
      throw new InvalidArgumentError('URL inputs cannot be empty.');
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmed);
    } catch {
      throw new InvalidArgumentError(`Invalid URL: ${trimmed}`);
    }
    const fallbackName = `remote-${++remoteIndex}`;
    const baseName = sanitizeFileStem(deriveBaseNameFromUrl(parsedUrl, fallbackName), fallbackName);
    resolvedInputs.push({
      type: 'url',
      url: parsedUrl.toString(),
      baseName,
      label: parsedUrl.toString(),
    });
  }

  let inlineIndex = 0;
  for (const inlineSource of inlineMarkupSources) {
    inlineIndex += 1;
    const fallbackName = inlineSource.label || `inline-${inlineIndex}`;
    const baseName = sanitizeFileStem(fallbackName, `inline-${inlineIndex}`);
    resolvedInputs.push({
      type: 'inline',
      svg: inlineSource.svg,
      baseName,
      label: inlineSource.label || fallbackName,
    });
  }

  if (resolvedInputs.length === 0) {
    if (filePatterns.length > 0) {
      throw new InvalidArgumentError('No SVG files matched the provided inputs.');
    }
    throw new InvalidArgumentError(
      'Provide at least one SVG source (file path, URL, --input-raw, or --stdin).',
    );
  }

  if (flags.out && resolvedInputs.length !== 1) {
    throw new InvalidArgumentError('--out can only be used with a single input.');
  }

  const outDir = flags.outDir ? path.resolve(flags.outDir) : undefined;
  if (!flags.out && resolvedInputs.length > 1 && !outDir) {
    throw new InvalidArgumentError('For multiple inputs, specify --out-dir to choose an output folder.');
  }

  const presetResult = flags.preset
    ? await loadPresetByName(flags.preset, flags.presetFile)
    : null;
  if (flags.preset && !presetResult) {
    const searchDescription = getPresetSearchPaths(flags.presetFile)
      .map((candidate) => candidate)
      .join(', ');
    throw new InvalidArgumentError(
      `Preset "${flags.preset}" was not found. Checked: ${searchDescription}`,
    );
  }
  const presetOptions = presetResult?.preset.options ?? {};

  const extraCss = flags.css ? await fs.readFile(path.resolve(flags.css), 'utf8') : undefined;
  const renderOptions: RenderOptions = mergeRenderOptions(presetOptions, {
    format: flags.format,
    width: flags.width,
    height: flags.height,
    scale: flags.scale,
    background: flags.background,
    extraCss,
    time: flags.time,
    allowExternalStyles: flags.disableExternalStyles ? false : undefined,
  });

  if (!renderOptions.format) {
    renderOptions.format = presetOptions.format ?? 'png';
  }
  const outputFormat = renderOptions.format ?? 'png';

  const jobs = createJobs(resolvedInputs, outputFormat, {
    outFile: flags.out,
    outDir,
  });

  const concurrency = Math.max(1, Math.min(flags.concurrency ?? DEFAULT_CONCURRENCY, 32));
  logger.verbose(`Rendering ${jobs.length} file(s) with concurrency ${concurrency}.`);

  if (context.signal?.aborted) {
    throw new Error('Conversion cancelled before start.');
  }

  const controller = context.signal;
  let cancelled = false;
  const abortHandler = (): void => {
    if (!cancelled) {
      cancelled = true;
      logger.info('Cancellation requested. Waiting for in-flight renders to finish… (press Ctrl+C again to force exit)');
    }
  };
  controller?.addEventListener('abort', abortHandler);

  const errors: Array<{ job: RenderJob; error: unknown }> = [];
  let nextIndex = 0;
  let completed = 0;
  let failed = 0;
  const total = jobs.length;
  const startTime = Date.now();

  async function worker(): Promise<void> {
    while (true) {
      if (cancelled) {
        return;
      }
      const jobIndex = nextIndex++;
      if (jobIndex >= jobs.length) {
        return;
      }

      const job = jobs[jobIndex];
      try {
        const info = await processJob(job, renderOptions);
        completed += 1;
        logJobSuccess(logger, job, info, completed + failed, total);
      } catch (error) {
        failed += 1;
        logJobFailure(logger, job, error, completed + failed, total);
        errors.push({ job, error });
      }
    }
  }

  try {
    const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker());
    await Promise.all(workers);
  } finally {
    controller?.removeEventListener('abort', abortHandler);
    await shutdownRenderer().catch(() => undefined);
  }

  if (cancelled) {
    throw new Error(`Conversion cancelled after ${completed + failed} of ${total} file(s).`);
  }

  if (errors.length > 0) {
    for (const failure of errors) {
      logger.error(
        `Failed to convert ${failure.job.label}: ${
          failure.error instanceof Error ? failure.error.message : failure.error
        }`,
      );
    }
    throw new Error(`${errors.length} job(s) failed.`);
  }

  const duration = Date.now() - startTime;
  logger.info(`Converted ${completed} SVG file(s) in ${duration}ms.`);
}

async function resolveInputFiles(patterns: string[]): Promise<string[]> {
  const matches = await fg(patterns, {
    absolute: true,
    onlyFiles: true,
    unique: true,
    dot: false,
    followSymbolicLinks: true,
  });
  return matches;
}

function createJobs(
  inputs: ResolvedInput[],
  format: OutputFormat,
  targets: { outFile?: string; outDir?: string },
): RenderJob[] {
  const jobs: RenderJob[] = [];
  const resolvedOutDir = targets.outDir ? path.resolve(targets.outDir) : undefined;
  const extension = extensionForFormat(format);

  inputs.forEach((input, index) => {
    let outputPath: string;
    const fallbackName = `output-${index + 1}`;
    const stem = input.baseName || fallbackName;

    if (targets.outFile) {
      outputPath = path.resolve(targets.outFile);
    } else if (resolvedOutDir) {
      outputPath = path.join(resolvedOutDir, `${stem}.${extension}`);
    } else {
      const defaultDir =
        input.type === 'file' ? path.dirname(input.path) : process.cwd();
      outputPath = path.join(defaultDir, `${stem}.${extension}`);
    }

    if (input.type === 'file') {
      jobs.push({
        type: 'file',
        inputPath: path.resolve(input.path),
        outputPath,
        label: input.label,
      });
    } else if (input.type === 'url') {
      jobs.push({
        type: 'url',
        url: input.url,
        outputPath,
        label: input.label,
      });
    } else {
      jobs.push({
        type: 'inline',
        svg: input.svg,
        baseUrl: input.baseUrl,
        outputPath,
        label: input.label,
      });
    }
  });

  return jobs;
}

interface JobInfo {
  format: OutputFormat;
  width: number;
  height: number;
  durationMs: number;
}

async function processJob(job: RenderJob, options: RenderOptions): Promise<JobInfo> {
  const start = Date.now();
  let result;
  if (job.type === 'file') {
    result = await renderSvgFile(job.inputPath, options);
  } else if (job.type === 'url') {
    result = await renderSvgUrl(job.url, options);
  } else {
    result = await renderSvg(
      {
        svg: job.svg,
        baseUrl: job.baseUrl,
      },
      options,
    );
  }
  await fs.mkdir(path.dirname(job.outputPath), { recursive: true });
  await fs.writeFile(job.outputPath, result.buffer);
  const duration = Date.now() - start;
  return {
    format: result.format,
    width: result.width,
    height: result.height,
    durationMs: duration,
  };
}

function logJobSuccess(
  logger: Logger,
  job: RenderJob,
  info: JobInfo,
  processed: number,
  total: number,
): void {
  logger.info(
    `[${processed}/${total}] ✔ ${job.label} → ${job.outputPath} (${info.format.toUpperCase()} ${info.width}x${info.height}, ${info.durationMs}ms)`,
  );
}

function logJobFailure(
  logger: Logger,
  job: RenderJob,
  error: unknown,
  processed: number,
  total: number,
): void {
  const reason = error instanceof Error ? error.message : String(error);
  logger.error(`[${processed}/${total}] ✖ ${job.label} (${reason})`);
}

function extensionForFormat(format: OutputFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

function parseFormat(value: string): OutputFormat {
  const normalized = value.toLowerCase() as OutputFormat;
  if (!SUPPORTED_FORMATS.includes(normalized)) {
    throw new InvalidArgumentError(`Unsupported format "${value}". Choose from: ${SUPPORTED_FORMATS.join(', ')}`);
  }
  return normalized;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`${label} must be a positive integer.`);
  }
  return parsed;
}

function parsePositiveFloat(value: string, label: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`${label} must be a positive number.`);
  }
  return parsed;
}

function parseNonNegativeFloat(value: string, label: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new InvalidArgumentError(`${label} must be zero or greater.`);
  }
  return parsed;
}

function collectValues(value: string, previous?: string[]): string[] {
  const list = previous ?? [];
  list.push(value);
  return list;
}

function partitionInputArguments(entries: string[]): {
  filePatterns: string[];
  urlInputs: string[];
} {
  const filePatterns: string[] = [];
  const urlInputs: string[] = [];
  for (const entry of entries) {
    if (isHttpUrl(entry)) {
      urlInputs.push(entry);
    } else {
      filePatterns.push(entry);
    }
  }
  return { filePatterns, urlInputs };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function deriveBaseNameFromUrl(url: URL, fallback: string): string {
  const pathname = url.pathname.replace(/\/+$/, '');
  const lastSegment = pathname.split('/').filter(Boolean).pop();
  if (!lastSegment) {
    return fallback;
  }
  const withoutQuery = lastSegment.split('?')[0].split('#')[0];
  const dotIndex = withoutQuery.lastIndexOf('.');
  if (dotIndex > 0) {
    return withoutQuery.slice(0, dotIndex) || fallback;
  }
  return withoutQuery || fallback;
}

function sanitizeFileStem(stem: string, fallback: string): string {
  const cleaned = stem
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new InvalidArgumentError('No STDIN data detected. Pipe an SVG into --stdin.');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const content = Buffer.concat(chunks).toString('utf8');
  if (!content.trim()) {
    throw new InvalidArgumentError('STDIN was empty.');
  }
  return content;
}

function createLogger(flags: CliFlags): Logger {
  return {
    info: (...args: unknown[]) => {
      if (!flags.silent) {
        console.log(...args);
      }
    },
    verbose: (...args: unknown[]) => {
      if (!flags.silent && flags.verbose) {
        console.log(...args);
      }
    },
    error: (...args: unknown[]) => {
      console.error(...args);
    },
  };
}

async function listAvailablePresets(flags: CliFlags): Promise<void> {
  const collection = await loadPresetCollection(flags.presetFile);
  if (!collection || collection.presets.length === 0) {
    console.log(
      'No presets found. Create svg2raster.presets.json in your project or ~/.config/svg2raster/.',
    );
    return;
  }

  console.log(`Presets (${collection.path}):`);
  for (const preset of collection.presets) {
    if (preset.description) {
      console.log(` - ${preset.name}: ${preset.description}`);
    } else {
      console.log(` - ${preset.name}`);
    }
  }
}

function mergeRenderOptions(
  preset: RenderOptions,
  overrides: RenderOptions,
): RenderOptions {
  const merged: RenderOptions = { ...preset };
  if (overrides.format) merged.format = overrides.format;
  if (overrides.width !== undefined) merged.width = overrides.width;
  if (overrides.height !== undefined) merged.height = overrides.height;
  if (overrides.scale !== undefined) merged.scale = overrides.scale;
  if (overrides.background !== undefined) merged.background = overrides.background;
  if (overrides.extraCss !== undefined) merged.extraCss = overrides.extraCss;
  if (overrides.time !== undefined) merged.time = overrides.time;
  if (overrides.allowExternalStyles !== undefined) {
    merged.allowExternalStyles = overrides.allowExternalStyles;
  }
  if (overrides.baseUrl !== undefined) merged.baseUrl = overrides.baseUrl;
  if (overrides.navigationTimeoutMs !== undefined) {
    merged.navigationTimeoutMs = overrides.navigationTimeoutMs;
  }
  return merged;
}

const isMainModule =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  runCli(process.argv).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
