# NEXTTASK 3: URL and Raw SVG Support

## Goal
Allow both the CLI and desktop app to accept SVG input via remote URLs or raw markup (e.g., clipboard paste), not just local files.

## Why
- Designers often share SVGs via Figma exports or online assets; requiring local files adds friction.
- Automation workflows may pull SVGs from APIs/URLs and want to pipe them directly into `svg2raster`.
- Providing a “Paste SVG markup” box in the desktop UI makes quick experiments and tweaks easier.

## Proposed Work
1. **Library/API**
   - Extend `renderSvgFile` or add a new helper `renderSvgSource` that accepts `SvgSource` with raw markup/baseUrl/time/etc.
   - Provide utility to fetch remote URLs (with timeout, redirect limit) and pass content to the renderer.

2. **CLI**
   - Allow `svg2raster https://example.com/logo.svg --out logo.png`.
   - Detect stdin input: `cat icon.svg | svg2raster --stdin --out icon.png`.
   - Support `--input-raw "<svg ...>"` or reading from a file descriptor.

3. **Desktop UI**
   - Add a text area that accepts pasted SVG markup and treat it as a pseudo-file (optionally allow mixing files + raw entries).
   - Add a field for URLs; clicking “Download & add” fetches the SVG (with progress/error display) and adds it to the job list.

4. **Security**
   - Document that fetching remote URLs may expose the renderer to external content; optionally offer `--allow-remote` flag.
   - Consider blocking remote CSS/images for raw/remote inputs unless explicitly allowed.

5. **Docs**
   - Update README with examples for piping stdin/URLs and explain limitations (CORS, relative paths).

## Tests / Acceptance
- CLI can convert `https://.../asset.svg` and handle HTTP errors gracefully.
- Desktop UI shows errors for invalid URLs and successfully processes pasted markup.
- Unit tests for fetch helper (mocked HTTP) and raw SVG pipeline.
