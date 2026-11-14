import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import {
    findRoleCounter,
    getCounterValue,
    getItemVariants,
    isObtained,
    isVariantUnique,
    noVariantKey,
} from "./Counters.ts";

/** Whether the user offers an item or looks for it. */
type ExchangeMode = "give" | "need";

/**
 * One line of an exchange list: an amount of one variant of an item to give or to get.
 * Exchange lists are never stored; they live in memory while the app is open.
 */
type ExchangeEntry = {
    itemId: string;
    variantKey: string;
    mode: ExchangeMode;
    amount: number;
};

/**
 * Where the suggested give amount comes from: `"surplus"` = owned − target (owned when the template has no
 * target counter), otherwise the key of a counter whose value is used as such (e.g. a *Tradeable* counter).
 */
type GiveSource = "surplus" | string;

/** The modes in image and panel order. */
const exchangeModes: ExchangeMode[] = ["give", "need"];

/** Gets a key that identifies an entry within a list (one entry per mode, item and variant). */
const getEntryKey = (entry: Pick<ExchangeEntry, "itemId" | "variantKey" | "mode">) =>
    `${entry.mode}|${entry.itemId}|${entry.variantKey}`;

/** Gets a value indicating whether a variant of an item can be added with the mode. Unique variants can only be needed. */
const canExchange = (item: TemplateItem, variantKey: string, mode: ExchangeMode) =>
    mode === "need" || !isVariantUnique(item, variantKey);

/** Normalizes an amount to a whole number of at least 1. */
const normalizeAmount = (amount: number) => (Number.isFinite(amount) ? Math.max(1, Math.round(amount)) : 1);

/**
 * Suggests the amount of a variant to give or to ask for, based on the user's counters.
 * Need = target − owned. Give = owned − target or the value of the chosen counter.
 * A unique variant is needed once while it is not obtained and is never given. Never negative.
 */
const suggestAmount = (
    template: Template,
    item: TemplateItem,
    saveItem: SaveItem | undefined,
    variantKey: string,
    mode: ExchangeMode,
    giveSource: GiveSource = "surplus"
): number => {
    if (isVariantUnique(item, variantKey)) {
        return mode === "need" && !isObtained(saveItem, variantKey) ? 1 : 0;
    }
    const owned = findRoleCounter(template, "owned");
    const target = findRoleCounter(template, "target");
    const value = (counterKey: string | undefined) =>
        counterKey ? getCounterValue(template, saveItem, variantKey, counterKey, item) : 0;
    if (mode === "need") {
        return owned && target ? Math.max(0, value(target.key) - value(owned.key)) : 0;
    }
    if (giveSource !== "surplus") {
        return Math.max(0, value(giveSource));
    }
    return owned ? Math.max(0, value(owned.key) - value(target?.key)) : 0;
};

/** Returns a copy of the list with the entry added (amount ≥ 1) or, when it already exists, removed. */
const toggleEntry = (entries: ExchangeEntry[], entry: ExchangeEntry): ExchangeEntry[] => {
    const key = getEntryKey(entry);
    return entries.some(e => getEntryKey(e) === key)
        ? entries.filter(e => getEntryKey(e) !== key)
        : [...entries, { ...entry, amount: normalizeAmount(entry.amount) }];
};

/** Returns a copy of the list with the amount of one entry changed (at least 1). */
const setEntryAmount = (entries: ExchangeEntry[], key: string, amount: number): ExchangeEntry[] =>
    entries.map(e => (getEntryKey(e) === key ? { ...e, amount: normalizeAmount(amount) } : e));

/** Returns a copy of the list without the entry. */
const removeEntry = (entries: ExchangeEntry[], key: string): ExchangeEntry[] =>
    entries.filter(e => getEntryKey(e) !== key);

/**
 * Adds an entry for every variant of the given items whose suggested amount is above zero.
 * Existing entries are kept as they are.
 * @returns the new list and the number of entries added.
 */
const addSuggestedEntries = (
    entries: ExchangeEntry[],
    template: Template,
    save: Save,
    items: TemplateItem[],
    mode: ExchangeMode,
    giveSource: GiveSource = "surplus"
): { entries: ExchangeEntry[]; added: number } => {
    const existing = new Set(entries.map(getEntryKey));
    const result = [...entries];
    for (const item of items) {
        if (item.deprecated && !save.items[item.id]) {
            continue;
        }
        for (const variant of getItemVariants(template, item)) {
            if (!canExchange(item, variant.key, mode)) {
                continue;
            }
            const entry: ExchangeEntry = { itemId: item.id, variantKey: variant.key, mode, amount: 0 };
            if (existing.has(getEntryKey(entry))) {
                continue;
            }
            const amount = suggestAmount(template, item, save.items[item.id], variant.key, mode, giveSource);
            if (amount > 0) {
                result.push({ ...entry, amount });
            }
        }
    }
    return { entries: result, added: result.length - entries.length };
};

/**
 * Drops entries that no longer fit the template: the item or its variant is gone, or the variant
 * became unique while it was offered. Returns the same array when nothing changes.
 */
const pruneEntries = (template: Template, entries: ExchangeEntry[]): ExchangeEntry[] => {
    const items = new Map(template.items.map(i => [i.id, i]));
    const pruned = entries.filter(e => {
        const item = items.get(e.itemId);
        return (
            !!item &&
            getItemVariants(template, item).some(v => v.key === e.variantKey) &&
            canExchange(item, e.variantKey, e.mode)
        );
    });
    return pruned.length === entries.length ? entries : pruned;
};

