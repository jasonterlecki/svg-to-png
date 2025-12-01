import type {
  UiConvertRequest,
  UiConvertResult,
  UiProgressEvent,
  UiCompleteEvent,
} from './ipc.js';

export interface Svg2RasterApi {
  chooseInputFiles(): Promise<string[]>;
  chooseOutputDirectory(): Promise<string | null>;
  convert(request: UiConvertRequest): Promise<UiConvertResult>;
  onProgress(listener: (event: UiProgressEvent) => void): () => void;
  onComplete(listener: (event: UiCompleteEvent) => void): () => void;
  requestCancel(): Promise<void>;
}
