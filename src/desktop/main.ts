import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogReturnValue } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UiConvertRequest, UiConvertResult } from './ipc.js';
import { renderSvgFile, shutdownRenderer } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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

ipcMain.handle('svg2raster:convert', async (_event, payload: UiConvertRequest) => {
  const normalized = normalizeRequest(payload);
  const result = await convertFiles(normalized);
  return result;
});

function normalizeRequest(request: UiConvertRequest): UiConvertRequest {
  const uniqueInputs = Array.from(new Set((request.inputPaths ?? []).map((input) => path.resolve(input))));
  return {
    inputPaths: uniqueInputs,
    outputDir: path.resolve(request.outputDir),
    options: request.options,
  };
}

async function convertFiles(request: UiConvertRequest): Promise<UiConvertResult> {
  if (!request.inputPaths.length) {
    throw new Error('Select at least one SVG input.');
  }
  if (!request.outputDir) {
    throw new Error('Select an output directory.');
  }

  await fs.mkdir(request.outputDir, { recursive: true });

  const failures: Array<{ path: string; error: string }> = [];
  let successes = 0;

  for (const inputPath of request.inputPaths) {
    try {
      const renderResult = await renderSvgFile(inputPath, request.options);
      const parsed = path.parse(inputPath);
      const outputFile = path.join(request.outputDir, `${parsed.name}.${renderResult.format}`);
      await fs.writeFile(outputFile, renderResult.buffer);
      successes += 1;
    } catch (error) {
      failures.push({
        path: inputPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await shutdownRenderer().catch(() => undefined);

  return {
    successes,
    failures,
  };
}
