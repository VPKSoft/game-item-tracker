# Agent instructions

## Changes go through pull requests

- Never commit or push directly to `develop` (the default and CI branch).
- For every change, create a branch from an up-to-date `develop`, named `feature/<short-description>`
  (or `fix/<short-description>` for bug fixes), commit there, push it and open a pull request into `develop`.
- Keep follow-up commits for the same change on the same PR branch.

## Before opening or updating a pull request

Run these and make sure they pass:

```bash
npm run lint
npx tsc -b
npm test
```

## Project knowledge

Read [docs/TECHNICAL_MANUAL.md](docs/TECHNICAL_MANUAL.md) before changing code. It describes the architecture,
data formats, invariants and step-by-step recipes for common changes. Keep it up to date when you change
the data model, storage or file formats.
