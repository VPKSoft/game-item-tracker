import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type {
    CounterDef,
    CounterOverride,
    CounterProfile,
    CounterRole,
    Template,
    TemplateItem,
    VariantDef,
} from "../Schemas/TemplateSchema.ts";

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

/** Category id -> the key of the counter profile it has or inherits (undefined = none), per template. */
const categoryProfileCache = new WeakMap<Template, Map<string, string | undefined>>();

/** Gets the key of the counter profile a category has or inherits from its nearest ancestor with one. */
const getCategoryProfileKey = (template: Template, categoryId: string): string | undefined => {
    let cache = categoryProfileCache.get(template);
    if (!cache) {
        cache = new Map();
        categoryProfileCache.set(template, cache);
    }
    if (cache.has(categoryId)) {
        return cache.get(categoryId);
    }
    let key: string | undefined;
    const seen = new Set<string>();
    let category = template.categories.find(c => c.id === categoryId);
    while (category && !seen.has(category.id)) {
        if (category.counterProfile !== undefined) {
            key = category.counterProfile;
            break;
        }
        seen.add(category.id);
        const parentId = category.parentId;
        category = parentId === undefined ? undefined : template.categories.find(c => c.id === parentId);
    }
    cache.set(categoryId, key);
    return key;
};

/**
 * Gets the counter profile in effect for an item: its own, else the one its category has or inherits.
 * Undefined when there is none or the key is unknown.
 */
const getCounterProfile = (template: Template, item: TemplateItem | undefined): CounterProfile | undefined => {
    if (!item || !template.counterProfiles?.length) {
        return undefined;
    }
    const key = item.counterProfile ?? getCategoryProfileKey(template, item.categoryId);
    return key === undefined ? undefined : template.counterProfiles.find(p => p.key === key);
};

/** Gets the override of a counter for an item from the item's counter profile, if any. */
const getCounterOverride = (
    template: Template,
    def: CounterDef,
    item: TemplateItem | undefined
): CounterOverride | undefined => getCounterProfile(template, item)?.overrides[def.key];

/** Gets a value indicating whether a counter is turned off for an item by its counter profile. */
const isCounterOff = (template: Template, def: CounterDef, item: TemplateItem | undefined) =>
    getCounterOverride(template, def, item)?.use === "off";

/** Gets a value indicating whether a counter is shown for an item: neither hidden nor turned off by its profile. */
const isCounterVisible = (template: Template, def: CounterDef, item: TemplateItem | undefined) =>
    getCounterOverride(template, def, item)?.use === undefined;

/**
 * Gets the counters shown for a variant, in display order. With the item, the counters its counter profile hides
 * or turns off are left out.
 */
const getVariantCounters = (template: Template, variantKey: string, item?: TemplateItem): CounterDef[] =>
    [...template.counterDefs]
        .sort(byOrder)
        .filter(c => counterAppliesTo(c, variantKey) && (!item || isCounterVisible(template, c, item)));

/** Gets a value indicating whether an item shows any counter in a save (unique variants not counted). */
const hasVisibleCounters = (template: Template, item: TemplateItem) =>
    getItemVariants(template, item).some(v => getVariantCounters(template, v.key, item).length > 0);

/** Finds the counter that has the given role, if any. With the item, a counter turned off for it is not returned. */
const findRoleCounter = (template: Template, role: CounterRole, item?: TemplateItem) => {
    const def = template.counterDefs.find(c => c.role === role);
    return def && item && isCounterOff(template, def, item) ? undefined : def;
};

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

/** Gets a value indicating whether the user can change a counter in a save: a manual counter that is not read-only. */
const isEditableCounter = (def: CounterDef) => def.kind === "manual" && !def.readOnly;

/**
 * Gets a value indicating whether the user can change a counter of an item: an editable counter that the item's
 * counter profile neither turns off nor gives a fixed value.
 */
const isEditableForItem = (template: Template, def: CounterDef, item: TemplateItem | undefined) => {
    if (!isEditableCounter(def)) {
        return false;
    }
    const override = getCounterOverride(template, def, item);
    return override?.use !== "off" && override?.value === undefined;
};

/**
 * Gets a value indicating whether a counter `requires` another counter that is 0 for the variant: the counter is
 * then locked (cannot be changed) and counts as 0. The required counter is a manual counter without a requirement of
 * its own (validated), so this does not recurse further.
 */
const isRequirementUnmet = (
    template: Template,
    def: CounterDef,
    saveItem: SaveItem | undefined,
    variantKey: string,
    item: TemplateItem | undefined
): boolean => {
    if (def.requires === undefined) {
        return false;
    }
    const required = template.counterDefs.find(c => c.key === def.requires);
    if (!required || required.kind !== "manual" || required.requires !== undefined) {
        return false;
    }
    if (!counterAppliesTo(required, variantKey) || isCounterOff(template, required, item)) {
        return true;
    }
    return getManualValue(template, required, saveItem, variantKey, item) <= 0;
};

