import type { Save } from "../Schemas/SaveSchema.ts";
import type { CounterDef, Template } from "../Schemas/TemplateSchema.ts";
import {
    counterAppliesTo,
    getItemVariants,
    getSaveItem,
    isEditableCounter,
    isEditableForItem,
    isRequirementUnmet,
    isVariantUnique,
    setCounterValue,
} from "./Counters.ts";

/** The result of setting one counter for many items. */
type BulkCounterResult = {
    /** The updated save; the same object when nothing changed. */
    save: Save;
    /** Ids of the items whose counter was set for at least one variant. */
    changed: string[];
    /** Ids of the selected items that were left unchanged (counter not used, turned off, fixed, locked or unique). */
    skipped: string[];
};

/** The counters that can be set for many items at once: the editable manual counters, in order. */
const getBulkCounters = (template: Template): CounterDef[] =>
    template.counterDefs.filter(isEditableCounter).sort((a, b) => a.order - b.order);

/** The template's variants that a counter applies to, in order. Empty for a template without variants. */
const getBulkVariants = (template: Template, counter: CounterDef) =>
    [...template.variantDefs].sort((a, b) => a.order - b.order).filter(v => counterAppliesTo(counter, v.key));

/**
 * Sets a manual counter to one value for many items. With `variantKey`, only that variant is set; otherwise every
 * variant of each item the counter applies to. The value is clamped to each item's maximum. Variants are skipped when
 * they are unique, when the item's counter profile turns the counter off or fixes it, or when its requirement is unmet.
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
        if (!def || !item || !isEditableForItem(template, def, item)) {
            skipped.push(itemId);
            continue;
        }
        const original = getSaveItem(save, itemId);
        let saveItem = original;
        let set = false;
        for (const variant of getItemVariants(template, item)) {
            if (
                (variantKey !== undefined && variant.key !== variantKey) ||
                !counterAppliesTo(def, variant.key) ||
                isVariantUnique(item, variant.key) ||
                isRequirementUnmet(template, def, saveItem, variant.key, item)
            ) {
                continue;
            }
            saveItem = setCounterValue(template, saveItem, variant.key, counterKey, value, item);
            set = true;
        }
        if (!set) {
            skipped.push(itemId);
            continue;
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

export type { BulkCounterResult };
export { getBulkCounters, getBulkVariants, setCounterForItems };
