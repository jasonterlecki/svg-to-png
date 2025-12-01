# INSTRUCTIONS

1. Work in small, clear steps.  After each meaningful change, run the relevant checks (build, tests, or lints) before proceeding.

2. After **each change**, run:
   - `git add <files>`
   - `git commit -m "<short, relevant message>"`

3. Keep commits focused.  Each commit should represent one logical change (e.g., “add CLI option for output format,” “implement Playwright renderer,” “add tests for external CSS”).

4. When modifying or adding functionality, also update or add tests to cover the new behavior.  Make sure all tests pass before committing.

5. Keep the code style consistent.  Use the configured linter and formatter (e.g., `npm run lint`, `npm run format`) and fix any reported issues before committing.

6. Update documentation (including this file or `README.md`) whenever behavior, options, or usage changes.  Treat docs updates as real work and commit them with clear messages.

7. If a change turns out to be larger than expected, break it into smaller, incremental commits rather than one big commit.

