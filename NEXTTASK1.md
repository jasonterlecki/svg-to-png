# NEXTTASK 1: Improve CLI/Desktop Progress & UX

## Goal
Enhance both the CLI and the Electron desktop app with richer feedback while converting SVGs, including per-file status, progress indicators, and cancellation support.

## Why
- Long conversions currently provide minimal feedback; users have no insight into which file is in progress or how long remains.
- A cancel button or keyboard interrupt handling will prevent users from forcibly killing the app when they change their minds mid-conversion.
- Showing inline preview thumbnails (before/after) would make the desktop app more user-friendly and confirm that changes (background, size) are applied as expected.

## Proposed Work
1. **CLI progress**
   - Integrate a lightweight progress indicator (e.g., `cli-progress` or manual rendering) showing total files, completed, failures, and elapsed time.
   - Print per-file completion lines with dimensions and output path (optional compact mode).
   - Handle `SIGINT` (Ctrl+C) gracefully to cancel outstanding jobs and close the renderer cleanly.

2. **Desktop UI enhancements**
   - Add per-file progress list in the UI (e.g., table with status column) instead of a single status text.
   - Provide a cancel button that queues a cancellation request; the main process should stop dispatching new jobs and await current ones to finish.
   - Optionally show small preview thumbnails: render the SVGs to a temporary data URL (maybe using a simple `img` tag inside the renderer) before conversion, and show the resulting raster after completion for comparison.

3. **Plumbing**
   - Extend the IPC messages to stream progress updates (e.g., `ipcMain` emits events for “job started”, “job finished”, “job failed”) so the renderer can update the UI.
   - Ensure cancellation is safe: track active jobs, add a flag checked in the worker loop, and expose a `shutdownRenderer` call when stopping.

## Tests / Acceptance
- CLI shows dynamic progress for multi-file conversions and exits cleanly when interrupted.
- Desktop UI lists each selected file with live status updates; cancel button stops outstanding conversions.
- Preview thumbnails display without causing noticeable delays or memory spikes (optional).
