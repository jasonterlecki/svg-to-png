import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserRenderer } from './renderer/browserRenderer.js';
import type { BrowserRenderJob } from './renderer/browserRenderer.js';
import { readFile } from './utils/fileIO.js';
import type { RenderOptions, RenderResult, SvgSource } from './types.js';

export type { OutputFormat, RenderOptions, RenderResult, SvgSource } from './types.js';
export { BrowserRenderer } from './renderer/browserRenderer.js';

let sharedRenderer: BrowserRenderer | null = null;

function getRenderer(): BrowserRenderer {
  if (!sharedRenderer) {
    sharedRenderer = new BrowserRenderer();
  }
  return sharedRenderer;
}

function resolveBaseUrl(explicit?: string, fallback?: string): string | undefined {
  return explicit ?? fallback;
}

export async function renderSvg(source: SvgSource, options: RenderOptions = {}): Promise<RenderResult> {
  const renderer = getRenderer();
  const job: BrowserRenderJob = {
    svg: source.svg,
    width: options.width,
    height: options.height,
    scale: options.scale,
    background: options.background,
    format: options.format,
    time: options.time,
    extraCss: options.extraCss,
    baseUrl: resolveBaseUrl(options.baseUrl, source.baseUrl),
    allowExternalStyles: options.allowExternalStyles,
    navigationTimeoutMs: options.navigationTimeoutMs,
  };

  return renderer.render(job);
}

export async function renderSvgFile(filePath: string, options: RenderOptions = {}): Promise<RenderResult> {
  const absolutePath = path.resolve(filePath);
  const svg = await readFile(absolutePath);
  const directoryUrl = buildDirectoryFileUrl(path.dirname(absolutePath));

  return renderSvg(
    {
      svg,
      baseUrl: options.baseUrl ?? directoryUrl,
    },
    options,
  );
}

export async function shutdownRenderer(): Promise<void> {
  if (!sharedRenderer) {
    return;
  }

  await sharedRenderer.close();
  sharedRenderer = null;
}

function buildDirectoryFileUrl(directory: string): string {
  const fileUrl = pathToFileURL(directory).href;
  return fileUrl.endsWith('/') ? fileUrl : `${fileUrl}/`;
}
