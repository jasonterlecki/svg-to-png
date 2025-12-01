# NEXTTASK 2: Presets & Profiles

## Goal
Add named presets that capture conversion settings (format, dimensions, scale, background, CSS, animation time) so users can reuse their favorite configurations quickly from both the CLI and the desktop app.

## Why
- Many workflows reuse the same settings repeatedly (e.g., `webp @2x with white background`). Typing options every time is error-prone.
- Presets bridge CLI and desktop: teams can share preset files and stay consistent across automation and manual conversions.

## Proposed Work
1. **Preset schema**
   - Define a simple JSON/YAML schema (e.g., `{ name: string, options: RenderOptions }`).
   - Allow multiple presets in a single file (default `svg2raster.presets.json`) stored in the project directory or user config folder (`~/.config/svg2raster/`).

2. **CLI support**
   - Add `--preset <name>` to load options from the preset file; allow overriding fields via other flags (CLI options win).
   - Provide `svg2raster preset list` or `--list-presets` to enumerate available names.
   - Optionally add `svg2raster preset create` to interactively save the current flags as a preset.

3. **Desktop UI**
   - Add a dropdown for presets; selecting one populates the form controls.
   - Include “Save current settings as preset” and “Delete preset” buttons, storing data in the same JSON file.
   - Sync with CLI by reusing the same loader/saver module.

4. **Docs**
   - Update README with instructions on creating presets, file locations, and CLI/desktop usage.

## Tests / Acceptance
- CLI can run `svg2raster input.svg --preset social-avatar` and override e.g., `--width 128`.
- Desktop UI loads preset names on launch, applies settings, and persists new custom presets.
- Unit tests for preset parsing/merging, including error handling for missing presets.
