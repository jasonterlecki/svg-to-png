````markdown
# AGENT: SVG → Raster Conversion Service (Node.js)

## Mission

Build a small, well-tested Node.js tool and library that converts SVG assets into PNG, and optionally other raster formats (JPEG, WebP, etc.), while correctly handling CSS styling and advanced SVG features.  The priority is correctness and fidelity of rendering, not raw speed.

The output should be easy to use both from the command line and as a programmatic library.  The codebase should be straightforward for another engineer, or an automated agent, to extend later.

---

## High-Level Requirements

1. **Core functionality**
   - Convert one or more SVG inputs to PNG.  
   - Support additional output formats: at least JPEG and WebP.  
   - Allow input as:
     - File paths.  
     - Raw SVG strings.  
     - URLs (optional but preferred).  

2. **Rendering engine**
   - Use a **headless browser** (e.g., Playwright or Puppeteer) to render SVGs, so that:
     - External and embedded CSS are applied correctly.  
     - Advanced SVG features (filters, masks, gradients, text on path, foreignObject, etc.) are handled as accurately as modern browsers allow.  
   - Do **not** attempt to re-implement an SVG renderer.  Delegate rendering to the headless browser, then capture a raster screenshot.

3. **CSS support**
   - The conversion must render:
     - Inline styles (`style` attributes).  
     - Internal styles (`<style>` blocks).  
     - External stylesheets referenced via `<link>` or `@import` (if a URL is provided or a base path is known).  
   - Provide a mechanism to:
     - Inject additional CSS before rendering (e.g., CLI `--css` file, or library option).  
     - Optionally disable external stylesheet loading for sandboxed or offline use.

4. **Advanced SVG features**
   - The renderer should handle, as best as a modern browser can:
     - Filters (`<filter>`), blur, drop shadows, color matrix, etc.  
     - Gradients and patterns (`<linearGradient>`, `<radialGradient>`, `<pattern>`).  
     - Clipping and masking (`<clipPath>`, `<mask>`).  
     - Text features: text on path, ligatures, kerning, and font fallback.  
     - `foreignObject` content (e.g., HTML in SVG) when allowed by the browser.  
     - Animations: export a static frame (e.g., at time `t = 0` by default, with an option to render at a specified timestamp).  

5. **Output control**
   - Allow specifying:
     - Output format (`png` by default, `jpeg`, `webp`).  
     - Size: explicit width and height, or scale factor.  
     - Background behavior: transparent, specific color, or “auto” from SVG.  
     - Output file path or directory.  
   - For batch conversion, allow an input glob and an output directory, with a consistent naming convention.

---

## Tech Stack And Tooling

- **Runtime:** Node.js ≥ 20 LTS.  
- **Language:** TypeScript preferred.  If you choose JavaScript, keep typings via JSDoc.  
- **Rendering:** Playwright (preferred) or Puppeteer.  Prefer the library with the most straightforward API for:
  - Opening an SVG in a browser context.  
  - Setting viewport size and device scale factor.  
  - Exporting a PNG, JPEG, or WebP screenshot.  

- **Build / Dev**
  - Package manager: `npm` or `pnpm`.  
  - Linting: ESLint with a standard Node + TypeScript (or JS) config.  
  - Formatting: Prettier.  
  - Testing: Jest or Vitest.  

---

## Project Structure

Target a clean, minimal structure, for example:

```text
.
├── AGENTD.md
├── package.json
├── tsconfig.json                # or jsconfig.json for JS
├── src
│   ├── index.ts                 # public library entry point
│   ├── cli.ts                   # CLI implementation
│   ├── renderer
│   │   ├── browserRenderer.ts   # headless browser orchestration
│   │   └── svgPageTemplate.ts   # helper for wrapping raw SVG in HTML if needed
│   ├── config.ts                # shared config types and defaults
│   └── utils
│       └── fileIO.ts            # reading / writing, path helpers
└── tests
    ├── cli.spec.ts
    ├── renderer.spec.ts
    └── fixtures
        ├── simple.svg
        ├── css-styled.svg
        ├── advanced-filters.svg
        └── external-css.svg
````

You can adjust details, but keep responsibilities separated (CLI vs. library vs. rendering engine vs. IO utilities).

---

## CLI Specification

Implement a CLI exposed via `bin` in `package.json` (e.g., command name `svg2raster`).

### Basic usage

```bash
# Single file, default PNG
svg2raster input.svg

