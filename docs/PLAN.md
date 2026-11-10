# Game Item Tracker: Implementation Plan

Status: **implemented** (revision 2). See the README for usage.

The app is built on the existing starter: React 19, Vite, Ant Design 6, styled-components, vite-plugin-pwa and Biome. It uses the existing conventions: PascalCase file names, `styled(Component)` wrappers and `BaseProps`.

### Revision 2 changes (your answers)
- **Counters are defined by the template**, not fixed in the code. A computed counter, such as Total, is a sum of chosen counters. A new template has no counters.
- **Item variants**, such as fish ★ Starred vs Normal, are the suggested alternative to duplicating items. Counters can be limited to certain variants, so "Placed" applies only to Starred.
- One template per save (confirmed).
- Images are 128 px WebP (confirmed). They can be added by **file open, drag and drop, or clipboard paste**, and are resized only after you accept them in a preview dialog.
- Fish are grouped by location (confirmed).
- Samples are generated outside the repo (confirmed).
- Hiding counters is no longer needed, because each template defines its own counters.

---

## 1. Concepts

| Concept | What it is | Who edits it |
|---|---|---|
| **Template** | Item definitions for one game, or one part of a game: categories, items, images, names, descriptions, numeric attributes, predefined tags, **counter definitions** and **variant definitions**. It is versioned. | Template editor ("author mode") |
| **Save** | One user's data for one template: counter values, notes, tag changes and custom tags. It references a template by `templateId` + `version`. One save uses exactly one template. | Inventory editor ("player mode") |

The save does **not** copy names, descriptions, images, attributes or counter definitions. It looks them up from the template by stable ids. This keeps saves small and makes template upgrades simple.

---

## 2. Data model (TypeScript + Zod schemas)

All files are validated with **Zod** on import. Each one carries a `format` marker and a `schemaVersion`, so later file-format changes can be migrated.

### 2.1 Template

```ts
type Template = {
    format: "game-item-tracker/template";
    schemaVersion: 1;                 // file-format version (app-controlled)
    templateId: string;               // stable UUID; identity across versions
    version: string;                  // content version, semver, e.g. "1.2.0"
    game: string;                     // "Palia"
    name: string;                     // "Palia – Fish"
    description?: string;
    updatedAt: string;                // ISO date
    attributeDefs: AttributeDef[];    // which numeric attributes exist
    counterDefs: CounterDef[];        // which amount counters exist (empty in a new template)
    variantDefs: VariantDef[];        // optional item variants (empty = items have no variants)
    tags: string[];                   // predefined tag vocabulary
    categories: Category[];
    items: TemplateItem[];
    images: Record<string, string>;   // imageId -> data URL (webp), deduplicated
    source?: { name: string; url: string; license?: string }; // attribution
};

type AttributeDef = {
    key: string;                      // "rarity", "quality"
    label: string;                    // "Rarity"
    min: number; max: number; step?: number;
    levels?: { value: number; label: string; color?: string }[]; // 1="Common" … 5="Legendary"
};

type CounterDef = {
    key: string;                      // "inventory", "placed", "total"
    label: string;                    // "Placed"
    kind: "manual" | "computed";
    sumOf?: string[];                 // computed only: keys of MANUAL counters to add up
    role?: "owned" | "target";        // drives progress bar and "missing" sort; at most one each
    variants?: string[];              // limit to these variant keys; omitted = all variants
    max?: number;                     // optional upper bound for manual counters
    order: number;
};

type VariantDef = {
    key: string;                      // "normal", "starred"
    label: string;                    // "★ Starred"
    order: number;
};

type Category = { id: string; name: string; order: number; parentId?: string };

type TemplateItem = {
    id: string;                       // stable slug, e.g. "bahari-bass"; never reused
    categoryId: string;
    name: string;
    description: string;
    imageId?: string;
    attributes: Record<string, number>; // read-only in saves
    tags: string[];                   // predefined tags for this item
    variants?: string[];              // which variantDefs apply; omitted = all (or none if no variantDefs)
    defaults?: Record<string /*counterKey*/, number>; // initial values in new saves, e.g. target
    deprecated?: boolean;             // item removed from game but kept for old saves
};
```

