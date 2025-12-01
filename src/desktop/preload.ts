import { contextBridge, ipcRenderer } from 'electron';
import type { UiConvertRequest, UiConvertResult } from './ipc.js';

const api = {
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

export type Svg2RasterApi = typeof api;
