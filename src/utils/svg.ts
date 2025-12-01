import { DEFAULT_VIEWPORT_SIZE } from '../config.js';

const UNIT_TO_PX: Record<string, number> = {
  px: 1,
  in: 96,
  cm: 37.7952755906,
  mm: 3.77952755906,
  pt: 1.33333333333,
  pc: 16,
};

export interface SvgDimensionOverrides {
  width?: number;
  height?: number;
}

export interface ViewBoxDefinition {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface DerivedDimensions {
  width: number;
  height: number;
  viewBox?: ViewBoxDefinition;
}

export function parseSvgAttributes(svg: string): Record<string, string> {
  const match = svg.match(/<svg\b([^>]*)>/i);
  if (!match) {
    throw new Error('SVG markup must include a root <svg> element.');
  }

  const attributes: Record<string, string> = {};
  const attrString = match[1];
  const attrRegex = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi;

  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(attrString))) {
    const key = attrMatch[1].toLowerCase();
    const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
    attributes[key] = value;
  }

  return attributes;
}

export function parseViewBox(value?: string): ViewBoxDefinition | undefined {
  if (!value) {
    return undefined;
  }

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return undefined;
  }

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

export function convertLengthToPx(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  if (!match) {
    return undefined;
  }

  const numericPortion = Number(match[1]);
  if (Number.isNaN(numericPortion)) {
    return undefined;
  }

  const unit = (match[2] || 'px').toLowerCase();
  if (unit === '%') {
    return undefined;
  }

  const factor = UNIT_TO_PX[unit] ?? UNIT_TO_PX.px;
  return numericPortion * factor;
}

export function deriveDimensions(svg: string, overrides: SvgDimensionOverrides = {}): DerivedDimensions {
  const attributes = parseSvgAttributes(svg);
  const widthAttr = convertLengthToPx(attributes.width);
  const heightAttr = convertLengthToPx(attributes.height);
  const viewBox = parseViewBox(attributes.viewbox);
  const viewBoxRatio = viewBox && viewBox.height !== 0 ? viewBox.width / viewBox.height : undefined;
  const attributeRatio =
    widthAttr && heightAttr && heightAttr !== 0 ? widthAttr / heightAttr : undefined;
  const ratio = viewBoxRatio ?? attributeRatio;

  let width = overrides.width ?? widthAttr;
  let height = overrides.height ?? heightAttr;

  if (width && !height && ratio) {
    height = width / ratio;
  } else if (!width && height && ratio) {
    width = height * ratio;
  }

  if (!width && viewBox?.width) {
    width = viewBox.width;
  }

  if (!height && viewBox?.height) {
    height = viewBox.height;
  }

  const resolvedWidth = width ?? height ?? DEFAULT_VIEWPORT_SIZE;
  const resolvedHeight = height ?? width ?? DEFAULT_VIEWPORT_SIZE;

  return {
    width: Math.max(1, Math.round(resolvedWidth)),
    height: Math.max(1, Math.round(resolvedHeight)),
    viewBox,
  };
}