#### Counter rules
- A new template has **no counters**. The editor offers an optional "Add common counters" preset: Inventory, Placed, Storage, Total = Inventory + Placed + Storage, Target and Tradeable. You can edit or delete any of them.
- A **computed** counter is read-only and equals the sum of its `sumOf` counters. It may reference only manual counters, so there are no cycles and no ordering problems. Validation rejects unknown keys and an empty `sumOf`. A plain sum covers the "CounterX + CounterZ" case without a full formula language. Subtraction or weights can be added later if a game needs them.
- `role: "owned"` (typically Total) and `role: "target"` (typically Target) are optional. When both exist, the card shows a progress bar, and the "missing" (target − owned) sort and filter appear. When either is missing, those features are simply hidden.
- Manual counters are integers ≥ 0, and ≤ `max` if one is set. The UI enforces no other relationships between counters.

#### Variants instead of duplicate items (fish ★)
A fish has one card. Inside it is one counter row per variant:

```
Bahari Bass   [Common]                         tags…
  Normal    Inventory −[3]+   Total 3   Target −[1]+   Tradeable −[0]+
  ★ Starred Inventory −[1]+   Placed −[2]+  Total 3  Target −[1]+  Tradeable −[0]+
  Item total: 6
```

Why this is better than duplicating each fish:
- Name, description, image, tags and notes exist once. Edits and search hits are not doubled, and the item count stays at the real number of fish.
- `placed` has `variants: ["starred"]`, so it never appears for unstarred fish.
- Search and category views show one result per fish. Sorting by a counter uses the **item total across variants** by default, and the sort menu also offers per-variant options such as "Inventory (★ Starred)".
- Templates without variants, such as Plushies, have no variant rows. A card then shows a single counter row.

Duplicating items stays possible if a template author prefers it. Nothing prevents it.

### 2.2 Save

```ts
type Save = {
    format: "game-item-tracker/save";
    schemaVersion: 1;
    saveId: string;
    name: string;                     // "My Palia Fish"
    template: { templateId: string; version: string; name: string; game: string };
    updatedAt: string;
    items: Record<string /* itemId */, SaveItem>;
};

type SaveItem = {
    // counts[variantKey][counterKey]; items without variants use the key "_"
    // computed counters are NOT stored; they are derived on read
    counts: Record<string, Record<string, number>>;
    notes: string;
    removedTags: string[];  // template tags the user removed from this item
    customTags: string[];   // user-added free tags
};
```

Effective tags = `(templateItem.tags − removedTags) ∪ customTags`. Storing the difference, not a full copy, means tags added in a later template version still appear for the user. A tag the user removed stays removed.

### 2.3 Template upgrade (migration of a save)

When a newer version of the same `templateId` is in the library, the save shows an **"Upgrade to v1.3.0"** action with a preview dialog that summarizes the changes:
- **New items, counters or variants** start at their `defaults`, or 0.
- **Removed or deprecated items** keep their user data. They are shown with an "obsolete" badge and are never deleted silently.
- **Removed counters or variants**: their stored values are kept in the save but hidden. If the counter comes back in a later version, the values reappear. The preview lists them, and an optional "discard hidden values" checkbox removes them.
- Changes to computed counter formulas, categories, attributes and names apply automatically, because they are derived or referenced, not copied.
- Upgrades go forward only. The save stores the new version.

---

## 3. Files and storage

### 3.1 File extensions (JSON, but recognizable)

- Template: **`*.gitemplate.json`**, e.g. `palia-fish.gitemplate.json`
- Save: **`*.gisave.json`**, e.g. `my-palia-fish.gisave.json`

The double extension keeps the content openable as JSON in any editor or OS. The first part names the role, and the `format` field inside makes detection reliable even if the file is renamed. Import accepts any `.json` and decides by `format`.

Export uses the File System Access API (`showSaveFilePicker`) where it exists (Chromium) and falls back to a download link elsewhere. Saves can optionally be exported **with the template embedded**, as a `bundle` field, so one file can move to another device.

### 3.2 Browser storage

