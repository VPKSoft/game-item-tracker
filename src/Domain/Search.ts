import Fuse, { type IFuseOptions } from "fuse.js";

/** The text content of an item that the quick search looks at. */
type SearchEntry = {
    id: string;
    name: string;
    description: string;
    tags: string[];
    notes: string;
};

const fuseOptions: IFuseOptions<SearchEntry> = {
    keys: [
        { name: "name", weight: 3 },
        { name: "tags", weight: 2 },
        { name: "description", weight: 1 },
        { name: "notes", weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 1,
};

/** A built search index. */
type SearchIndex = {
    fuse: Fuse<SearchEntry>;
};

/** Builds a fuzzy search index over the entries. Rebuild only when item text changes. */
const buildSearchIndex = (entries: SearchEntry[]): SearchIndex => ({
    fuse: new Fuse(entries, fuseOptions),
});

/**
 * Searches the index. Returns a map of item id to rank (0 = best match),
 * or null when the query is empty (meaning "everything matches").
 */
const searchItems = (index: SearchIndex, query: string): Map<string, number> | null => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
        return null;
    }
    const result = new Map<string, number>();
    const hits = index.fuse.search(trimmed);
    for (let i = 0; i < hits.length; i++) {
        result.set(hits[i].item.id, i);
    }
    return result;
};

export type { SearchEntry, SearchIndex };
export { buildSearchIndex, searchItems };
