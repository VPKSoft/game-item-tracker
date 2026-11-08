import * as React from "react";
import { buildSearchEntries } from "../Domain/Browse.ts";
import { buildSearchIndex, type SearchEntry, type SearchIndex } from "../Domain/Search.ts";
import type { Save } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";

const sameText = (a: SearchEntry[], b: SearchEntry[]) => {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (
            x.id !== y.id ||
            x.name !== y.name ||
            x.description !== y.description ||
            x.notes !== y.notes ||
            x.tags.length !== y.tags.length ||
            x.tags.some((t, j) => t !== y.tags[j])
        ) {
            return false;
        }
    }
    return true;
};

/**
 * Builds the Fuse index for the items. The index is rebuilt only when searchable text changes,
 * so changing a counter does not re-index thousands of items.
 */
const useSearchIndex = (template: Template, save: Save | undefined): SearchIndex => {
    const previous = React.useRef<{ entries: SearchEntry[]; index: SearchIndex } | null>(null);
    return React.useMemo(() => {
        const entries = buildSearchEntries(template, save);
        if (previous.current && sameText(previous.current.entries, entries)) {
            return previous.current.index;
        }
        const index = buildSearchIndex(entries);
        previous.current = { entries, index };
        return index;
    }, [template, save]);
};

export { useSearchIndex };
