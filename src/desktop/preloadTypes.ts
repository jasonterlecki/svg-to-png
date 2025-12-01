import type {
  UiConvertRequest,
  UiConvertResult,
  UiProgressEvent,
  UiCompleteEvent,
  UiPresetListResult,
  UiPresetSavePayload,
  UiFetchedUrlResult,
} from './ipc.js';

export interface Svg2RasterApi {
  chooseInputFiles(): Promise<string[]>;
  chooseOutputDirectory(): Promise<string | null>;
  convert(request: UiConvertRequest): Promise<UiConvertResult>;
  onProgress(listener: (event: UiProgressEvent) => void): () => void;
  onComplete(listener: (event: UiCompleteEvent) => void): () => void;
  requestCancel(): Promise<void>;
  listPresets(): Promise<UiPresetListResult>;
  savePreset(payload: UiPresetSavePayload): Promise<UiPresetListResult>;
  deletePreset(name: string): Promise<UiPresetListResult>;
  fetchRemoteSvg(url: string): Promise<UiFetchedUrlResult>;
}
