import type { Svg2RasterApi } from './preloadTypes.js';
import type {
  UiRenderOptions,
  UiProgressEvent,
  UiCompleteEvent,
  UiPreset,
  UiInputSource,
} from './ipc.js';

declare global {
  interface Window {
    svg2raster: Svg2RasterApi;
  }
}

type JobStatus = 'pending' | 'queued' | 'started' | 'succeeded' | 'failed';

interface JobState {
  id: string;
  source: UiInputSource;
  status: JobStatus;
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
const presetSelect = document.getElementById('preset-select') as HTMLSelectElement | null;
const savePresetBtn = document.getElementById('save-preset') as HTMLButtonElement | null;
const deletePresetBtn = document.getElementById('delete-preset') as HTMLButtonElement | null;
const urlInput = document.getElementById('url-input') as HTMLInputElement | null;
const addUrlBtn = document.getElementById('add-url') as HTMLButtonElement | null;
const rawInput = document.getElementById('raw-input') as HTMLTextAreaElement | null;
const addRawBtn = document.getElementById('add-raw') as HTMLButtonElement | null;

let jobs: JobState[] = [];
let outputDirectory: string | null = null;
let isConverting = false;
let presets: UiPreset[] = [];
let activePresetName: string | null = null;
let jobCounter = 0;
let rawCounter = 0;
let urlCounter = 0;

selectFilesBtn?.addEventListener('click', async () => {
  if (!api) {
    showStatus('Renderer bridge unavailable.', 'error');
    return;
  }
  const files = await api.chooseInputFiles();
  if (files.length > 0) {
    replaceFileJobs(files);
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

addUrlBtn?.addEventListener('click', async () => {
  if (!api) {
    showStatus('Renderer bridge unavailable.', 'error');
    return;
  }
  if (!urlInput) {
    showStatus('URL input unavailable.', 'error');
    return;
  }
  const url = urlInput.value?.trim();
  if (!url) {
    showStatus('Enter an SVG URL first.', 'error');
    return;
  }
  addUrlBtn.disabled = true;
  try {
    const result = await api.fetchRemoteSvg(url);
    urlCounter += 1;
    addInlineJob({
      svg: result.svg,
      baseUrl: result.baseUrl,
      label: result.label || url,
      nameHint: result.nameHint || `remote-${urlCounter}`,
    });
    urlInput.value = '';
    showStatus('Downloaded SVG and added to the queue.', 'success');
  } catch (error) {
    showStatus(
      `Failed to download SVG: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  } finally {
    addUrlBtn.disabled = false;
  }
});

addRawBtn?.addEventListener('click', () => {
  if (!rawInput) {
    showStatus('Raw input field unavailable.', 'error');
    return;
  }
  const svg = rawInput.value ?? '';
  if (!svg.trim()) {
    showStatus('Paste SVG markup before adding.', 'error');
    return;
  }
  rawCounter += 1;
  addInlineJob({
    svg,
    label: `Pasted SVG ${rawCounter}`,
    nameHint: `pasted-${rawCounter}`,
  });
  rawInput.value = '';
  showStatus('Added pasted SVG to the queue.', 'success');
});

jobTableBody?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }
  const button =
    target instanceof HTMLButtonElement
      ? target
      : (target.closest('button[data-remove-id]') as HTMLButtonElement | null);
  if (!button) {
    return;
  }
  const id = button.dataset.removeId;
  if (id) {
    removeJob(id);
  }
});

cancelBtn?.addEventListener('click', () => {
  if (!api || !isConverting) {
    return;
  }
  api.requestCancel();
});

convertBtn?.addEventListener('click', async () => {
  if (!jobs.length) {
    showStatus('Add at least one SVG input first.', 'error');
    return;
  }
  if (!outputDirectory) {
    showStatus('Select an output directory first.', 'error');
    return;
  }
  if (!api) {
    showStatus('Renderer bridge unavailable.', 'error');
    return;
  }
  if (isConverting) {
    return;
  }

  jobs = jobs.map((job) => ({ ...job, status: 'queued', message: undefined }));
  renderJobList();

  convertBtn.disabled = true;
  cancelBtn?.removeAttribute('disabled');
  isConverting = true;
  showStatus('Rendering…', 'info');

  const options = buildRenderOptions();
  try {
    await api.convert({
      inputs: jobs.map((job) => job.source),
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

presetSelect?.addEventListener('change', () => {
  const selected = presetSelect.value || null;
  activePresetName = selected;
  const preset = presets.find((entry) => entry.name === selected);
  if (preset) {
    applyPresetOptions(preset.options);
    showStatus(`Preset "${preset.name}" applied.`, 'info');
  } else {
    showStatus('Manual settings active.', 'info');
  }
  updatePresetButtons();
});

savePresetBtn?.addEventListener('click', async () => {
  if (!api) {
    showStatus('Renderer bridge unavailable.', 'error');
    return;
  }
  const nameInput = prompt('Preset name', activePresetName ?? '');
  if (!nameInput) {
    return;
  }
  const name = nameInput.trim();
  if (!name) {
    showStatus('Preset name is required.', 'error');
    return;
  }
  const existing = presets.find((entry) => entry.name === name);
  const descriptionInput = prompt(
    'Preset description (optional)',
    existing?.description ?? '',
  );
  const description = descriptionInput?.trim() || undefined;

  try {
    const result = await api.savePreset({
      name,
      description,
      options: buildRenderOptions(),
    });
    presets = result.presets;
    activePresetName = name;
    updatePresetSelect();
    showStatus(`Preset "${name}" saved.`, 'success');
  } catch (error) {
    showStatus(
      `Failed to save preset: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  }
});

deletePresetBtn?.addEventListener('click', async () => {
  if (!api || !activePresetName) {
    return;
  }
  const confirmed = confirm(`Delete preset "${activePresetName}"?`);
  if (!confirmed) {
    return;
  }
  try {
    const result = await api.deletePreset(activePresetName);
    presets = result.presets;
    activePresetName = null;
    updatePresetSelect();
    showStatus('Preset deleted.', 'success');
  } catch (error) {
    showStatus(
      `Failed to delete preset: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  }
});

void refreshPresets();

function nextJobId(): string {
  jobCounter += 1;
  return `job-${jobCounter}`;
}

function replaceFileJobs(files: string[]): void {
  const unique = Array.from(new Set(files));
  jobs = jobs.filter((job) => job.source.type !== 'file');
  for (const file of unique) {
    jobs.push(createFileJob(file));
  }
  renderJobList();
}

function createFileJob(path: string): JobState {
  const id = nextJobId();
  const source: UiInputSource = {
    id,
    type: 'file',
    path,
    label: path,
    nameHint: deriveNameFromPath(path),
  };
  return { id, source, status: 'pending' };
}

function addInlineJob(entry: {
  svg: string;
  label: string;
  nameHint: string;
  baseUrl?: string;
}): void {
  const id = nextJobId();
  const source: UiInputSource = {
    id,
    type: 'inline',
    svg: entry.svg,
    baseUrl: entry.baseUrl,
    label: entry.label,
    nameHint: sanitizeName(entry.nameHint, `inline-${id}`),
  };
  jobs.push({ id, source, status: 'pending' });
  renderJobList();
}

function removeJob(id: string): void {
  const nextJobs = jobs.filter((job) => job.id !== id);
  if (nextJobs.length !== jobs.length) {
    jobs = nextJobs;
    renderJobList();
  }
}

function renderJobList(): void {
  if (!jobTableBody) {
    return;
  }
  if (jobs.length === 0) {
    jobTableBody.innerHTML =
      '<tr><td colspan="3" class="placeholder">No inputs queued.</td></tr>';
    return;
  }
  jobTableBody.innerHTML = jobs
    .map(
      (job) =>
        `<tr><td>${job.source.label}</td><td>${formatStatus(job.status, job.message)}</td><td><button data-remove-id="${job.id}" type="button">Remove</button></td></tr>`,
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

async function refreshPresets(): Promise<void> {
  if (!api) {
    return;
  }
  try {
    const result = await api.listPresets();
    presets = result.presets;
    if (!presets.some((preset) => preset.name === activePresetName)) {
      activePresetName = null;
    }
    updatePresetSelect();
  } catch (error) {
    console.error('Failed to load presets', error);
  }
}

function updatePresetSelect(): void {
  if (!presetSelect) {
    return;
  }
  const options = [
    '<option value="">Manual settings</option>',
    ...presets.map((preset) => `<option value="${preset.name}">${preset.name}</option>`),
  ];
  presetSelect.innerHTML = options.join('');
  if (activePresetName) {
    presetSelect.value = activePresetName;
  } else {
    presetSelect.value = '';
  }
  updatePresetButtons();
}

function updatePresetButtons(): void {
  if (deletePresetBtn) {
    if (activePresetName) {
      deletePresetBtn.removeAttribute('disabled');
    } else {
      deletePresetBtn.setAttribute('disabled', 'true');
    }
  }
}

function applyPresetOptions(options: Partial<UiRenderOptions>): void {
  if (formatSelect && options.format) {
    formatSelect.value = options.format;
  }
  if (widthInput) {
    widthInput.value = options.width !== undefined ? `${options.width}` : '';
  }
  if (heightInput) {
    heightInput.value = options.height !== undefined ? `${options.height}` : '';
  }
  if (scaleInput) {
    scaleInput.value = options.scale !== undefined ? `${options.scale}` : '';
  }
  if (backgroundInput) {
    backgroundInput.value = options.background ?? '';
  }
  if (timeInput) {
    timeInput.value = options.time !== undefined ? `${options.time}` : '';
  }
  if (extraCssInput) {
    extraCssInput.value = options.extraCss ?? '';
  }
  if (externalStylesCheckbox) {
    externalStylesCheckbox.checked = options.allowExternalStyles === false;
  }
}

function formatStatus(status: JobStatus, message?: string): string {
  const labelMap: Record<JobStatus, string> = {
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
  const target = jobs.find((job) => job.id === event.id);
  if (!target) {
    return;
  }
  target.status = event.status;
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
    ? `Conversion cancelled after ${processed} input(s).`
    : `Converted ${event.successes} input(s) with ${event.failures} failure(s).`;
  const variant: 'success' | 'error' = event.cancelled || event.failures ? 'error' : 'success';
  showStatus(baseMessage, variant);
}

function deriveNameFromPath(filePath: string): string {
  const segments = filePath.split(/[\\/]/);
  const last = segments.pop() ?? 'file';
  const dot = last.lastIndexOf('.');
  const stem = dot > 0 ? last.slice(0, dot) : last;
  return sanitizeName(stem || 'file', 'file');
}

function sanitizeName(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}
