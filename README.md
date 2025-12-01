# svg-to-png

SVG → raster toolkit with a typed Node.js API, a feature-complete CLI, and an Electron desktop app. Rendering is delegated to Playwright’s Chromium so that CSS, gradients, fonts, and advanced SVG features are preserved. JPEG/WebP outputs are produced via Sharp.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [CLI](#cli-quick-start)
  - [Desktop App](#desktop-app-quick-start)
  - [Library API](#library-quick-start)
- [CLI Usage](#cli-usage)
- [Desktop App](#desktop-app)
- [Library API](#library-api)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Releases](#releases)

## Features

- **Library**: `renderSvg`, `renderSvgFile`, and `shutdownRenderer` with animation timestamps, CSS injection, base URLs, Sharp-powered JPEG/WebP conversion, and automatic Chromium installation.
- **CLI (`svg2raster`)**: Globs, output directories/files, format/dimension overrides, scale, background, CSS injection, animation timestamp, concurrency limits, per-file progress, and graceful cancellation (Ctrl+C).
- **Desktop App**: Electron UI that mirrors CLI options, shows per-file status, and enables cancelling active batches.
- **Reliability**: If Chromium is missing, the renderer automatically downloads it into `node_modules/playwright-core/.local-browsers`.
- **Tested**: Vitest suite covers utilities, CLI logic, and renderer behavior (with auto-install fallback).

## Requirements

- Node.js **20.x** (ESM and optional chaining are used).
- npm (or pnpm/yarn) for installing dependencies.
- The first conversion will download Playwright’s Chromium (~170 MB). Subsequent runs reuse the local cache.
- Linux/macOS/Windows; Electron desktop app currently targets Linux/macOS (Windows support planned via electron-builder).

## Installation

```bash
git clone https://github.com/jasonterlecki/svg-to-png.git
cd svg-to-png
npm install
```

The CLI and desktop app both run from the workspace. You do **not** need to run `playwright install` manually; the renderer runs it automatically if Chromium is missing. If you prefer to preinstall:

```bash
npx playwright install --with-deps chromium
```

## Quick Start

### CLI Quick Start

```bash
# Convert a single SVG to PNG
node dist/cli.js assets/logo.svg --out dist/logo.png

# Convert a directory to WebP at 2× scale
node dist/cli.js "icons/**/*.svg" --out-dir dist/icons --format webp --scale 2
```

While running, the CLI prints per-file progress (e.g., `[3/12] ✔ icon.svg → dist/icon.png`). Press `Ctrl+C` once to cancel gracefully (remaining jobs are skipped). Press again to force exit.

### Desktop App Quick Start

```bash
npm run desktop
```

Steps:

1. Click **Select SVG files…** (multiple selection supported).
2. Choose an output directory.
3. Adjust options (format, width/height, scale, background, animation time, CSS injection, disable external styles).
4. Click **Convert**. Progress updates in the table. Use **Cancel** to stop current batches.

### Library Quick Start

```ts
import { renderSvgFile } from 'svg-to-png/dist/index.js';
import { writeFile } from 'node:fs/promises';

const result = await renderSvgFile('assets/badge.svg', {
  format: 'jpeg',
  width: 256,
  background: '#fff',
  extraCss: '@font-face { ... }',
  time: 0.5,
});

await writeFile('badge.jpg', result.buffer);
await shutdownRenderer(); // optional, useful in long-lived processes
```

## CLI Usage

Run `node dist/cli.js --help` (after `npm run build`) or use the npm bin entry once published.

```bash
Usage: svg2raster [options] <inputs...>

Convert SVG assets to PNG/JPEG/WebP using a headless Chromium renderer.

Arguments:
  inputs                 Input SVG paths or glob patterns (quote globs)

Options:
  -o, --out <file>       Output file path (single input only)
  --out-dir <dir>        Output directory for batch conversion
  -f, --format <fmt>     png (default), jpeg (saved as .jpg), or webp
  -w, --width <px>       Target width in pixels
  -h, --height <px>      Target height in pixels
  -s, --scale <factor>   Device pixel ratio (e.g., 2 for @2x)
  -b, --background <c>   Background color or "transparent"
  --css <file>           Extra CSS file to inject before rendering
  -t, --time <seconds>   Animation timestamp (seconds)
  --concurrency <n>      Parallel render jobs (default: CPU limited)
  --disable-external-styles   Block external stylesheets
  --silent               Suppress info logs
  --verbose              Extra logging
  --help                 Show help
```

### CLI Notes

- Globs are powered by `fast-glob`; wrap them in quotes to avoid shell expansion.
- JPEG outputs use `.jpg` extensions automatically.
- Progress lines look like `[4/10] ✔ icon.svg → dist/icon.jpg (JPEG 128x128, 115ms)`.
- First Ctrl+C requests cancellation, second Ctrl+C exits immediately with code 130.
- Exit codes: `0` success, `1` failure (at least one file failed), `130` forced cancellation.

## Desktop App

`npm run desktop` builds the TypeScript files and launches Electron. Features:

- **Inputs panel**: select multiple SVGs; the table lists each file with live status.
- **Output**: choose the destination directory.
- **Options**: same as CLI (format, width, height, scale, background, animation time, CSS injection, disable external styles).
- **Controls**: Convert (start batch), Cancel (stop active renders), status message area.

The app is hardened for sandboxed environments (GPU disabled, minimal logging). Chromium is downloaded into `node_modules/playwright-core/.local-browsers` if missing.

### Building for Distribution

Packaging via `electron-builder` is planned (NEXTTASK5). For now, run from source (`npm run desktop`). To distribute, bundle the repo or use `electron-builder` manually.

## Library API

```ts
import type {
  OutputFormat,
  RenderOptions,
  RenderResult,
  SvgSource,
} from 'svg-to-png/dist/index.js';
```

### Types

```ts
type OutputFormat = 'png' | 'jpeg' | 'webp';

interface RenderOptions {
  width?: number;
  height?: number;
  scale?: number;
  background?: string;          // "transparent" or CSS color
  format?: OutputFormat;
  time?: number;                // animation timestamp (seconds)
  extraCss?: string;
  baseUrl?: string;
  allowExternalStyles?: boolean;
  navigationTimeoutMs?: number;
}

interface RenderResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: OutputFormat;
}

interface SvgSource {
  svg: string;
  baseUrl?: string;
}
```

### Functions

- `renderSvg(source: SvgSource, options?: RenderOptions): Promise<RenderResult>`
- `renderSvgFile(path: string, options?: RenderOptions): Promise<RenderResult>`
- `shutdownRenderer(): Promise<void>` – close the shared Playwright browser (useful in tests or short-lived scripts).

## Troubleshooting

- **Chromium missing / “executable doesn’t exist”**  
  The renderer now auto-installs Chromium into `node_modules/playwright-core/.local-browsers`. If installation fails (e.g., no network), rerun `npx playwright install --with-deps chromium` manually.

- **Linux GPU / GLib warnings**  
  The desktop app launches with GPU disabled; some GLib warnings can still appear from Chromium. They’re harmless unless the app crashes. If crashes persist, ensure the host has the necessary `libnss3`, `libgtk-3`, `libx11` packages.

- **Conversions fail on JPEG/WebP**  
  JPEG doesn’t support transparency. Set `--background #fff` (CLI) or fill the background in the desktop app.

- **External CSS doesn’t load**  
  Ensure `baseUrl` (library) or the file’s directory (CLI/desktop) has the referenced styles/images. Use `--disable-external-styles` when you need sandboxed behavior.

- **Slow first run**  
  Downloading Playwright’s browser is the slowest step. Subsequent runs are much faster.

## Development

Scripts:

- `npm run build` – TypeScript compilation (outputs to `dist/`).
- `npm run lint` – ESLint (ESM config).
- `npm run test` – Vitest suite (includes CLI + renderer tests).
- `npm run desktop` – Build + launch Electron app.

When contributing:

1. `npm install`
2. `npm run lint && npm test`
3. `npm run build`
4. Update docs/tests alongside code changes.

Electron/CLI rely on Playwright; CI or fresh machines must allow auto-install or run `npx playwright install --with-deps chromium`.

## Releases

- **v1.0.0** – Initial implementation (Library + CLI scaffold).
- **v1.0.1** – Desktop app, progress/cancel, README expansion.
- **v1.0.2** – Auto-install Chromium, `.jpg` extension for JPEG, cancellation/progress polish.

See `NEXTTASK*.md` for upcoming work: presets, URL/raw input support, CI, packaging, richer UI features.
