import type { SaveItem } from "../Schemas/SaveSchema.ts";
import type { TemplateItem } from "../Schemas/TemplateSchema.ts";

/** Gets the tags of an item as the user sees them: template tags minus removed ones plus custom ones. */
const getEffectiveTags = (item: TemplateItem, saveItem: SaveItem | undefined): string[] => {
    if (!saveItem) {
        return [...item.tags];
    }
    const result = item.tags.filter(t => !saveItem.removedTags.includes(t));
    for (const tag of saveItem.customTags) {
        if (!result.includes(tag)) {
            result.push(tag);
        }
    }
    return result;
};

/**
 * Returns a copy of the save item so that its effective tags equal the given list.
 * Template tags missing from the list become removed tags; extra tags become custom tags.
 */
const setEffectiveTags = (item: TemplateItem, saveItem: SaveItem, tags: string[]): SaveItem => {
    const unique = [...new Set(tags.map(t => t.trim()).filter(t => t.length > 0))];
    return {
        ...saveItem,
        removedTags: item.tags.filter(t => !unique.includes(t)),
        customTags: unique.filter(t => !item.tags.includes(t)),
    };
};

export { getEffectiveTags, setEffectiveTags };
