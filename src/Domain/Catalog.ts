import type { CatalogEntry } from "../Schemas/CatalogSchema.ts";
import { compareVersions } from "./Ids.ts";

/**
 * How an online template relates to the templates in the library:
 * `new` = no version of it is stored; `installed` = this version is stored;
 * `update` = it is newer than every stored version; `older` = a newer version is stored.
 */
type CatalogStatus = "new" | "installed" | "update" | "older";

/** Compares an online template with the stored template versions. */
const getCatalogStatus = (
    entry: Pick<CatalogEntry, "templateId" | "version">,
    stored: readonly { templateId: string; version: string }[]
): CatalogStatus => {
    const versions = stored.filter(s => s.templateId === entry.templateId).map(s => s.version);
    if (versions.length === 0) {
        return "new";
    }
    if (versions.includes(entry.version)) {
        return "installed";
    }
    const newest = versions.sort((a, b) => compareVersions(b, a))[0];
    return compareVersions(entry.version, newest) > 0 ? "update" : "older";
};

/** Filters catalog entries by a case-insensitive text in the name, game or description; sorts by game, then name. */
const filterCatalog = (entries: readonly CatalogEntry[], query: string) => {
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return entries
        .filter(entry => {
            const text = `${entry.game} ${entry.name} ${entry.description ?? ""}`.toLocaleLowerCase();
            return words.every(word => text.includes(word));
        })
        .sort((a, b) => a.game.localeCompare(b.game) || a.name.localeCompare(b.name));
};

/** The URL of a catalog file: its path segments are URL-encoded and resolved against the catalog URL. */
const catalogFileUrl = (catalogUrl: string, path: string) =>
    new URL(path.split("/").map(encodeURIComponent).join("/"), catalogUrl).toString();

export type { CatalogStatus };
export { catalogFileUrl, filterCatalog, getCatalogStatus };
