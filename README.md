# svg-to-png

A Playwright-powered toolkit for turning SVG assets into raster formats (PNG, JPEG, WebP) without sacrificing CSS fidelity or advanced SVG features. The project exposes both a Node.js library API and a CLI tailored for batch conversion workflows.

## Features

- Uses a real Chromium browser (via Playwright) so inline styles, `<style>` blocks, fonts, gradients, filters, and `foreignObject` regions render exactly as modern browsers do.
- Supports multiple output formats: PNG natively and JPEG/WebP via Sharp post-processing.
- Accepts inline SVG strings or filesystem paths with automatic base URL resolution for relative assets.
- Provides fine-grained rendering controls (width, height, scale, timestamp for animations, injected CSS, external CSS blocking, etc.).
- Handles multi-frame SVGs by seeking to a timestamp before capturing the screenshot.

Refer to `AGENT.md` for the full product spec and roadmap.

## Prerequisites

- **Node.js** ≥ 20 (ES modules and top-level `await` are in use).
- **npm** (or another package manager) to install dependencies.
- **Playwright browser binaries**. Install Chromium once via:

  ```bash
  npx playwright install --with-deps chromium
  ```

  This downloads the sandboxed Chromium binary Playwright expects. Run it after cloning the repo or whenever Playwright is updated.

