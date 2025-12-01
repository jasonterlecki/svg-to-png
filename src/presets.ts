import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OutputFormat, RenderOptions } from './types.js';
import { SUPPORTED_FORMATS } from './config.js';

export const DEFAULT_PRESET_FILENAME = 'svg2raster.presets.json';

export interface PresetEntry {
  name: string;
  description?: string;
  options: RenderOptions;
}

export interface PresetCollection {
  path: string;
  presets: PresetEntry[];
}

export function getPresetSearchPaths(customPath?: string): string[] {
  const candidates: string[] = [];
  if (customPath) {
    candidates.push(path.resolve(customPath));
  }
  candidates.push(path.resolve(process.cwd(), DEFAULT_PRESET_FILENAME));
  candidates.push(path.join(getUserConfigDir(), DEFAULT_PRESET_FILENAME));
  return Array.from(new Set(candidates));
}

export async function findPresetFile(customPath?: string): Promise<string | null> {
  const candidates = getPresetSearchPaths(customPath);
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function loadPresetCollection(customPath?: string): Promise<PresetCollection | null> {
  const presetFile = await findPresetFile(customPath);
  if (!presetFile) {
    return null;
  }
  const presets = await readPresetEntries(presetFile);
  return { path: presetFile, presets };
}

export async function loadPresetByName(
  name: string,
  customPath?: string,
): Promise<{ path: string; preset: PresetEntry } | null> {
  const normalizedName = name.trim();
  if (!normalizedName) {
    return null;
  }
  const collection = await loadPresetCollection(customPath);
  if (!collection) {
    return null;
  }
  const preset = collection.presets.find((entry) => entry.name === normalizedName);
  if (!preset) {
    return null;
  }
  return { path: collection.path, preset };
}

export async function ensurePresetFilePath(preferredPath?: string): Promise<string> {
  const explicit = preferredPath ? path.resolve(preferredPath) : null;
  const existing = explicit ?? (await findPresetFile());
  const fallback = existing ?? path.join(getUserConfigDir(), DEFAULT_PRESET_FILENAME);
  const target = fallback;
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (!(await fileExists(target))) {
    await fs.writeFile(target, JSON.stringify({ presets: [] }, null, 2) + '\n', 'utf8');
  }
  return target;
}

export async function savePresetEntry(
  entry: PresetEntry,
  options: { targetPath?: string } = {},
): Promise<PresetCollection> {
  const targetPath = await ensurePresetFilePath(options.targetPath);
  const current = await readPresetEntries(targetPath);
  const sanitized: PresetEntry = {
    name: entry.name.trim(),
    description: entry.description?.trim() || undefined,
    options: normalizeRenderOptions(entry.options),
  };
  const deduped = current.filter((preset) => preset.name !== sanitized.name);
  const updated = [...deduped, sanitized].sort((a, b) => a.name.localeCompare(b.name));
  await writePresetEntries(targetPath, updated);
  return { path: targetPath, presets: updated };
}

export async function deletePresetEntry(
  name: string,
  options: { targetPath?: string } = {},
): Promise<PresetCollection> {
  const targetPath = options.targetPath ?? (await ensurePresetFilePath());
  const current = await readPresetEntries(targetPath);
  const targetName = name.trim();
  const updated = current.filter((preset) => preset.name !== targetName);
  await writePresetEntries(targetPath, updated);
  return { path: targetPath, presets: updated };
}

async function readPresetEntries(filePath: string): Promise<PresetEntry[]> {
  const content = await fs.readFile(filePath, 'utf8');
  if (!content.trim()) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse presets file ${filePath}: ${error instanceof Error ? error.message : error}`);
  }

  const rawEntries = extractRawPresetEntries(parsed);
  const byName = new Map<string, PresetEntry>();
  for (const raw of rawEntries) {
    const entry = normalizePresetEntry(raw);
    if (!entry) {
      continue;
    }
    byName.set(entry.name, entry);
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function extractRawPresetEntries(parsed: unknown): PresetEntry[] | Array<Partial<PresetEntry>> {
  if (Array.isArray(parsed)) {
    return parsed as PresetEntry[];
  }
  if (isPlainObject(parsed) && Array.isArray(parsed.presets)) {
    return parsed.presets as PresetEntry[];
  }
  if (isPlainObject(parsed)) {
    const entries: PresetEntry[] = [];
    for (const [name, value] of Object.entries(parsed)) {
      if (isPlainObject(value)) {
        entries.push({
          name,
          options: normalizeRenderOptions(value),
        });
      }
    }
    return entries;
  }
  return [];
}

function normalizePresetEntry(raw: Partial<PresetEntry>): PresetEntry | null {
  const name = raw.name?.trim();
  if (!name) {
    return null;
  }
  const description = raw.description?.trim() || undefined;
  const options = normalizeRenderOptions(raw.options ?? {});
  return { name, description, options };
}

function normalizeRenderOptions(input: unknown): RenderOptions {
  if (!isPlainObject(input)) {
    return {};
  }
  const normalized: RenderOptions = {};
  if (typeof input.width === 'number' && Number.isFinite(input.width)) {
    normalized.width = input.width;
  }
  if (typeof input.height === 'number' && Number.isFinite(input.height)) {
    normalized.height = input.height;
  }
  if (typeof input.scale === 'number' && Number.isFinite(input.scale)) {
    normalized.scale = input.scale;
  }
  if (typeof input.background === 'string' && input.background.trim()) {
    normalized.background = input.background;
  }
  if (typeof input.format === 'string' && isSupportedFormat(input.format)) {
    normalized.format = input.format as OutputFormat;
  }
  if (typeof input.time === 'number' && input.time >= 0) {
    normalized.time = input.time;
  }
  if (typeof input.extraCss === 'string' && input.extraCss.trim()) {
    normalized.extraCss = input.extraCss;
  }
  if (typeof input.baseUrl === 'string' && input.baseUrl.trim()) {
    normalized.baseUrl = input.baseUrl;
  }
  if (typeof input.allowExternalStyles === 'boolean') {
    normalized.allowExternalStyles = input.allowExternalStyles;
  }
  if (typeof input.navigationTimeoutMs === 'number' && input.navigationTimeoutMs >= 0) {
    normalized.navigationTimeoutMs = input.navigationTimeoutMs;
  }
  return normalized;
}

async function writePresetEntries(filePath: string, entries: PresetEntry[]): Promise<void> {
  const payload = { presets: entries };
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getUserConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'svg2raster');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'svg2raster');
  }
  return path.join(os.homedir(), '.config', 'svg2raster');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSupportedFormat(format: string): format is OutputFormat {
  return SUPPORTED_FORMATS.includes(format as OutputFormat);
}
