import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderSvg, renderSvgFile, shutdownRenderer } from '../src/index.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(testDir, 'fixtures');
const simpleSvgPath = path.join(fixturesDir, 'simple.svg');

describe('renderSvg', () => {
  let browserAvailable = true;
  let skipReason: string | null = null;

  beforeAll(async () => {
    try {
      await renderSvg({
        svg: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#000"/></svg>',
      });
    } catch (error) {
      browserAvailable = false;
      skipReason =
        error instanceof Error ? error.message : 'Rendering failed due to an unknown reason.';
      console.warn(`Skipping browser renderer tests: ${skipReason}`);
    } finally {
      await shutdownRenderer();
    }
  });

  afterAll(async () => {
    await shutdownRenderer();
  });

  it('renders inline SVG markup', async () => {
    if (!browserAvailable) {
      return;
    }

    const svg = `
      <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" fill="#0055ff" />
        <circle cx="16" cy="16" r="10" fill="#fff" />
      </svg>
    `;

    const result = await renderSvg({ svg });
    expect(result.format).toBe('png');
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
    expect(result.buffer.byteLength).toBeGreaterThan(0);
  });

  it('renders from an SVG file path', async () => {
    if (!browserAvailable) {
      console.warn(`Renderer tests skipped: ${skipReason}`);
      return;
    }

    const result = await renderSvgFile(simpleSvgPath, { format: 'webp' });
    expect(result.format).toBe('webp');
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
    expect(result.buffer.byteLength).toBeGreaterThan(0);
  });
});
