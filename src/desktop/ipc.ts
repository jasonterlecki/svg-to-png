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

export interface UiInputBase {
  id: string;
  label: string;
  nameHint: string;
}

export interface UiInputFile extends UiInputBase {
  type: 'file';
  path: string;
}

export interface UiInputInline extends UiInputBase {
  type: 'inline';
  svg: string;
  baseUrl?: string;
}

export type UiInputSource = UiInputFile | UiInputInline;

export interface UiConvertRequest {
  inputs: UiInputSource[];
  outputDir: string;
  options: UiRenderOptions;
}

export interface UiConvertResult {
  successes: number;
  failures: Array<{ id: string; label: string; error: string }>;
}

export type UiJobStatus = 'pending' | 'queued' | 'started' | 'succeeded' | 'failed';

export interface UiProgressEvent {
  id: string;
  label: string;
  status: UiJobStatus;
  message?: string;
}

export interface UiCompleteEvent {
  successes: number;
  failures: number;
  cancelled: boolean;
}

export type UiPresetOptions = Partial<UiRenderOptions>;

export interface UiPreset {
  name: string;
  description?: string;
  options: UiPresetOptions;
}

export interface UiPresetListResult {
  presets: UiPreset[];
  path: string | null;
}

export interface UiPresetSavePayload {
  name: string;
  description?: string;
  options: UiPresetOptions;
}

export interface UiFetchedUrlResult {
  svg: string;
  baseUrl?: string;
  label: string;
  nameHint: string;
}
