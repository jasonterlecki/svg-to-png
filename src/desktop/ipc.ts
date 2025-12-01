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

export type UiJobStatus = 'queued' | 'started' | 'succeeded' | 'failed';

export interface UiProgressEvent {
  path: string;
  status: UiJobStatus;
  message?: string;
}

export interface UiCompleteEvent {
  successes: number;
  failures: number;
  cancelled: boolean;
}
