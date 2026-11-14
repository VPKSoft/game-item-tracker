/**
 * Builds the online template catalog from the template repository (`game-item-tracker-data`).
 *
 *     npx tsx scripts/BuildCatalog.ts --data ../game-item-tracker-data --out ../site
 *
 * Every `*.gitemplate.json` under the letter folders is validated like an import in the app (Zod schema plus
 * `validateTemplate`) and checked for the `<Letter>/<Game>/` layout. With `--out`, the template files,
 * `index.json` (the catalog the app reads) and `index.html` (a plain listing) are written there. Without it,
 * only the checks run. Exits with code 1 when any template has problems; nothing is written then.
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { templateExtension } from "../src/Files/FileFormat.ts";
import { buildCatalog, type CatalogFile, catalogPage } from "./CatalogBuilder.ts";

const { values } = parseArgs({
    options: {
        data: { type: "string", default: resolve(process.cwd(), "..", "game-item-tracker-data") },
        out: { type: "string" },
        "app-url": { type: "string", default: "https://vpksoft.github.io/game-item-tracker/" },
        "repository-url": { type: "string", default: "https://github.com/VPKSoft/game-item-tracker-data" },
    },
});

/** Lists the template files below a directory, skipping hidden directories such as `.git`. */
const findTemplates = async (directory: string): Promise<string[]> => {
    const found: string[] = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
            found.push(...(await findTemplates(path)));
        } else if (entry.isFile() && entry.name.endsWith(templateExtension)) {
            found.push(path);
        }
    }
    return found;
};

const main = async () => {
    const dataDir = resolve(values.data);
    const paths = (await findTemplates(dataDir)).sort();
    const files: CatalogFile[] = [];
    for (const path of paths) {
        const content = await readFile(path);
        files.push({
            path: relative(dataDir, path).split(sep).join("/"),
            text: content.toString("utf8"),
            size: content.length,
        });
    }

    const { catalog, errors } = buildCatalog(files, new Date().toISOString());
    for (const entry of catalog.templates) {
        console.log(`ok  ${entry.path}  ${entry.name} v${entry.version} (${entry.itemCount} items)`);
    }
    if (errors.length > 0) {
        for (const error of errors) {
            console.error(`error  ${error}`);
        }
        console.error(`${errors.length} problem(s) found; nothing was written.`);
        process.exit(1);
    }

    if (values.out) {
        const outDir = resolve(values.out);
        for (const entry of catalog.templates) {
            const target = join(outDir, ...entry.path.split("/"));
            await mkdir(dirname(target), { recursive: true });
            await copyFile(join(dataDir, ...entry.path.split("/")), target);
        }
        await mkdir(outDir, { recursive: true });
        await writeFile(join(outDir, "index.json"), `${JSON.stringify(catalog, null, 2)}\n`);
        await writeFile(join(outDir, "index.html"), catalogPage(catalog, values["app-url"], values["repository-url"]));
        console.log(`Wrote ${catalog.templates.length} template(s) and index.json to ${outDir}`);
    } else {
        console.log(`${catalog.templates.length} template(s) checked.`);
    }
};

main().catch(error => {
    console.error(error);
    process.exit(1);
});