**IndexedDB** (through the small `idb` library). localStorage is not used for data, because its ~5 MB limit is too small for images.
- Object store `templates`, keyed by `[templateId, version]`. Several versions are kept so older saves still resolve.
- Object store `saves`, keyed by `saveId`.
- Object store `meta`, for the last opened save and template and UI preferences. Small UI settings, such as dark mode, stay in the existing `useLocalStorage`.

Autosave is debounced, about 500 ms after the last change, with a flush on `visibilitychange`/`pagehide`. Closing the tab never loses more than that window. The app also calls `navigator.storage.persist()` so the browser does not evict the data. A "last exported" timestamp per save and template powers a gentle "not backed up" hint.

Templates and saves are stored separately: separate IndexedDB stores, separate files, and a separate UI section each. **The repository contains only software.** No user data and no generated Palia data is committed (see section 7).

---

## 4. UI

The top-level navigation is antd `Segmented`/`Tabs` in the existing toolbar: **Inventory | Templates | Library**.

### 4.1 Shared "item browser" component

Both editors use the same layout:

```
[Category ▼ (All / tree)] [🔍 search ……………] [Sort: Rarity ▼] [↑↓] [filters…]
┌────┐┌────┐┌────┐┌────┐
│card││card││card││card│   ← virtualized, scrollable card grid
└────┘└────┘└────┘└────┘
```

- **Category selector**: "All" plus the categories, with an item count per category.
- **Quick search** with **Fuse.js** in one field, debounced at about 150 ms. Keys and weights: name (3), tags (2), description (1), notes (1, saves only). The threshold is about 0.35 and `ignoreLocation: true`. The index is rebuilt only when the item data changes, not on every keystroke.
- **Sorting** by name, by any numeric attribute from `attributeDefs`, and in saves by any counter from `counterDefs`. Counter sorts use the item total across variants, and there are per-variant options. **Missing** (target − owned) appears when those roles exist. Ascending or descending. With an active search, "relevance" is offered as an extra sort option.
- **Filters** (saves): "only missing" (when roles exist), "counter > 0" for any counter (e.g. tradeable > 0), "only with notes" and a tag filter.
- **Virtualized grid** with `@tanstack/react-virtual`, by rows of N cards that respond to the width. With 10,000 items only the visible rows are rendered. Card height depends on the number of variants, so row heights are measured.

### 4.2 Template editor

- Template metadata: game, name, description, **version** (semver input with patch, minor and major buttons) and source/attribution.
- Category manager: add, rename, reorder and delete. Deleting a category moves its items to another one.
- Attribute definition manager: key, label, range and optional named levels such as Rarity 1–5 → Common…Legendary.
- **Counter definition manager**: add, rename and reorder counters. Each counter has a type (manual or computed). Computed counters get a multi-select of the manual counters to sum, with a live preview such as `Total = Inventory + Placed`. Each counter also has an optional role (owned or target), the variants it applies to, and an optional max. It starts empty, with the "Add common counters" preset button.
- **Variant definition manager**: add, rename and reorder variants. Each item chooses which variants apply, defaulting to all.
- Predefined tag vocabulary: rename a tag across all items, or merge tags.
- Item cards and an **item edit drawer**: name, description, category, image (see section 5), attributes, tags (select from the vocabulary or create new), variants, default counter values and deprecated.
- Validation: unique ids and keys, no orphan category or counter references, `sumOf` contains only manual counters, at most one counter per role, attributes within range. Errors are shown before export.
- New template, duplicate as a new version, import and export.

### 4.3 Inventory (save) editor

- Pick or create a save from a template in the library.
- Each card shows the image, name, attribute badges (read-only, e.g. a colored rarity tag), one compact counter row per variant and the effective tags.
- **Quick amount editing**: each manual counter is a small `−  [n]  +` stepper. Clicking the number opens direct input. Shift-click steps by 10. Computed counters are shown read-only. A progress bar shows owned / target when those roles exist.
- An item drawer for notes (a textarea), tag editing (template tags can be removed or re-added, custom tags can be added) and all counters.
- An "Upgrade template" banner when a newer version is available.

### 4.4 Library

- Lists of templates (with versions) and saves: open, import, export, delete (with confirmation) and "create save from template".
- First-run screen: "Import a template" or "Create an empty template".

---

## 5. Images

