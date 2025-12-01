# NEXTTASK 5: Packaging & Distribution

## Goal
Package the Electron desktop app for major platforms (Windows, macOS, Linux) so end users can download installers or standalone executables without cloning the repo.

## Why
- Non-technical users often expect a double-clickable app rather than a CLI.
- Packaging ensures consistent dependencies (Playwright browser binaries, Sharp binaries) and provides credibility when sharing the tool.
- Having installers enables easier distribution to teams/clients.

## Proposed Work
1. **electron-builder setup**
   - Configure `electron-builder` in `package.json` (appId, productName, directories).
   - Add build scripts: `npm run dist` to generate platform-specific artifacts (DMG/PKG for macOS, EXE/MSI for Windows, AppImage/deb for Linux).

2. **Playwright/Sharp assets**
   - Ensure Playwright browser binaries are bundled or downloaded on first run (document requirement or run `playwright install chromium` during packaging).
   - Verify Sharp native modules work across target platforms (consider using prebuilt binaries).

3. **Code signing (optional)**
   - Document steps for Apple Developer ID / Windows signing if necessary (out of scope to implement, but note in README).

4. **Auto-update (optional)**
   - Evaluate integrating auto-updates (Squirrel, electron-updater) for future convenience.

5. **Documentation**
   - Update README with instructions for `npm run dist` and where to find generated builds.
   - Provide a basic changelog or `RELEASE.md` template for future releases.

## Tests / Acceptance
- `npm run dist` produces installers/executables for the current platform.
- Packaged app launches, lets users select files, converts successfully.
- Documentation explains the packaging process and requirements (Playwright download, etc.).
