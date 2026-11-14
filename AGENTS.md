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

## Versioning

The app uses [Semantic Versioning](https://semver.org) (`MAJOR.MINOR.PATCH`) with `version` in `package.json` as
the only source. In a PR that changes the app, bump it with `npm version <major|minor|patch> --no-git-tag-version`:
MAJOR for incompatible changes (minor while the version is `0.x`), MINOR for new features, PATCH for bug fixes;
docs-, test- or tooling-only changes need no bump. When the PR is merged into `develop`, the Release workflow
creates the `vX.Y.Z` tag and a GitHub release automatically; never create release tags by hand.
See "Versioning and releases" in [docs/TECHNICAL_MANUAL.md](docs/TECHNICAL_MANUAL.md#121-versioning-and-releases).

## Project knowledge

Read [docs/TECHNICAL_MANUAL.md](docs/TECHNICAL_MANUAL.md) before changing code. It describes the architecture,
data formats, invariants and step-by-step recipes for common changes. Keep it up to date when you change
the data model, storage or file formats.

## Tag format in examples and generated data

When you write tags into code examples, sample-template generators, test data or documentation, use the
`Name: value` format: capitalized name, colon, one space, value (e.g. `Location: Kilima Lake`, `Bait: Worm`).
It is more readable than the older `name:value` format (`location:Kilima Lake`), so prefer it with new templates.
See "Tag format" in [docs/TECHNICAL_MANUAL.md](docs/TECHNICAL_MANUAL.md#53-tags-effectivetagsts).
