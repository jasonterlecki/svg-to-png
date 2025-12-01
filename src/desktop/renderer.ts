import type { Svg2RasterApi } from './preload.js';
import type { UiRenderOptions } from './ipc.js';

declare global {
  interface Window {
    svg2raster: Svg2RasterApi;
  }
}

const api = window.svg2raster ?? null;
const selectFilesBtn = document.getElementById('select-files') as HTMLButtonElement | null;
const filesSummary = document.getElementById('selected-files') as HTMLDivElement | null;
const selectOutputBtn = document.getElementById('select-output') as HTMLButtonElement | null;
const outputSummary = document.getElementById('output-directory') as HTMLDivElement | null;
const convertBtn = document.getElementById('convert') as HTMLButtonElement | null;
const statusEl = document.getElementById('status') as HTMLDivElement | null;
const formatSelect = document.getElementById('format') as HTMLSelectElement | null;
const widthInput = document.getElementById('width') as HTMLInputElement | null;
const heightInput = document.getElementById('height') as HTMLInputElement | null;
const scaleInput = document.getElementById('scale') as HTMLInputElement | null;
const backgroundInput = document.getElementById('background') as HTMLInputElement | null;
const timeInput = document.getElementById('time') as HTMLInputElement | null;
const externalStylesCheckbox = document.getElementById('disable-external-styles') as HTMLInputElement | null;
const extraCssInput = document.getElementById('extra-css') as HTMLTextAreaElement | null;

let selectedFiles: string[] = [];
let outputDirectory: string | null = null;

selectFilesBtn?.addEventListener('click', async () => {
  if (!api) {
    showStatus('Renderer bridge unavailable.', 'error');
    return;
  }
  const files = await api.chooseInputFiles();
  if (files.length > 0) {
    selectedFiles = files;
    updateFilesSummary();
  }
});

selectOutputBtn?.addEventListener('click', async () => {
  if (!api) {
    showStatus('Renderer bridge unavailable.', 'error');
    return;
  }
  const directory = await api.chooseOutputDirectory();
  if (directory) {
    outputDirectory = directory;
    updateOutputSummary();
  }
});

convertBtn?.addEventListener('click', async () => {
  if (!selectedFiles.length || !outputDirectory) {
    showStatus('Select input files and an output directory first.', 'error');
    return;
  }

  if (!api) {
    showStatus('Renderer bridge unavailable.', 'error');
    return;
  }

  convertBtn.disabled = true;
  showStatus('Rendering…', 'info');

  const options = buildRenderOptions();
  try {
    const result = await api.convert({
      inputPaths: selectedFiles,
      outputDir: outputDirectory,
      options,
    });

    if (result.failures.length === 0) {
      showStatus(`Converted ${result.successes} file(s).`, 'success');
    } else {
      const failureDetails = result.failures
        .map((failure) => `${failure.path}: ${failure.error}`)
        .join('\n');
      showStatus(
        `Converted ${result.successes} file(s). ${result.failures.length} failed:\n${failureDetails}`,
        'error',
      );
    }
  } catch (error) {
    showStatus(
      `Failed to convert files: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  } finally {
    convertBtn.disabled = false;
  }
});

function updateFilesSummary(): void {
  if (filesSummary) {
    const list = selectedFiles.map((file) => `<li>${file}</li>`).join('');
    filesSummary.innerHTML = `<strong>${selectedFiles.length} file(s) selected</strong><ul>${list}</ul>`;
  }
}

function updateOutputSummary(): void {
  if (outputSummary) {
    outputSummary.textContent = outputDirectory ?? 'No directory selected.';
  }
}

function buildRenderOptions(): UiRenderOptions {
  return {
    format: (formatSelect?.value as UiRenderOptions['format']) ?? 'png',
    width: parseNumber(widthInput?.value),
    height: parseNumber(heightInput?.value),
    scale: parseNumber(scaleInput?.value),
    background: backgroundInput?.value || undefined,
    time: parseNumber(timeInput?.value),
    extraCss: extraCssInput?.value || undefined,
    allowExternalStyles: externalStylesCheckbox?.checked ? false : undefined,
  };
}

function parseNumber(value?: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function showStatus(message: string, variant: 'info' | 'success' | 'error'): void {
  if (!statusEl) {
    return;
  }
  statusEl.textContent = message;
  statusEl.dataset.variant = variant;
}
