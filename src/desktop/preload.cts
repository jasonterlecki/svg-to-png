import { contextBridge, ipcRenderer } from 'electron';
import type { Svg2RasterApi } from './preloadTypes.js';
import type {
  UiConvertRequest,
  UiConvertResult,
  UiProgressEvent,
  UiCompleteEvent,
} from './ipc.js';

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
  onProgress(listener: (event: UiProgressEvent) => void): () => void {
    const handler = (_event: unknown, payload: UiProgressEvent) => listener(payload);
    ipcRenderer.on('svg2raster:progress', handler);
    return () => ipcRenderer.off('svg2raster:progress', handler);
  },
  onComplete(listener: (event: UiCompleteEvent) => void): () => void {
    const handler = (_event: unknown, payload: UiCompleteEvent) => listener(payload);
    ipcRenderer.on('svg2raster:complete', handler);
    return () => ipcRenderer.off('svg2raster:complete', handler);
  },
  requestCancel(): Promise<void> {
    return ipcRenderer.invoke('svg2raster:cancel');
  },
  listPresets() {
    return ipcRenderer.invoke('svg2raster:presets:list');
  },
  savePreset(payload) {
    return ipcRenderer.invoke('svg2raster:presets:save', payload);
  },
  deletePreset(name) {
    return ipcRenderer.invoke('svg2raster:presets:delete', name);
  },
  fetchRemoteSvg(url) {
    return ipcRenderer.invoke('svg2raster:inputs:fetch-url', url);
  },
};

contextBridge.exposeInMainWorld('svg2raster', api);