# Single file, explicit output
svg2raster input.svg --out output.png

# Multiple files
svg2raster "icons/*.svg" --out-dir dist/icons
```

### CLI options (minimum)

* `--out` / `-o`
  Path to a single output file.

* `--out-dir`
  Output directory for multiple input files.  Preserve file names, but change extension based on format.

* `--format` / `-f`
  `png` (default), `jpeg`, or `webp`.

* `--width` / `-w`
  Target width in pixels.

* `--height` / `-h`
  Target height in pixels.

* `--scale` / `-s`
  Device scale factor (e.g., 2 for “@2x”).

* `--background` / `-b`
  Background color (CSS color string) or keyword `transparent`.

* `--css`
  Path to an extra CSS file to inject.

* `--time` / `-t`
  Timestamp in seconds for animated SVGs (default `0`).

* `--concurrency`
  Number of parallel render jobs (avoid overloading the machine).

* `--silent`
  Reduce logging output.

Show a helpful `--help` that explains options, with a couple of examples.

---

## Library API Specification

Expose a library API from `src/index.ts`.  Aim for a small, predictable surface.

Example (TypeScript) interface:

```ts
export type OutputFormat = "png" | "jpeg" | "webp";

export interface RenderOptions {
  width?: number;
  height?: number;
  scale?: number;
  background?: string;          // "transparent" or any CSS color
  format?: OutputFormat;
  time?: number;                // seconds into animation
  extraCss?: string;            // raw CSS to inject
  baseUrl?: string;             // for resolving relative URLs (external CSS, images)
}

export interface RenderResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: OutputFormat;
}

export interface SvgSource {
  svg: string;                  // raw SVG markup
  baseUrl?: string;
}

export declare function renderSvg(
  source: SvgSource,
  options?: RenderOptions
): Promise<RenderResult>;

