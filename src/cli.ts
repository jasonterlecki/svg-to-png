#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander';
import fg from 'fast-glob';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { SUPPORTED_FORMATS } from './config.js';
import type { OutputFormat, RenderOptions } from './types.js';
import { renderSvgFile, shutdownRenderer } from './index.js';

const DEFAULT_CONCURRENCY = Math.max(1, Math.min(os.cpus()?.length ?? 4, 4));

interface CliFlags {
  out?: string;
  outDir?: string;
  format: OutputFormat;
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
}

interface RenderJob {
  inputPath: string;
  outputPath: string;
}

interface Logger {
  info: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export async function runCli(argv: readonly string[]): Promise<void> {
  const program = buildProgram();
  const parsed = await program.parseAsync(argv);
  const inputs = parsed.args as string[];
  const options = parsed.opts<CliFlags>();
  await execute(inputs, options);
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name('svg2raster')
    .description('Convert SVG assets to PNG/JPEG/WebP using a headless Chromium renderer.')
    .argument('<inputs...>', 'Input SVG paths or glob patterns (quotes recommended for globs).')
    .option('-o, --out <file>', 'Output file path (single input only).')
    .option('--out-dir <dir>', 'Output directory for batch conversion.')
    .option('-f, --format <format>', 'Output format (png, jpeg, webp).', parseFormat, 'png')
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
    .option('--silent', 'Suppress non-error log output.')
    .option('--verbose', 'Enable verbose log output.');

  return program;
}

async function execute(inputs: string[], flags: CliFlags): Promise<void> {
  if (inputs.length === 0) {
    throw new InvalidArgumentError('At least one input path is required.');
  }

  const logger = createLogger(flags);
  const resolvedInputs = await resolveInputFiles(inputs);
  if (resolvedInputs.length === 0) {
    throw new InvalidArgumentError('No SVG files matched the provided inputs.');
  }

  if (flags.out && resolvedInputs.length !== 1) {
    throw new InvalidArgumentError('--out can only be used with a single input.');
  }

  const outDir = flags.outDir ? path.resolve(flags.outDir) : undefined;
  if (!flags.out && resolvedInputs.length > 1 && !outDir) {
    throw new InvalidArgumentError('For multiple inputs, specify --out-dir to choose an output folder.');
  }

  const extraCss = flags.css ? await fs.readFile(path.resolve(flags.css), 'utf8') : undefined;
  const renderOptions: RenderOptions = {
    format: flags.format,
    width: flags.width,
    height: flags.height,
    scale: flags.scale,
    background: flags.background,
    extraCss,
    time: flags.time,
    allowExternalStyles: flags.disableExternalStyles ? false : undefined,
  };

  const jobs = createJobs(resolvedInputs, flags.format, {
    outFile: flags.out,
    outDir,
  });

  const concurrency = Math.max(1, Math.min(flags.concurrency ?? DEFAULT_CONCURRENCY, 32));
  logger.verbose(`Rendering ${jobs.length} file(s) with concurrency ${concurrency}.`);

  const errors: Array<{ job: RenderJob; error: unknown }> = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const jobIndex = nextIndex++;
      if (jobIndex >= jobs.length) {
        return;
      }

      const job = jobs[jobIndex];
      try {
        await processJob(job, renderOptions, logger);
      } catch (error) {
        errors.push({ job, error });
      }
    }
  }

  try {
    const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker());
    await Promise.all(workers);
  } finally {
    await shutdownRenderer().catch(() => undefined);
  }

  if (errors.length > 0) {
    for (const failure of errors) {
      logger.error(
        `Failed to convert ${failure.job.inputPath}: ${
          failure.error instanceof Error ? failure.error.message : failure.error
        }`,
      );
    }
    throw new Error(`${errors.length} job(s) failed.`);
  }

  logger.info(`Converted ${jobs.length} SVG file(s).`);
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
  inputPaths: string[],
  format: OutputFormat,
  targets: { outFile?: string; outDir?: string },
): RenderJob[] {
  const jobs: RenderJob[] = [];
  const resolvedOutDir = targets.outDir ? path.resolve(targets.outDir) : undefined;
  inputPaths.forEach((inputPath) => {
    let outputPath: string;
    if (targets.outFile) {
      outputPath = path.resolve(targets.outFile);
    } else if (resolvedOutDir) {
      const baseName = path.parse(inputPath).name;
      outputPath = path.join(resolvedOutDir, `${baseName}.${format}`);
    } else {
      const parsed = path.parse(inputPath);
      outputPath = path.join(parsed.dir, `${parsed.name}.${format}`);
    }

    jobs.push({
      inputPath: path.resolve(inputPath),
      outputPath,
    });
  });

  return jobs;
}

async function processJob(
  job: RenderJob,
  options: RenderOptions,
  logger: Logger,
): Promise<void> {
  const start = Date.now();
  const result = await renderSvgFile(job.inputPath, options);
  await fs.mkdir(path.dirname(job.outputPath), { recursive: true });
  await fs.writeFile(job.outputPath, result.buffer);
  const duration = Date.now() - start;
  logger.info(
    `✔ ${path.basename(job.inputPath)} → ${job.outputPath} (${result.format.toUpperCase()} ${result.width}x${result.height}, ${duration}ms)`,
  );
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

const isMainModule =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  runCli(process.argv).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
