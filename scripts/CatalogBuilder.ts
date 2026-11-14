/**
 * Pure helpers of the template catalog builder (`BuildCatalog.ts`): they validate the template files of the
 * template repository and create the catalog (`index.json`) and a plain HTML listing of the published site.
 */
import { validateTemplate } from "../src/Domain/Validation.ts";
import { parseFileText } from "../src/Files/FileFormat.ts";
import { type Catalog, type CatalogEntry, catalogFormat, catalogSchemaVersion } from "../src/Schemas/CatalogSchema.ts";

/** A template file of the template repository. */
type CatalogFile = {
    /** The path relative to the repository root, with `/` separators. */
    path: string;
    text: string;
    /** The size in bytes. */
    size: number;
};

/** The catalog and every problem found. The catalog must not be published when there are errors. */
type CatalogBuildResult = { catalog: Catalog; errors: string[] };

/**
 * The letter folder of a game: its first letter in upper case. A name that starts with a digit goes under the
 * first letter of the number written out in English (see the template repository README), so it is not checked.
 */
const expectedLetter = (game: string) => {
    const first = game.trim().charAt(0).toLocaleUpperCase("en");
    return /^[A-Z]$/.test(first) ? first : undefined;
};

/** Checks that a template is stored as `<Letter>/<Game>/<file>`. Returns the problems found. */
const checkLayout = (path: string, game: string) => {
    const segments = path.split("/");
    if (segments.length !== 3) {
        return [`${path}: templates must be stored as <Letter>/<Game>/<file>`];
    }
    const [letter, folder] = segments;
    const errors: string[] = [];
    if (folder !== game) {
        errors.push(`${path}: the game folder "${folder}" does not match the template's game "${game}"`);
    }
    const expected = expectedLetter(game);
    if (expected && letter !== expected) {
        errors.push(`${path}: the letter folder should be "${expected}"`);
    }
    return errors;
};

/** Validates the template files and builds the catalog from them, sorted by game, name and path. */
const buildCatalog = (files: readonly CatalogFile[], generatedAt: string): CatalogBuildResult => {
    const errors: string[] = [];
    const templates: CatalogEntry[] = [];
    const pathsById = new Map<string, string>();

    for (const file of files) {
        const parsed = parseFileText(file.text);
        if (parsed.kind === "error") {
            errors.push(`${file.path}: ${parsed.message}`);
            continue;
        }
        if (parsed.kind !== "template") {
            errors.push(`${file.path}: this is a save file, not a template`);
            continue;
        }
        const template = parsed.template;
        for (const issue of validateTemplate(template)) {
            errors.push(`${file.path}: ${issue.path}: ${issue.message}`);
        }
        errors.push(...checkLayout(file.path, template.game));
        const other = pathsById.get(template.templateId);
        if (other) {
            errors.push(`${file.path}: the templateId ${template.templateId} is already used by ${other}`);
        }
        pathsById.set(template.templateId, file.path);
        templates.push({
            templateId: template.templateId,
            version: template.version,
            name: template.name,
            game: template.game,
            ...(template.description ? { description: template.description } : {}),
            itemCount: template.items.length,
            updatedAt: template.updatedAt,
            path: file.path,
            size: file.size,
            ...(template.source ? { source: template.source } : {}),
        });
    }

    templates.sort(
        (a, b) => a.game.localeCompare(b.game) || a.name.localeCompare(b.name) || (a.path < b.path ? -1 : 1)
    );
    return {
        catalog: { format: catalogFormat, schemaVersion: catalogSchemaVersion, generatedAt, templates },
        errors,
    };
};

const escapeHtml = (text: string) =>
    text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Creates a plain HTML page that lists the templates with download links, for people who open the site. */
const catalogPage = (catalog: Catalog, appUrl: string, repositoryUrl: string) => {
    const rows = catalog.templates
        .map(
            t =>
                `<tr><td>${escapeHtml(t.game)}</td><td><a href="${escapeHtml(t.path.split("/").map(encodeURIComponent).join("/"))}" download>${escapeHtml(t.name)}</a></td><td>${escapeHtml(t.version)}</td><td>${t.itemCount}</td></tr>`
        )
        .join("\n");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Game Item Tracker templates</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 16px; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; }
</style>
</head>
<body>
<h1>Game Item Tracker templates</h1>
<p>The easiest way to use these templates is <b>Library → Online templates</b> in
<a href="${escapeHtml(appUrl)}">Game Item Tracker</a>. You can also download a file here and import it in the Library.</p>
<p>Want to share a template? See <a href="${escapeHtml(repositoryUrl)}">the template repository</a>.</p>
<table>
<thead><tr><th>Game</th><th>Template</th><th>Version</th><th>Items</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p><small>Updated ${escapeHtml(catalog.generatedAt)}</small></p>
</body>
</html>
`;
};

export type { CatalogBuildResult, CatalogFile };
export { buildCatalog, catalogPage, checkLayout };
