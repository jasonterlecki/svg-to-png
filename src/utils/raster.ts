import sharp from 'sharp';
import type { OutputFormat } from '../types.js';

export interface RasterConversionOptions {
  format: OutputFormat;
  background?: string;
}

export async function convertPngBuffer(
  input: Buffer,
  options: RasterConversionOptions,
): Promise<Buffer> {
  const backgroundColor =
    options.background && options.background !== 'transparent' ? options.background : undefined;

  switch (options.format) {
    case 'png':
      return input;
    case 'jpeg':
      return sharp(input)
        .flatten(
          backgroundColor
            ? {
                background: backgroundColor,
              }
            : undefined,
        )
        .jpeg()
        .toBuffer();
    case 'webp':
      return sharp(input)
        .flatten(
          backgroundColor
            ? {
                background: backgroundColor,
              }
            : undefined,
        )
        .webp({ lossless: true })
        .toBuffer();
    default:
      throw new Error(`Unsupported output format "${options.format}"`);
  }
}