/**
 * Groups entries by item id. Arrays of items whose entries did not change are taken from `previous`,
 * so memoized item cards only re-render when their own entries change.
 */
const groupEntriesByItem = (
    entries: ExchangeEntry[],
    previous?: ReadonlyMap<string, ExchangeEntry[]>
): Map<string, ExchangeEntry[]> => {
    const groups = new Map<string, ExchangeEntry[]>();
    for (const entry of entries) {
        const group = groups.get(entry.itemId);
        if (group) {
            group.push(entry);
        } else {
            groups.set(entry.itemId, [entry]);
        }
    }
    if (previous) {
        for (const [itemId, group] of groups) {
            const old = previous.get(itemId);
            if (old && old.length === group.length && old.every((e, i) => e === group[i])) {
                groups.set(itemId, old);
            }
        }
    }
    return groups;
};

/** One square of the exchange image. */
type ExchangeTile = {
    key: string;
    name: string;
    /** The variant label; empty for items without variants. */
    variantLabel: string;
    amount: number;
    /** The image data URL, when the item has an image. */
    image?: string;
};

/** Converts entries into image tiles, by mode, in list order. Entries of unknown items are skipped. */
const buildExchangeTiles = (template: Template, entries: ExchangeEntry[]): Record<ExchangeMode, ExchangeTile[]> => {
    const items = new Map(template.items.map(i => [i.id, i]));
    const variants = new Map(template.variantDefs.map(v => [v.key, v.label]));
    const result: Record<ExchangeMode, ExchangeTile[]> = { give: [], need: [] };
    for (const entry of entries) {
        const item = items.get(entry.itemId);
        if (!item) {
            continue;
        }
        result[entry.mode].push({
            key: getEntryKey(entry),
            name: item.name,
            variantLabel: entry.variantKey === noVariantKey ? "" : (variants.get(entry.variantKey) ?? entry.variantKey),
            amount: entry.amount,
            image: item.imageId ? template.images[item.imageId] : undefined,
        });
    }
    return result;
};

/** A rectangle in logical (unscaled) image pixels. */
type Rect = { x: number; y: number; width: number; height: number };

/** The sizes of the exchange image, in logical pixels. */
const exchangeImageMetrics = {
    tileSize: 100,
    gap: 8,
    padding: 16,
    titleHeight: 34,
    headingHeight: 30,
    sectionGap: 14,
    minAutoColumns: 3,
    maxAutoColumns: 8,
} as const;

/** The position of everything drawn into the exchange image. */
type ExchangeImageLayout = {
    width: number;
    height: number;
    columns: number;
    title?: Rect;
    sections: { mode: ExchangeMode; heading: Rect; tiles: Rect[] }[];
};

/** Gets the number of columns used when the user has not chosen one: the larger section, within 3–8. */
const getAutoColumns = (counts: Record<ExchangeMode, number>) =>
    Math.min(
        exchangeImageMetrics.maxAutoColumns,
        Math.max(exchangeImageMetrics.minAutoColumns, counts.give, counts.need)
    );

/**
 * Lays out the exchange image: an optional title, then a heading and a tile grid for each mode that has
 * entries (give first). `columns` undefined = automatic.
 */
const layoutExchangeImage = (
    counts: Record<ExchangeMode, number>,
    options: { columns?: number; hasTitle: boolean }
): ExchangeImageLayout => {
    const { tileSize, gap, padding, titleHeight, headingHeight, sectionGap } = exchangeImageMetrics;
    const columns = Math.max(1, Math.round(options.columns ?? getAutoColumns(counts)));
    const contentWidth = columns * tileSize + (columns - 1) * gap;
    let y = padding;
    let title: Rect | undefined;
    if (options.hasTitle) {
        title = { x: padding, y, width: contentWidth, height: titleHeight };
        y += titleHeight;
    }
    const sections: ExchangeImageLayout["sections"] = [];
    for (const mode of exchangeModes) {
        const count = counts[mode];
        if (count <= 0) {
            continue;
        }
        if (sections.length > 0) {
            y += sectionGap;
        }
        const heading = { x: padding, y, width: contentWidth, height: headingHeight };
        y += headingHeight;
        const tiles: Rect[] = [];
        for (let i = 0; i < count; i++) {
            const row = Math.floor(i / columns);
            const column = i % columns;
            tiles.push({
                x: padding + column * (tileSize + gap),
                y: y + row * (tileSize + gap),
                width: tileSize,
                height: tileSize,
            });
        }
        const rows = Math.ceil(count / columns);
        y += rows * tileSize + (rows - 1) * gap;
        sections.push({ mode, heading, tiles });
    }
    return { width: contentWidth + padding * 2, height: y + padding, columns, title, sections };
};

export type { ExchangeEntry, ExchangeImageLayout, ExchangeMode, ExchangeTile, GiveSource, Rect };
export {
    addSuggestedEntries,
    buildExchangeTiles,
    canExchange,
    exchangeImageMetrics,
    exchangeModes,
    getAutoColumns,
    getEntryKey,
    groupEntriesByItem,
    layoutExchangeImage,
    pruneEntries,
    removeEntry,
    setEntryAmount,
    suggestAmount,
    toggleEntry,
};
