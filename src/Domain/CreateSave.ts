import { type Save, type SaveItem, saveFormat, saveSchemaVersion } from "../Schemas/SaveSchema.ts";
import { type Template, type TemplateItem, templateFormat, templateSchemaVersion } from "../Schemas/TemplateSchema.ts";
import { counterAppliesTo, getItemVariants } from "./Counters.ts";
import { newUuid } from "./Ids.ts";

/** Creates the initial save item for a template item, applying the item's default counter values. */
const createSaveItem = (template: Template, item: TemplateItem): SaveItem => {
    const counts: SaveItem["counts"] = {};
    for (const [key, value] of Object.entries(item.defaults ?? {})) {
        const def = template.counterDefs.find(c => c.key === key && c.kind === "manual");
        if (!def) {
            continue;
        }
        for (const variant of getItemVariants(template, item)) {
            if (counterAppliesTo(def, variant.key)) {
                counts[variant.key] = { ...counts[variant.key], [key]: value };
            }
        }
    }
    return { counts, notes: "", removedTags: [], customTags: [] };
};

/** Creates a new save populated from the template. */
const createSave = (template: Template, name: string): Save => {
    const items: Save["items"] = {};
    for (const item of template.items) {
        if (!item.deprecated) {
            items[item.id] = createSaveItem(template, item);
        }
    }
    return {
        format: saveFormat,
        schemaVersion: saveSchemaVersion,
        saveId: newUuid(),
        name,
        template: {
            templateId: template.templateId,
            version: template.version,
            name: template.name,
            game: template.game,
        },
        updatedAt: new Date().toISOString(),
        items,
    };
};

/** Creates a new, empty template. */
const createTemplate = (name: string, game: string): Template => ({
    format: templateFormat,
    schemaVersion: templateSchemaVersion,
    templateId: newUuid(),
    version: "1.0.0",
    game,
    name,
    updatedAt: new Date().toISOString(),
    attributeDefs: [],
    counterDefs: [],
    variantDefs: [],
    tags: [],
    categories: [],
    items: [],
    images: {},
});

export { createSave, createSaveItem, createTemplate };
