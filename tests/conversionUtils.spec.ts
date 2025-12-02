import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deriveNameFromUrl,
  normalizeInputs,
  reserveOutputName,
  sanitizeNameHint,
} from '../src/desktop/conversionUtils';
import type { UiInputSource } from '../src/desktop/ipc';

describe('desktop conversion utils', () => {
  it('sanitizes name hints', () => {
    expect(sanitizeNameHint(' My Icon.svg ', 'fallback')).toBe('My-Icon.svg');
    expect(sanitizeNameHint('***', 'fallback')).toBe('fallback');
  });

  it('derives names from URLs', () => {
    const url = new URL('https://example.com/assets/icons/logo.svg?cache=1');
    expect(deriveNameFromUrl(url, 'remote')).toBe('logo');

    const fallbackUrl = new URL('https://example.com/');
    expect(deriveNameFromUrl(fallbackUrl, 'remote')).toBe('remote');
  });

  it('reserves unique output names with numeric suffixes', () => {
    const map = new Map<string, number>();
    expect(reserveOutputName(map, 'icon')).toBe('icon');
    expect(reserveOutputName(map, 'icon')).toBe('icon-2');
    expect(reserveOutputName(map, ' icon ')).toBe('icon-3');
  });

  it('normalizes inputs and deduplicates files', () => {
    const inputs: UiInputSource[] = [
      {
        id: 'a',
        type: 'file',
        path: './assets/logo.svg',
        label: 'Logo',
        nameHint: 'logo',
      },
      {
        id: 'b',
        type: 'file',
        path: path.resolve('assets/logo.svg'),
        label: 'Duplicate Logo',
        nameHint: 'logo',
      },
      {
        id: 'c',
        type: 'inline',
        svg: '<svg></svg>',
        label: 'Inline',
        nameHint: 'Inline Name',
      },
      {
        id: 'd',
        type: 'inline',
        svg: '   ',
        label: 'Empty',
        nameHint: 'empty',
      },
    ];

    const normalized = normalizeInputs(inputs);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].type).toBe('file');
    expect(normalized[0].path).toBe(path.resolve('assets/logo.svg'));
    expect(normalized[1].type).toBe('inline');
    expect(normalized[1].label).toBe('Inline');
  });
});
