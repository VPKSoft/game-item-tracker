# Game Item Tracker
A [PWA](https://en.wikipedia.org/wiki/Progressive_web_app) for tracking game items.

Built with React, Vite, Ant Design and `vite-plugin-pwa`.

See the [user manual](docs/USER_MANUAL.md) for how to use the app.

## Concepts
- **Template** (`*.gitemplate.json`): the items of a game, or part of one. A template holds categories, items with images, names and descriptions, numeric attributes (e.g. rarity), predefined tags, **counters** and **variants**. It has a version and is edited in the *Templates* view.
  - Counters are defined per template. A *manual* counter is edited by the user (e.g. Inventory, Placed). A *computed* counter is the sum of chosen manual counters (e.g. Total = Inventory + Placed). One counter can have the *owned* role and one the *target* role. That pair enables the progress bars and the "missing" sort and filter.
  - Variants split an item's amounts into rows, e.g. normal and ★ starred fish. A counter can be limited to some variants, e.g. Placed only for starred fish.
- **Save** (`*.gisave.json`): one user's data for one template: counter values, notes, removed template tags and custom tags. It is edited in the *Inventory* view. When a newer version of its template is imported, the save can be upgraded without losing data.

Both are plain JSON with a `format` field (`game-item-tracker/template` or `game-item-tracker/save`). Everything is stored in the browser (IndexedDB) and saved automatically. Use *Export* to keep a file copy. A save can be exported with its template embedded, to move it to another device.

Images are added by file open, drag and drop, or paste (Ctrl+V). They are resized to at most 128×128 px WebP when you accept them in the preview.

## Development
```bash
npm install
npm run dev
```

- `npm run build`: type-check and build into `dist`
- `npm test`: run the unit and component tests (Vitest); `npm run test:watch` to watch
- `npm run lint`: run Biome lint, format and check
- `npm run generate-pwa-assets`: regenerate the PWA icons from `public/favicon.svg`

## Sample templates (Palia)
```bash
npm run build-samples -- --out ../game-item-tracker-data --version 1.0.0
```

This builds `palia-fish.gitemplate.json` and `palia-plushies.gitemplate.json` from [palia.wiki.gg](https://palia.wiki.gg) (CC BY-SA 4.0; game assets © Singularity 6). Fish are grouped by location and have Normal and ★ Starred variants. Plushies are grouped by how they are obtained. The output defaults to `../game-item-tracker-data`, outside this repository. Templates and saves are data, not part of the software, so they are not committed. Import the files in the *Library* view.

Pass `--no-images` to skip the image downloads. The template ids are fixed, so a regenerated template with a higher `--version` can be imported as an upgrade for existing saves.
