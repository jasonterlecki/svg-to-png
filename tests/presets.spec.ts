import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET_FILENAME,
  deletePresetEntry,
  loadPresetByName,
  loadPresetCollection,
  savePresetEntry,
} from '../src/presets';

describe('presets utilities', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'svg2raster-presets-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('saves and loads presets from disk', async () => {
    const presetPath = path.join(tmpDir, DEFAULT_PRESET_FILENAME);
    await savePresetEntry(
      {
        name: 'thumbnail',
        description: 'Square thumbnail',
        options: { format: 'jpeg', width: 128, background: '#fff' },
      },
      { targetPath: presetPath },
    );

    const collection = await loadPresetCollection(presetPath);
    expect(collection).not.toBeNull();
    expect(collection?.presets).toHaveLength(1);
    expect(collection?.presets[0].name).toBe('thumbnail');
    expect(collection?.presets[0].options.format).toBe('jpeg');
  });

  it('loads specific presets by name', async () => {
    const presetPath = path.join(tmpDir, DEFAULT_PRESET_FILENAME);
    await fs.writeFile(
      presetPath,
      JSON.stringify(
        {
          presets: [
            { name: 'png-default', options: { format: 'png', width: 256 } },
            { name: 'hero', options: { format: 'webp', width: 1024 } },
          ],
        },
        null,
        2,
      ),
    );

    const hero = await loadPresetByName('hero', presetPath);
    expect(hero?.preset.options.format).toBe('webp');
    expect(hero?.preset.options.width).toBe(1024);
  });

  it('deletes presets by name', async () => {
    const presetPath = path.join(tmpDir, DEFAULT_PRESET_FILENAME);
    await savePresetEntry(
      { name: 'logo', options: { format: 'png', width: 64 } },
      { targetPath: presetPath },
    );
    await savePresetEntry(
      { name: 'banner', options: { format: 'png', width: 600 } },
      { targetPath: presetPath },
    );

    await deletePresetEntry('logo', { targetPath: presetPath });
    const remaining = await loadPresetCollection(presetPath);
    expect(remaining?.presets.map((p) => p.name)).toEqual(['banner']);
  });
});
