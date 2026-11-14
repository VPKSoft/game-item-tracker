import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { createSaveItem } from "./CreateSave.ts";

/** What changes when a save is upgraded to a newer template version. */
type UpgradeSummary = {
    fromVersion: string;
    toVersion: string;
    addedItems: string[];
    /** Items deleted from the template in this version. They stay in the save, marked as removed. */
    removedItems: string[];
    /** Items with user data that are deprecated in the new template. */
    deprecatedItems: string[];
    addedCounters: string[];
    removedCounters: string[];
    addedVariants: string[];
    removedVariants: string[];
    /** For each removed counter: the number of items that have a stored value above zero for it. */
    removedCounterData: Record<string, number>;
    /** For each removed variant: the number of items that have amounts above zero or obtained marks for it. */
    removedVariantData: Record<string, number>;
};

type UpgradeOptions = {
    /** Remove stored values of counters and variants that the new template no longer has. */
    discardHidden?: boolean;
};

/** Whether the save item holds anything the user entered (notes, tags, obtained marks or amounts above zero). */
const hasUserData = (saveItem: SaveItem) =>
    saveItem.notes.length > 0 ||
    saveItem.customTags.length > 0 ||
    saveItem.removedTags.length > 0 ||
    (saveItem.obtained?.length ?? 0) > 0 ||
    Object.values(saveItem.counts).some(c => Object.values(c).some(v => v > 0));

/** Counts the save items for which `test` is true. */
const countItems = (save: Save, test: (saveItem: SaveItem) => boolean) => Object.values(save.items).filter(test).length;

/**
 * Upgrades a save to a newer version of its template. User data is never lost unless
 * `discardHidden` is set, in which case only values of removed counters and variants are dropped.
 * Items deleted from the template are never dropped: they are kept and marked with `orphan`
 * until the user removes them with {@link removeSaveItems}.
 */
const upgradeSave = (
    save: Save,
    oldTemplate: Template | undefined,
    newTemplate: Template,
    options: UpgradeOptions = {}
): { save: Save; summary: UpgradeSummary } => {
    if (save.template.templateId !== newTemplate.templateId) {
        throw new Error("The save belongs to a different template");
    }

    const oldCounters = new Set(oldTemplate?.counterDefs.map(c => c.key) ?? []);
    const newCounters = new Set(newTemplate.counterDefs.map(c => c.key));
    const oldVariants = new Set(oldTemplate?.variantDefs.map(v => v.key) ?? []);
    const newVariants = new Set(newTemplate.variantDefs.map(v => v.key));

    const removedCounters = [...oldCounters].filter(k => !newCounters.has(k));
    const removedVariants = [...oldVariants].filter(k => !newVariants.has(k));
    const summary: UpgradeSummary = {
        fromVersion: save.template.version,
        toVersion: newTemplate.version,
        addedItems: [],
        removedItems: [],
        deprecatedItems: [],
        addedCounters: oldTemplate ? [...newCounters].filter(k => !oldCounters.has(k)) : [],
        removedCounters,
        addedVariants: oldTemplate ? [...newVariants].filter(k => !oldVariants.has(k)) : [],
        removedVariants,
        removedCounterData: Object.fromEntries(
            removedCounters.map(key => [
                key,
                countItems(save, s => !s.orphan && Object.values(s.counts).some(values => (values[key] ?? 0) > 0)),
            ])
        ),
        removedVariantData: Object.fromEntries(
            removedVariants.map(key => [
                key,
                countItems(
                    save,
                    s =>
                        !s.orphan &&
                        (Object.values(s.counts[key] ?? {}).some(v => v > 0) || (s.obtained ?? []).includes(key))
                ),
            ])
        ),
    };

    const items: Save["items"] = {};
    const newItems = new Map(newTemplate.items.map(i => [i.id, i]));
    const manualKeys = new Set(newTemplate.counterDefs.filter(c => c.kind === "manual").map(c => c.key));

    for (const [id, saveItem] of Object.entries(save.items)) {
        const item = newItems.get(id);
        let next: SaveItem = { ...saveItem };
        if (!item) {
            // Deleted from the template: keep the entry so the user can see it and remove it on purpose.
            if (!saveItem.orphan) {
                summary.removedItems.push(id);
                const oldName = oldTemplate?.items.find(i => i.id === id)?.name;
                next = { ...next, orphan: { name: oldName ?? id, removedIn: newTemplate.version } };
            }
        } else if (item.deprecated) {
            if (!hasUserData(saveItem)) {
                continue;
            }
            summary.deprecatedItems.push(id);
            next = { ...next, orphan: undefined };
        } else if (next.orphan) {
            next = { ...next, orphan: undefined };
        }

        // Removed items keep everything until the user removes them.
        if (options.discardHidden && !next.orphan) {
            const counts: SaveItem["counts"] = {};
            for (const [variant, values] of Object.entries(next.counts)) {
                if (variant !== "_" && !newVariants.has(variant)) {
                    continue;
                }
                counts[variant] = Object.fromEntries(Object.entries(values).filter(([k]) => manualKeys.has(k)));
            }
            next = { ...next, counts };
            if (next.obtained) {
                const obtained = next.obtained.filter(k => k === "_" || newVariants.has(k));
                const { obtained: _old, ...rest } = next;
                next = obtained.length > 0 ? { ...rest, obtained } : rest;
            }
        }

        // Fill defaults for counters or variants that are new in this version.
        if (item && !item.deprecated) {
            const initial = createSaveItem(newTemplate, item);
            for (const [variant, values] of Object.entries(initial.counts)) {
                for (const [key, value] of Object.entries(values)) {
                    const isNewCounter = summary.addedCounters.includes(key);
                    const isNewVariant = summary.addedVariants.includes(variant);
                    if ((isNewCounter || isNewVariant) && next.counts[variant]?.[key] === undefined) {
                        next = {
                            ...next,
                            counts: { ...next.counts, [variant]: { ...next.counts[variant], [key]: value } },
                        };
                    }
                }
            }
        }

        if (next.orphan === undefined) {
            delete next.orphan;
        }
        items[id] = next;
    }

    for (const item of newTemplate.items) {
        if (!item.deprecated && !(item.id in items)) {
            items[item.id] = createSaveItem(newTemplate, item);
            summary.addedItems.push(item.id);
        }
    }

    return {
        save: {
            ...save,
            template: {
                templateId: newTemplate.templateId,
                version: newTemplate.version,
                name: newTemplate.name,
                game: newTemplate.game,
            },
            updatedAt: new Date().toISOString(),
            items,
        },
        summary,
    };
};

/** Removes the given items from a save, e.g. items the user dropped after they were deleted from the template. */
const removeSaveItems = (save: Save, itemIds: string[]): Save => {
    const remove = new Set(itemIds);
    return {
        ...save,
        updatedAt: new Date().toISOString(),
        items: Object.fromEntries(Object.entries(save.items).filter(([id]) => !remove.has(id))),
    };
};

/** The ids of save items that were deleted from the template (marked with `orphan`). */
const getRemovedItemIds = (save: Save) =>
    Object.entries(save.items)
        .filter(([, s]) => s.orphan)
        .map(([id]) => id);

export type { UpgradeOptions, UpgradeSummary };
export { getRemovedItemIds, hasUserData, removeSaveItems, upgradeSave };