export declare function renderSvgFile(
  path: string,
  options?: RenderOptions
): Promise<RenderResult>;
```

The exported functions should **not** assume CLI usage.  They should be usable from other codebases, or from tests, without process globals.

---

## SVG Rendering Strategy

### For raw SVG strings

1. Wrap the SVG in a minimal HTML template only if necessary.

   * For example: an HTML document with `<head>` for CSS injection and `<body>` containing the SVG.
2. Inject any extra CSS into a `<style>` element in the `<head>`.
3. Use the headless browser to:

   * Open the HTML / data URL.
   * Wait for fonts and external resources to load (or time out after a configurable delay).
   * Set viewport size based on:

     * `width` / `height` options, or
     * SVG `viewBox`, or
     * SVG `width` / `height` attributes.
4. Seek to the requested animation time (if any).  For example, execute JavaScript in the page that uses `document.documentElement.setCurrentTime(time)` for SMIL animations, and `window.requestAnimationFrame` loops for CSS animations.
5. Capture a screenshot of the SVG area only, not the entire full-page background.

### For SVG files or URLs

* When a **file path** is provided:

  * Read the SVG locally, and treat it like the raw string path above, with `baseUrl` set to the containing directory so that relative URLs for images or CSS resolve correctly.

* When a **URL** is provided:

  * Allow loading it directly in the browser context.
  * Let the browser resolve external resources normally.
  * Still offer injection of extra CSS and timestamp control when feasible.

---

## Handling CSS And Advanced Features

1. **CSS loading**

   * Ensure that:

     * `<style>` tags in the SVG or wrapper HTML are respected.
     * `<link rel="stylesheet" href="...">` references are allowed when `baseUrl` / document URL makes them resolvable.
   * Provide configuration to:

     * Toggle loading of external stylesheets (for security or offline reasons).
     * Fail gracefully when external CSS cannot be loaded.

2. **Fonts**

   * Support custom web fonts loaded via `@font-face` or `<link>`.
   * Document how a user can:

     * Provide a custom font CSS file via `--css`.
     * Include font files in a known directory relative to the SVG or HTML.

3. **Filters, masks, gradients, and patterns**

   * Rely on the headless browser’s SVG implementation.
   * Add tests that verify:

     * Drop shadow filters are present in the output.
     * Gradients render with visually different pixel colors across the shape.

4. **Animations**

   * For animated SVGs:

     * Document that we render a single frame, not an animated GIF or video.
     * Offer a `time` option to capture at a specific animation time.
     * Test at least one animated fixture, ensuring that different timestamps produce different outputs.

5. **Security considerations**

   * Assume potentially untrusted SVG input.
   * Do not execute arbitrary JavaScript from the SVG beyond what a normal browser would do.
   * Avoid enabling Node integration in the browser context.

---

## Error Handling And Logging

* Fail fast on:

  * Invalid SVG (malformed XML).
  * Unsupported output format.
  * Missing input files.
* Return meaningful error messages, including:

  * Which file or URL failed.
  * Whether the issue was parsing, loading external resources, or rendering.
* CLI:

  * Exit with non-zero status on errors.
  * Print human-friendly messages.
  * Offer a `--silent` mode for minimal output, and a `--verbose` mode for debugging.

---

## Testing Strategy

Implement both unit and integration tests.

1. **Unit tests**

   * Test utility functions (file IO, option parsing, viewport calculation).
   * Test API functions with mocked browser renderer where appropriate.

2. **Integration tests**

   * Use the actual headless browser to render a small suite of SVG fixtures:

     * Basic shapes without CSS.
     * Shapes styled with inline attributes.
     * Shapes styled via `<style>` blocks.
     * SVG using external CSS (when a base URL or file structure exists).
     * SVG using filters, gradients, masks.
     * SVG with text on path and custom fonts.
     * One animated SVG with timestamps `0`, `0.5`, and `1.0` seconds.
   * For assertions:

     * Compare output dimensions and format.
     * Optionally compare pixel buffers with a low threshold (snapshot or similarity metric), or compare hashes of outputs against known good artifacts.

3. **CI**

   * Add a basic CI workflow (if possible in the environment) that runs:

     * `npm run lint`
     * `npm test`

---

## Quality And Style Guidelines

* Code should be:

  * Modular, with small, focused functions.
  * Documented at the module and public API level.
  * Consistent with the chosen lint and formatting configuration.

* Prefer:

  * `async` / `await` over raw promise chains.
  * Clear naming over clever one-liners.
  * Explaining non-obvious browser or SVG quirks in comments near the workaround.

---

## Non-Goals (For Now)

* No animated GIF, video, or sprite sheet export.  Only static raster images per invocation.
* No server or HTTP API.  This is a local CLI tool and library.
* No attempt to match pixel-perfect rendering across different browser engines.  The reference renderer is the chosen headless browser’s implementation.

---

## Acceptance Checklist

Before considering the implementation complete, ensure that:

* [ ] The CLI can convert a basic SVG to PNG.
* [ ] The CLI supports at least PNG, JPEG, and WebP outputs.
* [ ] Both file and raw string inputs are supported via the library API.
* [ ] CSS from `<style>` blocks, inline attributes, and external stylesheets is applied.
* [ ] Advanced SVG features (filters, gradients, masks, text on path) render correctly in test fixtures.
* [ ] Animated SVGs can be captured at specified timestamps.
* [ ] Tests cover the main code paths, including error cases.
* [ ] Lint and format checks pass.
* [ ] Documentation exists in `README.md` showing how to use both the CLI and the library API.

```

