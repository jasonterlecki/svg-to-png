import { describe, expect, it } from 'vitest';
import { deriveDimensions } from '../src/utils/svg.js';

describe('deriveDimensions', () => {
  it('uses explicit width and height attributes', () => {
    const svg = '<svg width="100" height="60"></svg>';
    expect(deriveDimensions(svg)).toMatchObject({ width: 100, height: 60 });
  });

  it('falls back to the viewBox ratio when one dimension is missing', () => {
    const svg = '<svg width="200" viewBox="0 0 100 50"></svg>';
    expect(deriveDimensions(svg)).toMatchObject({ width: 200, height: 100 });
  });

  it('uses overrides when provided', () => {
    const svg = '<svg viewBox="0 0 40 20"></svg>';
    expect(deriveDimensions(svg, { width: 80 })).toMatchObject({ width: 80, height: 40 });
    expect(deriveDimensions(svg, { height: 60 })).toMatchObject({ width: 120, height: 60 });
  });

  it('defaults to a sane viewport when values are missing', () => {
    const svg = '<svg></svg>';
    const result = deriveDimensions(svg);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});
