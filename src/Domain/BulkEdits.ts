import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { CounterDef, Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import {
    counterAppliesTo,
    getCounterMax,
    getItemVariants,
    getSaveItem,
    isCounterVisible,
    isEditableCounter,
    isEditableForItem,
    isRequirementUnmet,
    isVariantUnique,
    setCounterValue,
} from "./Counters.ts";

/** Which selected items a bulk counter edit sets and which it leaves unchanged. */
type BulkTargets = {
    /** Ids of the items whose counter is set for at least one variant. */
    changed: string[];
    /** Ids of the selected items left unchanged (counter not used, hidden, off, fixed, locked or unique). */
    skipped: string[];
};

/** The result of setting one counter for many items. */
type BulkCounterResult = BulkTargets & {
    /** The updated save; the same object when nothing changed. */
    save: Save;
};

/** The counters that can be set for many items at once: the editable manual counters, in order. */
const getBulkCounters = (template: Template): CounterDef[] =>
    template.counterDefs.filter(isEditableCounter).sort((a, b) => a.order - b.order);

/** The template's variants that a counter applies to, in order. Empty for a template without variants. */
const getBulkVariants = (template: Template, counter: CounterDef) =>
    [...template.variantDefs].sort((a, b) => a.order - b.order).filter(v => counterAppliesTo(counter, v.key));

/**
 * The variant keys of an item that a bulk edit of a counter sets. Only counters the item shows and the user can
 * change: none when the item's counter profile hides, turns off or fixes the counter. With `variantKey`, only that
 * variant; unique variants, variants the counter does not apply to and locked variants (unmet requirement) are left out.
 */
const getTargetVariants = (
    template: Template,
    def: CounterDef,
    item: TemplateItem,
    saveItem: SaveItem,
    variantKey?: string
): string[] => {
    if (!isEditableForItem(template, def, item) || !isCounterVisible(template, def, item)) {
        return [];
    }
    return getItemVariants(template, item)
        .map(v => v.key)
        .filter(
            key =>
                (variantKey === undefined || key === variantKey) &&
                counterAppliesTo(def, key) &&
                !isVariantUnique(item, key) &&
                !isRequirementUnmet(template, def, saveItem, key, item)
        );
};

/** Splits the selected items into those a bulk edit of the counter changes and those it skips. */
const getBulkTargets = (
    template: Template,
    save: Save,
    itemIds: Iterable<string>,
    counterKey: string,
    variantKey?: string
): BulkTargets => {
    const def = template.counterDefs.find(c => c.key === counterKey);
    const itemsById = new Map(template.items.map(i => [i.id, i]));
    const changed: string[] = [];
    const skipped: string[] = [];
    for (const itemId of itemIds) {
        const item = itemsById.get(itemId);
        const set =
            def && item && getTargetVariants(template, def, item, getSaveItem(save, itemId), variantKey).length > 0;
        (set ? changed : skipped).push(itemId);
    }
    return { changed, skipped };
};

/**
 * The maximum a bulk edit can give the counter in the items: the highest effective maximum of the items (counter
 * profile `max`, `maxFrom` or `max`), or undefined when any item has no limit (or no item is given).
 */
const getBulkMax = (template: Template, itemIds: Iterable<string>, counterKey: string): number | undefined => {
    const def = template.counterDefs.find(c => c.key === counterKey);
    const itemsById = new Map(template.items.map(i => [i.id, i]));
    let result: number | undefined;
    for (const itemId of itemIds) {
        const max = def ? getCounterMax(template, def, itemsById.get(itemId)) : undefined;
        if (max === undefined) {
            return undefined;
        }
        result = Math.max(result ?? 0, max);
    }
    return result;
};

/**
 * Sets a manual counter to one value for many items. With `variantKey`, only that variant is set; otherwise every
 * variant of each item the counter applies to. The value is clamped to each item's maximum (including a counter
 * profile's `max`). Items are skipped when their counter profile hides, turns off or fixes the counter; variants when
 * they are unique or their requirement is unmet.
 */
const setCounterForItems = (
    template: Template,
    save: Save,
    itemIds: Iterable<string>,
    counterKey: string,
    value: number,
    variantKey?: string
): BulkCounterResult => {
    const def = template.counterDefs.find(c => c.key === counterKey);
    const itemsById = new Map(template.items.map(i => [i.id, i]));
    const changed: string[] = [];
    const skipped: string[] = [];
    let items: Save["items"] | undefined;
    for (const itemId of itemIds) {
        const item = itemsById.get(itemId);
        let saveItem = getSaveItem(save, itemId);
        const variants = def && item ? getTargetVariants(template, def, item, saveItem, variantKey) : [];
        if (variants.length === 0) {
            skipped.push(itemId);
            continue;
        }
        for (const key of variants) {
            saveItem = setCounterValue(template, saveItem, key, counterKey, value, item);
        }
        changed.push(itemId);
        items ??= { ...save.items };
        items[itemId] = saveItem;
    }
    return {
        save: items ? { ...save, updatedAt: new Date().toISOString(), items } : save,
        changed,
        skipped,
    };
};

export type { BulkCounterResult, BulkTargets };
export { getBulkCounters, getBulkMax, getBulkTargets, getBulkVariants, setCounterForItems };