### 5.1 Adding an image (template item drawer)
An image drop zone in the item drawer accepts three input methods:
- **File open**: the "Choose image…" button opens a file input (`accept="image/*"`).
- **Drag and drop** of an image file onto the drop zone. Images dragged from another browser tab come as files or URLs. Only files are supported, because fetching URLs runs into CORS limits.
- **Paste**: Ctrl/Cmd+V while the drawer is focused reads `clipboardData.items`, and a "Paste" button uses `navigator.clipboard.read()` where it is available.

All three open an **image preview dialog**. It shows the original image, its pixel size and file size, and a preview of the resized result with its final size in KB. **The resize happens only when you click Accept.** Cancel discards the image, and the item keeps its current one.

### 5.2 Resize rules
- Decode with `createImageBitmap`, then scale down on a canvas to a **maximum of 128×128**. The aspect ratio is kept and images are never scaled up. Encode as **WebP at quality 0.85**, with a PNG fallback if WebP encoding is unsupported. That is typically 4–12 KB per image.
- Hard limits: input file **≤ 10 MB**, checked before decoding with a clear error message, and output **≤ 64 KB**. If the output is too big, the quality is stepped down and the image retried.
- Images are deduplicated by SHA-256 of the output bytes (`imageId` = hash), so a shared icon is stored once.
- Budget: 10,000 items × about 8 KB ≈ 80 MB raw, about 107 MB base64 in JSON. That is acceptable for IndexedDB and export.
- At render time the data URLs become `Blob` object URLs, lazy-loaded per visible card, so the grid stays fast.

---

## 6. Project structure (new files)

```
src/
  Types/          TemplateTypes.ts, SaveTypes.ts
  Schemas/        TemplateSchema.ts, SaveSchema.ts (Zod), Migrations.ts
  Storage/        Database.ts (IndexedDB), UseAutosave.ts
  Domain/         CreateSave.ts, UpgradeSave.ts, EffectiveTags.ts, Counters.ts
                  (manual/computed evaluation, variant applicability),
                  Search.ts (Fuse setup), Sorting.ts, Validation.ts
  Files/          FileIo.ts (export/import, extension + format detection)
  Images/         ImageResize.ts, ImageInput.ts (file/drop/paste → File)
  Components/     ItemBrowser.tsx, ItemCard.tsx, CounterRow.tsx, CounterStepper.tsx,
                  CategorySelect.tsx, SearchBox.tsx, SortSelect.tsx, TagEditor.tsx,
                  ImageDropZone.tsx, ImagePreviewDialog.tsx
  Views/          TemplateEditor/… (incl. CounterDefsEditor, VariantDefsEditor),
                  InventoryEditor/…, Library/…
  Context/        DataContext.tsx (current template/save + dispatch)
scripts/
  BuildPaliaTemplates.ts   (Node; not part of the app bundle)
```

Tests are colocated as `*.test.ts(x)`.

State is handled with `useReducer` + context per open document. Edits are pure reducer actions, which makes them easy to test. No extra state library is needed.

New dependencies: `fuse.js`, `zod`, `idb`, `@tanstack/react-virtual`. Dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `fake-indexeddb`. For the script: `node-html-parser` and `sharp`.

---

## 7. Palia sample templates

A Node script, `npm run build-samples -- --out <dir>`, generates both templates. **The output goes to a folder outside the repository**, defaulting to `../game-item-tracker-data/`, and nothing it produces is committed. The template files carry `source` attribution (palia.wiki.gg, CC BY-SA, game assets © Singularity 6).

The script reads the rendered HTML through the MediaWiki API (`/api.php?action=parse&page=…&prop=text&format=json`), which is more stable than scraping the page. It parses the `wikitable` tables, downloads the item images (the full-size file rather than the thumbnail) and resizes them with the same 128 px WebP rules.

**Fish template** (`palia-fish.gitemplate.json`), from the "List of Fish" table. Columns: Name, Description, Rarity, Location, Time, Bait, Needed For.
- Categories: **by location** (Bahari Coast, Bahari Rivers, Kilima Lake, Caves, Ponds, …). Vault of the Waves fish are left out unless you want them.
- Variants: `normal` ("Normal") and `starred` ("★ Starred"), and every fish has both.
- Counters:
  - Inventory: manual, both variants.
  - Placed: manual, **starred only**.
  - Total = Inventory + Placed, computed, role owned.
  - Target: manual, role target.
  - Tradeable: manual.
