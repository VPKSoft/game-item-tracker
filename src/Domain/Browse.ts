import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import { findRoleCounter, getCounterValue, getItemCounterTotal, getMissing } from "./Counters.ts";
import { getEffectiveTags } from "./EffectiveTags.ts";
import type { SearchEntry } from "./Search.ts";

/**
 * A sort key:
 * - "name", "relevance", "missing"
 * - "attr:<key>" for a numeric attribute
 * - "counter:<key>" for a counter summed over variants
 * - "counter:<key>@<variant>" for one variant of a counter
 */
type SortKey = string;

type SortDirection = "asc" | "desc";

type BrowseFilters = {
    /** Only items with something missing (target − owned > 0). */
    missingOnly?: boolean;
    /** Only items where this counter (summed over variants) is above zero. */
    counterAboveZero?: string;
    /** Only items with notes. */
    withNotes?: boolean;
    /** Only items that have all of these tags. */
    tags?: string[];
};

type BrowseOptions = {
    /** The category to show; null or undefined shows all. Selecting a parent includes its children. */
    categoryId?: string | null;
    /** The ranking from the quick search, or null when there is no query. */
    searchRanks?: Map<string, number> | null;
    sort: SortKey;
    direction: SortDirection;
    filters?: BrowseFilters;
};

/** An option for the sort selector. */
type SortOption = { value: SortKey; label: string };

/** Builds the search entries for every item. */
const buildSearchEntries = (template: Template, save?: Save): SearchEntry[] =>
    template.items.map(item => {
        const saveItem = save?.items[item.id];
        return {
            id: item.id,
            name: item.name,
            description: item.description,
            tags: getEffectiveTags(item, saveItem),
            notes: saveItem?.notes ?? "",
        };
    });

/** Gets the ids of a category and all of its descendants. */
const getCategoryWithChildren = (template: Template, categoryId: string) => {
    const result = new Set<string>([categoryId]);
    let added = true;
    while (added) {
        added = false;
        for (const category of template.categories) {
            if (category.parentId && result.has(category.parentId) && !result.has(category.id)) {
                result.add(category.id);
                added = true;
            }
        }
    }
    return result;
};

/** Gets the sort options available for a template (and a save, which adds counter options). */
const getSortOptions = (template: Template, withSave: boolean, withSearch: boolean): SortOption[] => {
    const options: SortOption[] = [];
    if (withSearch) {
        options.push({ value: "relevance", label: "Relevance" });
    }
    options.push({ value: "name", label: "Name" });
    for (const attribute of template.attributeDefs) {
        options.push({ value: `attr:${attribute.key}`, label: attribute.label });
    }
    if (withSave) {
        if (findRoleCounter(template, "owned") && findRoleCounter(template, "target")) {
            options.push({ value: "missing", label: "Missing" });
        }
        const counters = [...template.counterDefs].sort((a, b) => a.order - b.order);
        for (const counter of counters) {
            options.push({ value: `counter:${counter.key}`, label: counter.label });
        }
        if (template.variantDefs.length > 0) {
            for (const counter of counters) {
                for (const variant of template.variantDefs) {
                    if (!counter.variants || counter.variants.includes(variant.key)) {
                        options.push({
                            value: `counter:${counter.key}@${variant.key}`,
                            label: `${counter.label} (${variant.label})`,
                        });
                    }
                }
            }
        }
    }
    return options;
};

const getSortValue = (
    template: Template,
    item: TemplateItem,
    saveItem: SaveItem | undefined,
    sort: SortKey,
    searchRanks: Map<string, number> | null | undefined
): number | string | undefined => {
    if (sort === "name") {
        return item.name.toLocaleLowerCase();
    }
    if (sort === "relevance") {
        return searchRanks?.get(item.id);
    }
    if (sort === "missing") {
        return getMissing(template, item, saveItem);
    }
    if (sort.startsWith("attr:")) {
        return item.attributes[sort.slice(5)];
    }
    if (sort.startsWith("counter:")) {
        const [counterKey, variantKey] = sort.slice(8).split("@");
        if (variantKey) {
            return getCounterValue(template, saveItem, variantKey, counterKey, item);
        }
        return getItemCounterTotal(template, item, saveItem, counterKey);
    }
    return undefined;
};

/** Filters and sorts the items of a template for display. */
const browseItems = (template: Template, save: Save | undefined, options: BrowseOptions): TemplateItem[] => {
    const categories =
        options.categoryId !== null && options.categoryId !== undefined
            ? getCategoryWithChildren(template, options.categoryId)
            : null;
    const filters = options.filters ?? {};

    const rows: { item: TemplateItem; value: number | string | undefined; name: string }[] = [];
    for (const item of template.items) {
        if (categories && !categories.has(item.categoryId)) {
            continue;
        }
        if (options.searchRanks && !options.searchRanks.has(item.id)) {
            continue;
        }
        const saveItem = save?.items[item.id];
        if (save && item.deprecated && !saveItem) {
            continue;
        }
        if (filters.missingOnly && !((getMissing(template, item, saveItem) ?? 0) > 0)) {
            continue;
        }
        if (
            filters.counterAboveZero &&
            !(getItemCounterTotal(template, item, saveItem, filters.counterAboveZero) > 0)
        ) {
            continue;
        }
        if (filters.withNotes && !(saveItem?.notes.trim().length ?? 0)) {
            continue;
        }
        if (filters.tags && filters.tags.length > 0) {
            const tags = getEffectiveTags(item, saveItem);
            if (!filters.tags.every(t => tags.includes(t))) {
                continue;
            }
        }
        rows.push({
            item,
            value: getSortValue(template, item, saveItem, options.sort, options.searchRanks),
            name: item.name.toLocaleLowerCase(),
        });
    }

    // Relevance is always best-first; the direction toggle does not invert it.
    const factor = options.direction === "desc" && options.sort !== "relevance" ? -1 : 1;
    rows.sort((a, b) => {
        // Missing values always go last, regardless of direction.
        if (a.value === undefined && b.value !== undefined) {
            return 1;
        }
        if (b.value === undefined && a.value !== undefined) {
            return -1;
        }
        if (a.value !== undefined && b.value !== undefined && a.value !== b.value) {
            if (typeof a.value === "string" || typeof b.value === "string") {
                return String(a.value).localeCompare(String(b.value)) * factor;
            }
            return (a.value - b.value) * factor;
        }
        // Stable tie-breaker: name ascending, then id.
        return a.name.localeCompare(b.name) || a.item.id.localeCompare(b.item.id);
    });
    return rows.map(r => r.item);
};

export type { BrowseFilters, BrowseOptions, SortDirection, SortKey, SortOption };
export { browseItems, buildSearchEntries, getCategoryWithChildren, getSortOptions };
