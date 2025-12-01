# svg-to-png

A Playwright-powered toolkit for turning SVG assets into raster formats (PNG, JPEG, WebP) without sacrificing CSS fidelity or advanced SVG features. The project exposes both a Node.js library API and (soon) a CLI tailored for batch conversion workflows.

> ℹ️ The CLI is still under construction. The library APIs described below are fully usable today, and the CLI will be wired up next.

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

## CLI (work in progress)

The CLI (`svg2raster`) will mirror the library options (formats, dimensions, concurrency, CSS injection, etc.). Its implementation is in progress; once complete the README will cover full invocation examples and option descriptions. For now, rely on the library API above.

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