- Attributes: `rarity` 1–5 (Common → Legendary).
- Tags: location, time of day, bait, and each "Needed For" entry (e.g. `bundle:Flamerod Bundle`, `quest:Daily Quest`).

**Plushies template** (`palia-plushies.gitemplate.json`), from the many tables. Columns: Image, Name, How to Obtain, Rarity.
- Categories: the page sections (Bug Catching, Cooking, Fishing, Hunting, Mining, Zeki's Wondrous Machine, Lunar Paths, Maji Market, Refer A Friend, Unavailable, …). "Always Available" and "Event" become parent categories.
- No variants.
- Counters:
  - Inventory: manual.
  - Placed: manual.
  - Storage: manual.
  - Total = Inventory + Placed + Storage, computed, role owned.
  - Target: manual, role target.
  - Tradeable: manual.
- Some plushies appear in several tables, sometimes with different rarities. One item is created per plushie name. Its category is the first table it appears in, and the other sources become tags (`Source: Lunar Paths`). Rarity is taken from the first occurrence. Conflicts are printed in the script's log.
- Tags: source names from "How to Obtain", plus `tradeable` where the cell says "Trading", and `unavailable` for that section.

The two samples show both setups: one template with variants and counters limited to a variant, and one with a flat set of counters.

The parser is tested against small hand-written HTML fixtures that copy the table structure, not wiki content.

---

## 8. Tests

- **Vitest** with jsdom, `@testing-library/react` and `fake-indexeddb`. Scripts: `npm test`, `npm run test:watch` and `npm run coverage`. CI gets `npm test` added to `.github/workflows/node.js.yml`.
- Unit tests:
  - Zod schemas: valid and invalid files, plus format detection and the wrong-file-type error message.
  - **Counters**:
    - Computed sums are correct, including when a summed counter doesn't apply to a variant.
    - Validation catches unknown keys, computed-on-computed references, an empty `sumOf` and duplicate roles.
    - Integers ≥ 0, and the `max` limit is enforced.
    - Item totals add up correctly across variants.
  - `createSave` from a template, with defaults and variants.
  - `upgradeSave`:
    - New items, counters and variants start at their defaults.
    - Removed counters and variants keep their values but are hidden.
    - Deprecated items keep their data.
    - Tag differences survive.
  - Effective tags.
  - Search: matches by name, tag, description and notes, with typo tolerance.
  - Sorting by every key, including per-variant counters and missing, in both directions, with stable ties.
  - Image input: file, drop and paste events are turned into a `File`, and non-images and files over 10 MB are rejected.
  - Image resize sizing math and the quality step-down loop (canvas mocked).
  - IndexedDB round trip, plus the autosave debounce and flush.
  - Wiki table parser on fixtures, including the fish variant and counter setup.
- Component tests:
  - Counter stepper, and a counter row with read-only computed values.
  - Item browser: category + search + sort working together.
  - Item drawer saving notes and tags.
  - Image preview dialog: Accept resizes and stores the image, Cancel leaves the item unchanged.
  - Counter definitions editor: adding a computed Total.
- A performance smoke test: search and sort over 10,000 generated items finish within a budget, about 50 ms in Node.

---

## 9. Implementation order

1. Types, Zod schemas, domain functions (counters, variants, tags, saves, upgrades) and their tests.
2. IndexedDB storage, autosave and file import/export (+ tests).
3. Shared item browser: virtualized grid, search, sort and category selection.
4. Inventory editor (counter rows per variant, drawer, tags, notes).
5. Template editor (metadata, categories, attributes, counters, variants, items, image input and preview).
6. Library view and template upgrade flow.
7. Palia sample generation script and parser tests.
8. README update, CI test step, lint pass.

---

## 10. Open questions

The earlier questions Q1–Q6 are answered and included above. New, minor ones:

- **Q7. Target per variant.** In the fish sample, Target is a counter that applies to every variant, so you can want e.g. 1 starred and 3 normal. Would one Target per fish be enough?
- **Q8. Vault of the Waves fish.** Include them in the fish sample, as their own location category?
