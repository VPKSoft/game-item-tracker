import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { CounterDef, Template, TemplateItem, VariantDef } from "../Schemas/TemplateSchema.ts";

/** The variant key used for items of a template that defines no variants. */
const noVariantKey = "_";

const noVariant: VariantDef = { key: noVariantKey, label: "", order: 0 };

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/**
 * Gets the variants that apply to an item, in display order.
 * A template without variant definitions yields a single anonymous variant.
 */
const getItemVariants = (template: Template, item: TemplateItem): VariantDef[] => {
    if (template.variantDefs.length === 0) {
        return [noVariant];
    }
    const sorted = [...template.variantDefs].sort(byOrder);
    if (!item.variants) {
        return sorted;
    }
    return sorted.filter(v => item.variants?.includes(v.key));
};

/** Gets a value indicating whether a counter applies to the given variant. */
const counterAppliesTo = (counter: CounterDef, variantKey: string) =>
    variantKey === noVariantKey || !counter.variants || counter.variants.includes(variantKey);

/** Gets the counters shown for a variant, in display order. */
const getVariantCounters = (template: Template, variantKey: string): CounterDef[] =>
    [...template.counterDefs].sort(byOrder).filter(c => counterAppliesTo(c, variantKey));

/** Finds the counter that has the given role, if any. */
const findRoleCounter = (template: Template, role: "owned" | "target") =>
    template.counterDefs.find(c => c.role === role);

/** Gets the value of a counter for one variant of an item. Computed counters are evaluated. */
const getCounterValue = (
    template: Template,
    saveItem: SaveItem | undefined,
    variantKey: string,
    counterKey: string
): number => {
    const def = template.counterDefs.find(c => c.key === counterKey);
    if (!def || !counterAppliesTo(def, variantKey)) {
        return 0;
    }
    if (def.kind === "manual") {
        return saveItem?.counts[variantKey]?.[counterKey] ?? 0;
    }
    let sum = 0;
    for (const key of def.sumOf ?? []) {
        const part = template.counterDefs.find(c => c.key === key);
        if (part && part.kind === "manual" && counterAppliesTo(part, variantKey)) {
            sum += saveItem?.counts[variantKey]?.[key] ?? 0;
        }
    }
    return sum;
};

/** Gets the value of a counter summed over every variant of an item. */
const getItemCounterTotal = (
    template: Template,
    item: TemplateItem,
    saveItem: SaveItem | undefined,
    counterKey: string
): number => {
    let sum = 0;
    for (const variant of getItemVariants(template, item)) {
        sum += getCounterValue(template, saveItem, variant.key, counterKey);
    }
    return sum;
};

/**
 * Gets how many items are still missing (target − owned per variant, never negative),
 * or undefined when the template does not define both roles.
 */
const getMissing = (template: Template, item: TemplateItem, saveItem: SaveItem | undefined): number | undefined => {
    const owned = findRoleCounter(template, "owned");
    const target = findRoleCounter(template, "target");
    if (!owned || !target) {
        return undefined;
    }
    let missing = 0;
    for (const variant of getItemVariants(template, item)) {
        const t = getCounterValue(template, saveItem, variant.key, target.key);
        const o = getCounterValue(template, saveItem, variant.key, owned.key);
        missing += Math.max(0, t - o);
    }
    return missing;
};

/** Clamps a value into the allowed range of a manual counter. */
const clampCounter = (def: CounterDef, value: number) => {
    let result = Number.isFinite(value) ? Math.round(value) : 0;
    result = Math.max(0, result);
    if (def.max !== undefined) {
        result = Math.min(def.max, result);
    }
    return result;
};

/** Returns a copy of the save item with one manual counter set. Computed counters are ignored. */
const setCounterValue = (
    template: Template,
    saveItem: SaveItem,
    variantKey: string,
    counterKey: string,
    value: number
): SaveItem => {
    const def = template.counterDefs.find(c => c.key === counterKey);
    if (!def || def.kind !== "manual" || !counterAppliesTo(def, variantKey)) {
        return saveItem;
    }
    return {
        ...saveItem,
        counts: {
            ...saveItem.counts,
            [variantKey]: { ...saveItem.counts[variantKey], [counterKey]: clampCounter(def, value) },
        },
    };
};

/** Creates an empty save item. */
const emptySaveItem = (): SaveItem => ({ counts: {}, notes: "", removedTags: [], customTags: [] });

/** Gets the save item for a template item, or an empty one. */
const getSaveItem = (save: Save, itemId: string): SaveItem => save.items[itemId] ?? emptySaveItem();

/** A preset of commonly used counters for a new template. */
const commonCounters = (): CounterDef[] => [
    { key: "inventory", label: "Inventory", kind: "manual", order: 0 },
    { key: "placed", label: "Placed", kind: "manual", order: 1 },
    { key: "storage", label: "Storage", kind: "manual", order: 2 },
    {
        key: "total",
        label: "Total",
        kind: "computed",
        sumOf: ["inventory", "placed", "storage"],
        role: "owned",
        order: 3,
    },
    { key: "target", label: "Target", kind: "manual", role: "target", order: 4 },
    { key: "tradeable", label: "Tradeable", kind: "manual", order: 5 },
];

export {
    clampCounter,
    commonCounters,
    counterAppliesTo,
    emptySaveItem,
    findRoleCounter,
    getCounterValue,
    getItemCounterTotal,
    getItemVariants,
    getMissing,
    getSaveItem,
    getVariantCounters,
    noVariantKey,
    setCounterValue,
};