/**
 * Gets the value of a manual counter: 0 when the item's counter profile turns it off, the profile's fixed value,
 * the item's default for a read-only counter, or else the stored one (at most the profile's maximum).
 */
const getManualValue = (
    template: Template,
    def: CounterDef,
    saveItem: SaveItem | undefined,
    variantKey: string,
    item: TemplateItem | undefined
) => {
    const override = getCounterOverride(template, def, item);
    if (override?.use === "off") {
        return 0;
    }
    if (override?.value !== undefined) {
        return override.value;
    }
    if (def.readOnly) {
        return item?.defaults?.[def.key] ?? 0;
    }
    if (isRequirementUnmet(template, def, saveItem, variantKey, item)) {
        return 0;
    }
    const stored = saveItem?.counts[variantKey]?.[def.key] ?? 0;
    return override?.max === undefined ? stored : Math.min(stored, override.max);
};

/**
 * Gets the value of a counter for one variant of an item. Computed counters are evaluated.
 * For a unique variant (when the item is given) the owned counter is 1 when obtained, the
 * target counter is 1 and every other counter is 0. A read-only counter has the item's default
 * value, so the item must be given for it.
 */
const getCounterValue = (
    template: Template,
    saveItem: SaveItem | undefined,
    variantKey: string,
    counterKey: string,
    item?: TemplateItem
): number => {
    const def = template.counterDefs.find(c => c.key === counterKey);
    if (!def || !counterAppliesTo(def, variantKey) || isCounterOff(template, def, item)) {
        return 0;
    }
    if (isVariantUnique(item, variantKey)) {
        if (def.role === "owned") {
            return isObtained(saveItem, variantKey) ? 1 : 0;
        }
        return def.role === "target" ? 1 : 0;
    }
    if (def.kind === "manual") {
        return getManualValue(template, def, saveItem, variantKey, item);
    }
    let sum = 0;
    for (const key of def.sumOf ?? []) {
        const part = template.counterDefs.find(c => c.key === key);
        if (part && part.kind === "manual" && counterAppliesTo(part, variantKey)) {
            sum += getManualValue(template, part, saveItem, variantKey, item);
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
    const owned = findRoleCounter(template, "owned", item);
    const target = findRoleCounter(template, "target", item);
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

/**
 * Gets the maximum of a manual counter for an item: the `max` of the item's counter profile, the item's value of the
 * `maxFrom` counter, or the fixed `max`. Undefined when there is no limit, or when `maxFrom` is set but the item is
 * not given.
 */
const getCounterMax = (template: Template, def: CounterDef, item?: TemplateItem): number | undefined => {
    const override = getCounterOverride(template, def, item);
    if (override?.max !== undefined) {
        return override.max;
    }
    if (def.maxFrom === undefined) {
        return def.max;
    }
    const source = template.counterDefs.find(c => c.key === def.maxFrom);
    return source && item ? getManualValue(template, source, undefined, noVariantKey, item) : undefined;
};

/** Clamps a value into the allowed range of a manual counter (`max` is the counter's maximum, if any). */
const clampCounter = (def: CounterDef, value: number, max = def.max) => {
    let result = Number.isFinite(value) ? Math.round(value) : 0;
    result = Math.max(0, result);
    if (max !== undefined) {
        result = Math.min(max, result);
    }
    return result;
};

/**
 * Returns a copy of the save item with one manual counter set. Computed and read-only counters are ignored, and so
 * are counters that the item's counter profile turns off or fixes. The item is needed to apply the profile and a
 * `maxFrom` maximum.
 */
const setCounterValue = (
    template: Template,
    saveItem: SaveItem,
    variantKey: string,
    counterKey: string,
    value: number,
    item?: TemplateItem
): SaveItem => {
    const def = template.counterDefs.find(c => c.key === counterKey);
    if (
        !def ||
        !isEditableForItem(template, def, item) ||
        !counterAppliesTo(def, variantKey) ||
        isRequirementUnmet(template, def, saveItem, variantKey, item)
    ) {
        return saveItem;
    }
    return {
        ...saveItem,
        counts: {
            ...saveItem.counts,
            [variantKey]: {
                ...saveItem.counts[variantKey],
                [counterKey]: clampCounter(def, value, getCounterMax(template, def, item)),
            },
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
    getCategoryProfileKey,
    getCounterMax,
    getCounterOverride,
    getCounterProfile,
    getCounterValue,
    getItemCounterTotal,
    getItemVariants,
    getMissing,
    getSaveItem,
    getVariantCounters,
    hasUniqueVariants,
    hasVisibleCounters,
    isCounterOff,
    isCounterVisible,
    isEditableCounter,
    isEditableForItem,
    isObtained,
    isRequirementUnmet,
    isVariantUnique,
    noVariantKey,
    setCounterValue,
    setObtained,
};
