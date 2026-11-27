import type { Save, SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { getSaveItem } from "./Counters.ts";

/**
 * The category selector value of the virtual *Hidden* category of a save. Real category ids match
 * `/^[a-z0-9][a-z0-9_-]*$/i`, so this value can never collide with one.
 */
const hiddenCategoryId = "@hidden";

/** Whether the user has hidden the item in their save. */
const isItemHidden = (saveItem: SaveItem | undefined) => saveItem?.hidden === true;

/** Hides or shows an item. The field is removed when the item is shown, to keep files small. */
const setItemHidden = (saveItem: SaveItem, hidden: boolean): SaveItem => {
    if (isItemHidden(saveItem) === hidden) {
        return saveItem;
    }
    if (hidden) {
        return { ...saveItem, hidden: true };
    }
    const { hidden: _hidden, ...rest } = saveItem;
    return rest;
};

/**
 * Hides or shows the given items of a save. Items the template does not have are ignored. Returns the ids that
 * changed; without changes the same save object is returned (no autosave).
 */
const setHiddenForItems = (
    template: Template,
    save: Save,
    itemIds: Iterable<string>,
    hidden: boolean
): { save: Save; changed: string[] } => {
    const known = new Set(template.items.map(i => i.id));
    const items = { ...save.items };
    const changed: string[] = [];
    for (const id of itemIds) {
        if (!known.has(id)) {
            continue;
        }
        const current = getSaveItem(save, id);
        const next = setItemHidden(current, hidden);
        if (next !== current) {
            items[id] = next;
            changed.push(id);
        }
    }
    if (changed.length === 0) {
        return { save, changed };
    }
    return { save: { ...save, updatedAt: new Date().toISOString(), items }, changed };
};

/** The number of template items the user has hidden in the save. */
const countHiddenItems = (template: Template, save: Save) =>
    template.items.filter(item => isItemHidden(save.items[item.id])).length;

export { countHiddenItems, hiddenCategoryId, isItemHidden, setHiddenForItems, setItemHidden };
