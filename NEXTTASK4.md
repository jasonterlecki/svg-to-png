# NEXTTASK 4: CI & Automated Testing

## Goal
Introduce automated testing and continuous integration to ensure regressions are caught early for the library, CLI, and desktop UI.

## Why
- Currently tests run manually; adding CI ensures lint/test/build run on every PR/commit.
- Desktop UI lacks integration tests; e2e coverage (with mocked renderer) helps prevent IPC/UI regressions.
- A consistent tooling pipeline (format, lint, unit + e2e) keeps contributions healthy.

## Proposed Work
1. **CI (GitHub Actions or similar)**
   - Workflow file that runs on push/PR: `npm ci`, `npm run lint`, `npm test`, `npm run build`.
   - Cache `~/.cache/ms-playwright` to speed up installs. Optionally skip Playwright browsers if not needed (or use `npx playwright install --with-deps chromium` step).

2. **Desktop integration tests**
   - Use Playwright or Spectron to launch the Electron app in a headless environment.
   - Mock the renderer module to avoid launching Chromium; verify UI flows (select files, show status, render summary).
   - Add snapshot tests for the renderer UI to catch layout regressions.

3. **Coverage enforcement**
   - Configure Vitest to fail if coverage drops below thresholds.
   - Report coverage results in CI (e.g., codecov) if desired.

4. **Docs/Contribution Guide**
   - Add `CONTRIBUTING.md` describing how to run tests, lint, and desktop e2e.
   - Mention CI requirements and how to update snapshots.

## Tests / Acceptance
- CI pipeline passes on main and fails when lint/test/build fail.
- Desktop e2e test covers typical workflow (select file, set options, convert) with mocks.
- README/CONTRIBUTING updated to explain the new process.
