# Contributing

## Scope

This repository accepts focused changes that do not alter behavior unless the change is explicitly intended as a feature or bug fix.

## Development

1. Install dependencies with `npm install`.
2. Make changes in small, reviewable commits.
3. Run `npm test` before opening a change.
4. Update `./README.md` when user-facing behavior, configuration, or packaging changes.

## Pull Requests

- Keep the change narrowly scoped.
- Include tests for behavior changes.
- Do not mix unrelated refactors with functional work.
- Explain any packaging or release-impacting changes in the PR description.

## Release Hygiene

- Runtime package contents are controlled by the `files` field in `./package.json`.
- Test-only files should stay outside the published package unless they are intentionally part of the public distribution.
