import { Buffer } from 'node:buffer';

export type OutputFormat = 'png' | 'jpeg' | 'webp';

export interface RenderOptions {
  width?: number;
  height?: number;
  scale?: number;
  background?: string;
  format?: OutputFormat;
  time?: number;
  extraCss?: string;
  baseUrl?: string;
}

export interface RenderResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: OutputFormat;
}

export interface SvgSource {
  svg: string;
  baseUrl?: string;
}

export async function renderSvg(source: SvgSource, options: RenderOptions = {}): Promise<RenderResult> {
  void source;
  void options;
  throw new Error('renderSvg is not implemented yet');
}

export async function renderSvgFile(path: string, options: RenderOptions = {}): Promise<RenderResult> {
  void path;
  void options;
  throw new Error('renderSvgFile is not implemented yet');
}
