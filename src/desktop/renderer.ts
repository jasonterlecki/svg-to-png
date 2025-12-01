import type { Svg2RasterApi } from './preloadTypes.js';
import type { UiRenderOptions, UiProgressEvent, UiCompleteEvent } from './ipc.js';

declare global {
  interface Window {
    svg2raster: Svg2RasterApi;
  }
}

interface JobState {
  path: string;
  status: 'pending' | 'queued' | 'started' | 'succeeded' | 'failed';
  message?: string;
}

const api = window.svg2raster ?? null;
const selectFilesBtn = document.getElementById('select-files') as HTMLButtonElement | null;
const jobTableBody = document.getElementById('job-table-body') as HTMLTableSectionElement | null;
const selectOutputBtn = document.getElementById('select-output') as HTMLButtonElement | null;
const outputSummary = document.getElementById('output-directory') as HTMLDivElement | null;
const convertBtn = document.getElementById('convert') as HTMLButtonElement | null;
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement | null;
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
let jobStates: JobState[] = [];
let isConverting = false;

selectFilesBtn?.addEventListener('click', async () => {
  if (!api) {
    showStatus('Renderer bridge unavailable.', 'error');
    return;
  }
  const files = await api.chooseInputFiles();
  if (files.length > 0) {
    setSelectedFiles(files);
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

cancelBtn?.addEventListener('click', () => {
  if (!api || !isConverting) {
    return;
  }
  api.requestCancel();
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

  if (isConverting) {
    return;
  }

  jobStates = jobStates.map((job) => ({ ...job, status: 'queued', message: undefined }));
  renderJobList();

  convertBtn.disabled = true;
  cancelBtn?.removeAttribute('disabled');
  isConverting = true;
  showStatus('Rendering…', 'info');

  const options = buildRenderOptions();
  try {
    await api.convert({
      inputPaths: selectedFiles,
      outputDir: outputDirectory,
      options,
    });
  } catch (error) {
    showStatus(
      `Failed to convert files: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  } finally {
    isConverting = false;
    convertBtn.disabled = false;
    cancelBtn?.setAttribute('disabled', 'true');
  }
});

if (api) {
  api.onProgress(handleProgressEvent);
  api.onComplete(handleCompleteEvent);
}

function setSelectedFiles(files: string[]): void {
  const unique = Array.from(new Set(files));
  selectedFiles = unique;
  jobStates = unique.map((file) => ({
    path: file,
    status: 'pending',
  }));
  renderJobList();
}

function renderJobList(): void {
  if (!jobTableBody) {
    return;
  }
  if (jobStates.length === 0) {
    jobTableBody.innerHTML =
      '<tr><td colspan="2" class="placeholder">No files selected.</td></tr>';
    return;
  }

  jobTableBody.innerHTML = jobStates
    .map(
      (job) =>
        `<tr><td>${job.path}</td><td>${formatStatus(job.status, job.message)}</td></tr>`,
    )
    .join('');
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

function formatStatus(status: JobState['status'], message?: string): string {
  const labelMap: Record<JobState['status'], string> = {
    pending: 'Pending',
    queued: 'Queued',
    started: 'Rendering…',
    succeeded: 'Done',
    failed: 'Failed',
  };
  const base = labelMap[status] ?? status;
  return message ? `${base} (${message})` : base;
}

function handleProgressEvent(event: UiProgressEvent): void {
  const target = jobStates.find((job) => job.path === event.path);
  if (!target) {
    return;
  }
  if (event.status === 'started') {
    target.status = 'started';
  } else if (event.status === 'succeeded') {
    target.status = 'succeeded';
  } else if (event.status === 'failed') {
    target.status = 'failed';
  }
  target.message = event.message;
  renderJobList();
}

function handleCompleteEvent(event: UiCompleteEvent): void {
  if (convertBtn) {
    convertBtn.disabled = false;
  }
  cancelBtn?.setAttribute('disabled', 'true');
  const processed = event.successes + event.failures;
  const baseMessage = event.cancelled
    ? `Conversion cancelled after ${processed} file(s).`
    : `Converted ${event.successes} file(s) with ${event.failures} failure(s).`;
  const variant: 'success' | 'error' = event.cancelled || event.failures ? 'error' : 'success';
  showStatus(baseMessage, variant);
}
