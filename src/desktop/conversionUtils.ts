import path from 'node:path';
import type { UiInputSource } from './ipc.js';

export function sanitizeNameHint(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function deriveNameFromUrl(url: URL, fallback: string): string {
  const pathname = url.pathname.replace(/\/+$/, '');
  const lastSegment = pathname.split('/').filter(Boolean).pop();
  if (!lastSegment) {
    return fallback;
  }
  const withoutQuery = lastSegment.split('?')[0].split('#')[0];
  const dotIndex = withoutQuery.lastIndexOf('.');
  if (dotIndex > 0) {
    const stem = withoutQuery.slice(0, dotIndex);
    return stem || fallback;
  }
  return withoutQuery || fallback;
}

export function reserveOutputName(map: Map<string, number>, hint: string): string {
  const sanitized = sanitizeNameHint(hint, 'output');
  const currentCount = map.get(sanitized) ?? 0;
  map.set(sanitized, currentCount + 1);
  if (currentCount === 0) {
    return sanitized;
  }
  return `${sanitized}-${currentCount + 1}`;
}

export function normalizeInputs(inputs: UiInputSource[]): UiInputSource[] {
  const normalized: UiInputSource[] = [];
  const seenFilePaths = new Set<string>();
  for (const input of inputs ?? []) {
    if (input.type === 'file') {
      const absolute = path.resolve(input.path);
      if (seenFilePaths.has(absolute)) {
        continue;
      }
      seenFilePaths.add(absolute);
      normalized.push({
        ...input,
        path: absolute,
        label: input.label ?? absolute,
        nameHint: sanitizeNameHint(input.nameHint, path.parse(absolute).name || 'file'),
      });
    } else if (input.type === 'inline') {
      if (!input.svg.trim()) {
        continue;
      }
      normalized.push({
        ...input,
        label: input.label ?? 'Inline SVG',
        nameHint: sanitizeNameHint(input.nameHint, 'inline'),
      });
    }
  }
  return normalized;
}
