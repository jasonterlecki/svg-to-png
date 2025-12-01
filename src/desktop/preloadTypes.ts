import type { UiConvertRequest, UiConvertResult } from './ipc.js';

export interface Svg2RasterApi {
  chooseInputFiles(): Promise<string[]>;
  chooseOutputDirectory(): Promise<string | null>;
  convert(request: UiConvertRequest): Promise<UiConvertResult>;
}
