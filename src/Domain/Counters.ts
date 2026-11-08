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

/**
 * Gets a value indicating whether a variant of an item is unique: it is only obtained or not,
 * and its counters are not used.
 */
const isVariantUnique = (item: TemplateItem | undefined, variantKey: string) =>
    item?.unique === true || (Array.isArray(item?.unique) && item.unique.includes(variantKey));

/** Gets a value indicating whether any variant of an item is unique. */
const hasUniqueVariants = (template: Template, item: TemplateItem) =>
    getItemVariants(template, item).some(v => isVariantUnique(item, v.key));

/** Gets a value indicating whether the user has obtained a unique variant of an item. */
const isObtained = (saveItem: SaveItem | undefined, variantKey: string) =>
    saveItem?.obtained?.includes(variantKey) ?? false;

/** Returns a copy of the save item with a unique variant marked obtained or not obtained. */
const setObtained = (saveItem: SaveItem, variantKey: string, obtained: boolean): SaveItem => {
    const others = (saveItem.obtained ?? []).filter(k => k !== variantKey);
    const next = obtained ? [...others, variantKey] : others;
    const { obtained: _old, ...rest } = saveItem;
    return next.length > 0 ? { ...rest, obtained: next } : rest;
};

/**
 * Gets the value of a counter for one variant of an item. Computed counters are evaluated.
 * For a unique variant (when the item is given) the owned counter is 1 when obtained, the
 * target counter is 1 and every other counter is 0.
 */
const getCounterValue = (
    template: Template,
    saveItem: SaveItem | undefined,
    variantKey: string,
    counterKey: string,
    item?: TemplateItem
): number => {
    const def = template.counterDefs.find(c => c.key === counterKey);
    if (!def || !counterAppliesTo(def, variantKey)) {
        return 0;
    }
    if (isVariantUnique(item, variantKey)) {
        if (def.role === "owned") {
            return isObtained(saveItem, variantKey) ? 1 : 0;
        }
        return def.role === "target" ? 1 : 0;
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
        sum += getCounterValue(template, saveItem, variant.key, counterKey, item);
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
        const t = getCounterValue(template, saveItem, variant.key, target.key, item);
        const o = getCounterValue(template, saveItem, variant.key, owned.key, item);
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

/** The keys of the {@link commonCounters} preset. */
type CommonCounterKey = "inventory" | "placed" | "storage" | "total" | "target" | "tradeable";

/** The English labels of the {@link commonCounters} preset. */
const commonCounterLabels: Record<CommonCounterKey, string> = {
    inventory: "Inventory",
    placed: "Placed",
    storage: "Storage",
    total: "Total",
    target: "Target",
    tradeable: "Tradeable",
};

/** A preset of commonly used counters for a new template, labeled in the given (UI) language. */
const commonCounters = (labels: Record<CommonCounterKey, string> = commonCounterLabels): CounterDef[] => [
    { key: "inventory", label: labels.inventory, kind: "manual", order: 0 },
    { key: "placed", label: labels.placed, kind: "manual", order: 1 },
    { key: "storage", label: labels.storage, kind: "manual", order: 2 },
    {
        key: "total",
        label: labels.total,
        kind: "computed",
        sumOf: ["inventory", "placed", "storage"],
        role: "owned",
        order: 3,
    },
    { key: "target", label: labels.target, kind: "manual", role: "target", order: 4 },
    { key: "tradeable", label: labels.tradeable, kind: "manual", order: 5 },
];

export type { CommonCounterKey };
export {
    clampCounter,
    commonCounterLabels,
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
    hasUniqueVariants,
    isObtained,
    isVariantUnique,
    noVariantKey,
    setCounterValue,
    setObtained,
};
