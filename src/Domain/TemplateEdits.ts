import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import { bumpVersion } from "./Ids.ts";

/** Marks the template as changed now. */
const touch = (template: Template): Template => ({ ...template, updatedAt: new Date().toISOString() });

/** Replaces or adds an item (matched by id). */
const upsertItem = (template: Template, item: TemplateItem): Template => {
    const index = template.items.findIndex(i => i.id === item.id);
    const items = [...template.items];
    if (index >= 0) {
        items[index] = item;
    } else {
        items.push(item);
    }
    const tags = [...template.tags];
    for (const tag of item.tags) {
        if (!tags.includes(tag)) {
            tags.push(tag);
        }
    }
    return pruneImages(touch({ ...template, items, tags }));
};

/** Removes an item. */
const deleteItem = (template: Template, itemId: string): Template =>
    pruneImages(touch({ ...template, items: template.items.filter(i => i.id !== itemId) }));

/** Stores an image (keyed by its content hash) in the template. */
const addImage = (template: Template, imageId: string, dataUrl: string): Template => ({
    ...template,
    images: { ...template.images, [imageId]: dataUrl },
});

/** Removes images that no item uses any more. */
const pruneImages = (template: Template): Template => {
    const used = new Set(template.items.map(i => i.imageId).filter(Boolean));
    const unused = Object.keys(template.images).filter(id => !used.has(id));
    if (unused.length === 0) {
        return template;
    }
    const images = { ...template.images };
    for (const id of unused) {
        delete images[id];
    }
    return { ...template, images };
};

/** Deletes a category, moving its items and child categories to another category. */
const deleteCategory = (template: Template, categoryId: string, moveTo: string): Template =>
    touch({
        ...template,
        categories: template.categories
            .filter(c => c.id !== categoryId)
            .map(c => (c.parentId === categoryId ? { ...c, parentId: undefined } : c)),
        items: template.items.map(i => (i.categoryId === categoryId ? { ...i, categoryId: moveTo } : i)),
    });

/** Deletes a counter and every reference to it (sums and item defaults). */
const deleteCounter = (template: Template, key: string): Template =>
    touch({
        ...template,
        counterDefs: template.counterDefs
            .filter(c => c.key !== key)
            .map(c => (c.sumOf?.includes(key) ? { ...c, sumOf: c.sumOf.filter(k => k !== key) } : c)),
        items: template.items.map(i => {
            if (!i.defaults || !(key in i.defaults)) {
                return i;
            }
            const { [key]: _removed, ...defaults } = i.defaults;
            return { ...i, defaults };
        }),
    });

/** Deletes a variant and every reference to it. */
const deleteVariant = (template: Template, key: string): Template =>
    touch({
        ...template,
        variantDefs: template.variantDefs.filter(v => v.key !== key),
        counterDefs: template.counterDefs.map(c => {
            if (!c.variants?.includes(key)) {
                return c;
            }
            const variants = c.variants.filter(v => v !== key);
            return { ...c, variants: variants.length > 0 ? variants : undefined };
        }),
        items: template.items.map(i => {
            if (!i.variants?.includes(key)) {
                return i;
            }
            const variants = i.variants.filter(v => v !== key);
            return { ...i, variants: variants.length > 0 ? variants : undefined };
        }),
    });

/** Deletes an attribute definition and its values. */
const deleteAttribute = (template: Template, key: string): Template =>
    touch({
        ...template,
        attributeDefs: template.attributeDefs.filter(a => a.key !== key),
        items: template.items.map(i => {
            if (!(key in i.attributes)) {
                return i;
            }
            const { [key]: _removed, ...attributes } = i.attributes;
            return { ...i, attributes };
        }),
    });

/** Renames a tag everywhere. Renaming to an existing tag merges the two. */
const renameTag = (template: Template, from: string, to: string): Template => {
    const target = to.trim();
    if (target.length === 0 || target === from) {
        return template;
    }
    const replace = (tags: string[]) => [...new Set(tags.map(t => (t === from ? target : t)))];
    return touch({
        ...template,
        tags: replace(template.tags),
        items: template.items.map(i => ({ ...i, tags: replace(i.tags) })),
    });
};

/** Deletes a tag from the vocabulary and every item. */
const deleteTag = (template: Template, tag: string): Template =>
    touch({
        ...template,
        tags: template.tags.filter(t => t !== tag),
        items: template.items.map(i => (i.tags.includes(tag) ? { ...i, tags: i.tags.filter(t => t !== tag) } : i)),
    });

/** Moves an element of an ordered list up or down and renumbers the orders. */
const moveOrdered = <T extends { order: number }>(list: T[], index: number, delta: -1 | 1): T[] => {
    const sorted = [...list].sort((a, b) => a.order - b.order);
    const target = index + delta;
    if (target < 0 || target >= sorted.length) {
        return sorted;
    }
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    return sorted.map((entry, order) => ({ ...entry, order }));
};

/** Creates a copy of the template with a bumped version. */
const newVersion = (template: Template, part: "major" | "minor" | "patch"): Template =>
    touch({ ...template, version: bumpVersion(template.version, part) });

/** Counts how many items use each tag. */
const countTags = (template: Template) => {
    const counts = new Map<string, number>(template.tags.map(t => [t, 0]));
    for (const item of template.items) {
        for (const tag of item.tags) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
    }
    return counts;
};

export {
    addImage,
    countTags,
    deleteAttribute,
    deleteCategory,
    deleteCounter,
    deleteItem,
    deleteTag,
    deleteVariant,
    moveOrdered,
    newVersion,
    pruneImages,
    renameTag,
    touch,
    upsertItem,
};
