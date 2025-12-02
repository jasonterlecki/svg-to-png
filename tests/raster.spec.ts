import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { convertPngBuffer } from '../src/utils/raster';

async function createSamplePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe('convertPngBuffer', () => {
  it('converts to AVIF', async () => {
    const png = await createSamplePng();
    const avif = await convertPngBuffer(png, { format: 'avif' });
    const metadata = await sharp(avif).metadata();
    expect(['avif', 'heif']).toContain(metadata.format);
  });
});
