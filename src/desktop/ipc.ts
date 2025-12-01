import type { OutputFormat } from '../types.js';

export interface UiRenderOptions {
  format: OutputFormat;
  width?: number;
  height?: number;
  scale?: number;
  background?: string;
  time?: number;
  extraCss?: string;
  allowExternalStyles?: boolean;
}

export interface UiConvertRequest {
  inputPaths: string[];
  outputDir: string;
  options: UiRenderOptions;
}

export interface UiConvertResult {
  successes: number;
  failures: Array<{ path: string; error: string }>;
}