- **Sharp native dependencies**. Sharp bundles prebuilt binaries for most platforms, but Linux distributions may require `libvips`/build tools. The Sharp [installation guide](https://sharp.pixelplumbing.com/install) lists the required packages.

## Installation

```bash
git clone https://github.com/jasonterlecki/svg-to-png.git
cd svg-to-png
npm install
npx playwright install --with-deps chromium
```

Build artifacts (generated when you install or run `npm run build`) end up in `dist/`.

## Usage (library)

The public API exposes `renderSvg`, `renderSvgFile`, and `shutdownRenderer`. Example:

```ts
import { renderSvg, renderSvgFile } from 'svg-to-png';

// Render inline markup to PNG
const result = await renderSvg({
  svg: `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#f90" />
              <stop offset="100%" stop-color="#f06" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill="url(#grad)" />
        </svg>`,
}, { format: 'png', scale: 2 });

await renderSvgFile('path/to/logo.svg', {
  format: 'webp',
  width: 256,
  extraCss: 'svg { background: #fff; }',
});
```

`renderSvgFile` infers a `baseUrl` from the file location so relative `<link>`/`<image>` references resolve correctly. When you are done rendering (e.g., in test suites), call `shutdownRenderer()` to close the shared Playwright browser instance.

### Rendering options

| Option | Type | Description |
| --- | --- | --- |
| `width`, `height` | `number` | Overrides for the rendered viewport. When only one dimension is provided the aspect ratio comes from the SVG `viewBox`/attributes. |
| `scale` | `number` | Device pixel ratio (`1` = normal, `2` = “@2x”). |
| `background` | `string` | CSS color or `"transparent"` (default). Non-transparent backgrounds are applied before Sharp re-encodes JPEG/WebP. |
| `format` | `"png" \| "jpeg" \| "webp"` | Output format. PNG is rendered directly; JPEG/WebP are derived from the PNG buffer via Sharp. |
| `time` | `number` | Timestamp (seconds) for animated SVGs. The renderer seeks before capturing the screenshot. |
| `extraCss` | `string` | Raw CSS injected inside a `<style>` block before rendering. |
| `baseUrl` | `string` | Used to resolve relative URLs (defaults to the file directory for `renderSvgFile`). |
| `allowExternalStyles` | `boolean` | Set to `false` to block non-data stylesheet requests for locked-down environments. |
| `navigationTimeoutMs` | `number` | Overrides the navigation/asset loading timeout (default 15 s). |

### Environment variables

| Variable | Meaning |
| --- | --- |
| `SVG2RASTER_CHROMIUM_PATH` | Absolute path to an existing Chromium/Chrome binary. Falls back to Playwright’s bundled browser. |
| `SVG2RASTER_FORCE_MINIMAL_CHROMIUM=1` | Forces the renderer to use the constrained flag set (`--single-process`, `--no-zygote`, etc.) if your environment requires it. By default the renderer tries a standard launch first before falling back automatically. |

## CLI usage

After running `npm run build`, you can execute the CLI via `node dist/cli.js` (the published package exposes `svg2raster` via the `bin` entry). Examples:

```bash
# Single file with an explicit output path
node dist/cli.js assets/logo.svg --out dist/logo.png --scale 2

# Batch conversion using a glob – outputs end up in dist/icons with inferred names
node dist/cli.js "icons/**/*.svg" --out-dir dist/icons --format webp --concurrency 4

# Prevent external stylesheet loads and inject custom CSS
node dist/cli.js badge.svg --out dist/badge.jpeg --disable-external-styles --css styles/fonts.css
```

Available options:

| Option | Description |
| --- | --- |
| `<inputs...>` | One or more SVG file paths or glob patterns. Quote glob patterns so your shell does not expand them. |
| `-o, --out <file>` | Output file path (only when processing a single input). |
| `--out-dir <dir>` | Destination directory for batch conversion. The original filenames are preserved, but the extension changes to match the output format. |
| `-f, --format <png|jpeg|webp>` | Output format (default `png`). |
| `-w, --width <px>` / `-h, --height <px>` | Override the rendered dimensions. If one dimension is omitted, the SVG aspect ratio determines the other. |
| `-s, --scale <factor>` | Device pixel ratio (e.g., `2` for “@2x”). |
| `-b, --background <color>` | Background color or `"transparent"` (default). |
| `--css <file>` | Additional CSS file to inject before rendering (useful for custom fonts). |
| `-t, --time <seconds>` | Timestamp for capturing animated SVGs. |
| `--concurrency <count>` | Parallel render jobs (default is derived from CPU count). |
| `--disable-external-styles` | Blocks external stylesheet requests referenced by the SVG. |
| `--silent` / `--verbose` | Control CLI logging verbosity. |

All CLI options ultimately map to the same rendering options described in the library section, so refer there for further detail. The CLI automatically shuts down the shared Playwright browser once all jobs finish.

## Desktop app

Prefer a visual interface? Launch the Electron desktop experience after building:

```bash
npm run desktop
```

The app lets you pick SVG files (or drag them in), choose an output directory, tweak format/dimension/scale/background/time options, and run conversions while viewing status updates. It shares the same rendering engine under the hood, so Playwright’s Chromium binary must still be installed (`npx playwright install --with-deps chromium`).

### Electron structure

- `src/desktop/main.ts` – Electron main process that wires IPC handlers and executes the renderer.
- `src/desktop/preload.ts` – Exposes a secure API to the renderer window.
- `src/desktop/renderer.ts` + `desktop/index.html` – The UI for selecting files, specifying options, and triggering conversions.

When you run `npm run desktop`, the TypeScript build runs first, then Electron boots the compiled files from `dist/desktop/`.

## Development workflow

| Command | Purpose |
| --- | --- |
| `npm run lint` | ESLint over `src/` and `tests/`. |
| `npm run test` | Vitest test suite (unit + integration). Browser integration tests skip automatically if Chromium cannot launch (e.g., in restricted sandboxes). |
| `npm run build` | TypeScript compilation to `dist/`. |
| `npm run clean` | Remove `dist/`. |

### Running tests locally

1. Make sure Chromium is installed (`npx playwright install --with-deps chromium`).
2. Ensure your environment allows Playwright to launch headless Chromium. If it fails with sandboxed errors, re-run tests with:
   ```bash
   SVG2RASTER_FORCE_MINIMAL_CHROMIUM=1 npm test
   ```
3. For CI or non-GUI servers, you may also need to install additional system dependencies listed in the [Playwright docs](https://playwright.dev/docs/ci).

## Troubleshooting

- **Chromium crashes immediately** – Verify you installed the Playwright browsers. If the default launch still fails, set `SVG2RASTER_FORCE_MINIMAL_CHROMIUM=1`.
- **JPEG/WebP outputs look wrong** – Provide a solid `background` color for JPEG/WebP when the original SVG contains transparency; JPEG cannot represent alpha channels.
- **External CSS doesn’t load** – Make sure `baseUrl` points to a directory or URL that allows relative paths to resolve, and leave `allowExternalStyles` enabled (default).

## License

MIT. See `LICENSE` (coming soon) or the header within `package.json`.
