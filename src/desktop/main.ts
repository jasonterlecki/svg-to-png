import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogReturnValue } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  UiConvertRequest,
  UiConvertResult,
  UiProgressEvent,
  UiCompleteEvent,
  UiPresetListResult,
  UiPresetSavePayload,
  UiFetchedUrlResult,
} from './ipc.js';
import { renderSvg, renderSvgFile, shutdownRenderer } from '../index.js';
import type { PresetEntry } from '../presets.js';
import {
  deletePresetEntry,
  ensurePresetFilePath,
  loadPresetCollection,
  savePresetEntry,
} from '../presets.js';
import { fetchRemoteSvg } from '../utils/network.js';
import {
  deriveNameFromUrl,
  normalizeInputs,
  reserveOutputName,
  sanitizeNameHint,
} from './conversionUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('log-level', '3');
app.disableHardwareAcceleration();
let mainWindow: BrowserWindow | null = null;
interface ConversionContext {
  cancelled: boolean;
  window: BrowserWindow | null;
}
let activeConversion: ConversionContext | null = null;
let presetFilePath: string | null = null;

function createWindow(): void {
  const preloadPath = path.join(__dirname, 'preload.cjs');
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'SVG to Raster',
  });

  const htmlPath = path.resolve(__dirname, '..', '..', 'desktop', 'index.html');
  mainWindow.loadFile(htmlPath).catch((error) => {
    console.error('Failed to load renderer HTML:', error);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function getActiveWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
}

ipcMain.handle('svg2raster:choose-files', async () => {
  const active = getActiveWindow();
  const dialogPromise = active
    ? dialog.showOpenDialog(active, {
        title: 'Select SVG files',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'SVG', extensions: ['svg'] }],
      })
    : dialog.showOpenDialog({
        title: 'Select SVG files',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'SVG', extensions: ['svg'] }],
      });

  const result = (await dialogPromise) as unknown as OpenDialogReturnValue;

  if (result.canceled) {
    return [];
  }

  return result.filePaths;
});

ipcMain.handle('svg2raster:choose-directory', async () => {
  const active = getActiveWindow();
  const dialogPromise = active
    ? dialog.showOpenDialog(active, {
        title: 'Select output directory',
        properties: ['openDirectory', 'createDirectory'],
      })
    : dialog.showOpenDialog({
        title: 'Select output directory',
        properties: ['openDirectory', 'createDirectory'],
      });

  const result = (await dialogPromise) as unknown as OpenDialogReturnValue;

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('svg2raster:convert', async (event, payload: UiConvertRequest) => {
  if (activeConversion && !activeConversion.cancelled) {
    throw new Error('Another conversion is already running.');
  }

  const normalized = normalizeRequest(payload);
  const senderWindow = BrowserWindow.fromWebContents(event.sender) ?? getActiveWindow();
  activeConversion = { cancelled: false, window: senderWindow ?? null };
  try {
    const result = await convertFiles(normalized, activeConversion);
    return result;
  } finally {
    activeConversion = null;
  }
});

ipcMain.handle('svg2raster:cancel', async () => {
  if (activeConversion) {
    activeConversion.cancelled = true;
  }
});

ipcMain.handle('svg2raster:presets:list', async (): Promise<UiPresetListResult> => {
  const collection = await loadPresetCollection();
  if (collection) {
    presetFilePath = collection.path;
    return {
      path: collection.path,
      presets: toUiPresets(collection.presets),
    };
  }
  presetFilePath = null;
  return {
    path: null,
    presets: [],
  };
});

ipcMain.handle('svg2raster:presets:save', async (_event, payload: UiPresetSavePayload) => {
  const targetPath = await ensurePresetFilePath(presetFilePath ?? undefined);
  const updated = await savePresetEntry(
    {
      name: payload.name,
      description: payload.description,
      options: payload.options,
    },
    { targetPath },
  );
  presetFilePath = updated.path;
  return {
    path: updated.path,
    presets: toUiPresets(updated.presets),
  };
});

ipcMain.handle('svg2raster:presets:delete', async (_event, name: string) => {
  if (!presetFilePath) {
    return {
      path: null,
      presets: [],
    };
  }
  const updated = await deletePresetEntry(name, { targetPath: presetFilePath });
  presetFilePath = updated.path;
  return {
    path: updated.path,
    presets: toUiPresets(updated.presets),
  };
});

ipcMain.handle('svg2raster:inputs:fetch-url', async (_event, url: string): Promise<UiFetchedUrlResult> => {
  const trimmed = url?.trim();
  if (!trimmed) {
    throw new Error('URL is required.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid URL: ${trimmed}`);
  }
  const remote = await fetchRemoteSvg(parsed.toString());
  const fallbackName = deriveNameFromUrl(parsed, 'remote');
  return {
    svg: remote.svg,
    baseUrl: remote.baseUrl,
    label: parsed.toString(),
    nameHint: sanitizeNameHint(fallbackName, 'remote'),
  };
});

function normalizeRequest(request: UiConvertRequest): UiConvertRequest {
  return {
    inputs: normalizeInputs(request.inputs ?? []),
    outputDir: path.resolve(request.outputDir),
    options: request.options,
  };
}

async function convertFiles(
  request: UiConvertRequest,
  conversion: ConversionContext,
): Promise<UiConvertResult> {
  if (!request.inputs.length) {
    throw new Error('Select at least one SVG input.');
  }
  if (!request.outputDir) {
    throw new Error('Select an output directory.');
  }

  await fs.mkdir(request.outputDir, { recursive: true });

  const failures: Array<{ id: string; label: string; error: string }> = [];
  let successes = 0;
  const nameCounts = new Map<string, number>();

  for (const input of request.inputs) {
    if (conversion.cancelled) {
      break;
    }
    sendProgress(conversion.window, {
      id: input.id,
      label: input.label,
      status: 'started',
    });

    try {
      const renderResult =
        input.type === 'file'
          ? await renderSvgFile(input.path, request.options)
          : await renderSvg({ svg: input.svg, baseUrl: input.baseUrl }, request.options);

      const ext = renderResult.format === 'jpeg' ? 'jpg' : renderResult.format;
      const stem = reserveOutputName(nameCounts, input.nameHint);
      const outputFile = path.join(request.outputDir, `${stem}.${ext}`);
      await fs.writeFile(outputFile, renderResult.buffer);
      successes += 1;
      sendProgress(conversion.window, {
        id: input.id,
        label: input.label,
        status: 'succeeded',
        message: `${renderResult.format.toUpperCase()} ${renderResult.width}x${renderResult.height}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        id: input.id,
        label: input.label,
        error: message,
      });
      sendProgress(conversion.window, {
        id: input.id,
        label: input.label,
        status: 'failed',
        message,
      });
    }
  }

  await shutdownRenderer().catch(() => undefined);

  const result: UiConvertResult = {
    successes,
    failures,
  };

  sendCompletion(conversion.window, {
    successes,
    failures: failures.length,
    cancelled: conversion.cancelled,
  });

  if (conversion.cancelled) {
    throw new Error('Conversion cancelled.');
  }

  return result;
}

function sendProgress(window: BrowserWindow | null, payload: UiProgressEvent): void {
  window?.webContents.send('svg2raster:progress', payload);
}

function sendCompletion(window: BrowserWindow | null, payload: UiCompleteEvent): void {
  window?.webContents.send('svg2raster:complete', payload);
}

function toUiPresets(entries: PresetEntry[]) {
  return entries.map((entry) => ({
    name: entry.name,
    description: entry.description,
    options: entry.options,
  }));
}
