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

## Publishing or updating a sample template

The Palia samples are built here (`npm run build-samples`) but published in the separate data repository
`game-item-tracker-data`. To publish a new template or an update:

1. Merge the app pull request (builder or feature) into `develop` first: the data repository's check workflow
   builds the catalog with this repository's `develop`.
2. Build into a scratch folder, not straight into the data repository:
   `npm run build-samples -- --out <scratch dir> --version x.y.z`. The build rewrites every template with the one
   `--version`, so copy only the templates the change is meant to update.
3. Read the build log. Rebuild when it shows `image for … failed` (the wiki sometimes answers 504) or
   `problem:` lines (validation issues).
4. Version: use a higher version than the one in the published catalog. A template that is only in an open,
   unmerged data pull request can be rebuilt with the same version.
5. Review the diff: only the intended fields and the version should change. Image entries may move once in
   files built before the images were sorted; the image data itself should be identical.
6. In `game-item-tracker-data`: create a branch `template/<short-name>` from `main`, put the file under
   `P/Palia/`, add new files to the file list in its `README.md`, and open a pull request into `main`. Wait for
   the "Check and publish templates" run.
7. After the merge, check the publish run on `main` and that `https://vpksoft.github.io/game-item-tracker-data/index.json`
   lists the new version.

## Checking changes in the browser

- `.claude/launch.json` has two dev server entries, `dev` (port 5173) and `dev-alt` (port 5174), so a second
  session can run its own server when the first port is taken.
- To try a template in the dev server without the file picker, load it into the app's storage from the browser
  console: `const db = await import("/src/Storage/Database.ts"); await db.putTemplate(template);` and reload.
  `/src/Domain/CreateSave.ts` (`createSave`) and `db.putSave` add a save the same way. Files in the project root
  are served by the dev server, so a temporary JSON file there can be fetched (delete it afterwards).
