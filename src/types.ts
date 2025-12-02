import { Buffer } from 'node:buffer';

export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'avif';

export interface RenderOptions {
  width?: number;
  height?: number;
  scale?: number;
  background?: string;
  format?: OutputFormat;
  time?: number;
  extraCss?: string;
  baseUrl?: string;
  allowExternalStyles?: boolean;
  navigationTimeoutMs?: number;
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
