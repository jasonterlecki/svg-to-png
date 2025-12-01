import { contextBridge, ipcRenderer } from 'electron';
import type { Svg2RasterApi } from './preloadTypes.js';
import type { UiConvertRequest, UiConvertResult } from './ipc.js';

const api: Svg2RasterApi = {
  chooseInputFiles(): Promise<string[]> {
    return ipcRenderer.invoke('svg2raster:choose-files');
  },
  chooseOutputDirectory(): Promise<string | null> {
    return ipcRenderer.invoke('svg2raster:choose-directory');
  },
  convert(request: UiConvertRequest): Promise<UiConvertResult> {
    return ipcRenderer.invoke('svg2raster:convert', request);
  },
};

contextBridge.exposeInMainWorld('svg2raster', api);
