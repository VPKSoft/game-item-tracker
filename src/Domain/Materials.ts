import type { Save } from "../Schemas/SaveSchema.ts";
import type { Material, Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import { findRoleCounter, getItemCounterTotal } from "./Counters.ts";

/** One item that needs a material: how many of the item are planned and how much of the material one needs. */
type MaterialUse = {
    item: TemplateItem;
    planned: number;
    perItem: number;
};

/** A row of the materials list: the total needed for the planned items and the amount gathered. */
type MaterialNeed = {
    material: Material;
    needed: number;
    gathered: number;
    uses: MaterialUse[];
};

/** Gets the materials of a template in display order. */
const getMaterials = (template: Template): Material[] =>
    [...(template.materials ?? [])].sort((a, b) => a.order - b.order);

/**
 * Gets a value indicating whether the template supports the materials list: it has materials and a counter
 * with the `planned` role.
 */
const hasMaterialsList = (template: Template) =>
    (template.materials?.length ?? 0) > 0 && !!findRoleCounter(template, "planned");

/** Gets how many of an item are planned in a save (the `planned` counter summed over the item's variants). */
const getPlannedAmount = (template: Template, item: TemplateItem, save: Save | undefined) => {
    const planned = findRoleCounter(template, "planned", item);
    return planned ? getItemCounterTotal(template, item, save?.items[item.id], planned.key) : 0;
};

/** Gets how many of a material the user has gathered. */
const getGathered = (save: Save, materialId: string) => save.gathered?.[materialId] ?? 0;

/**
 * Builds the materials list of a save: for each material, the amount the planned items need
 * (Σ planned × amount per item) and the amount gathered. Materials that are neither needed nor gathered
 * are left out. Deprecated items count while they are planned.
 */
const getMaterialNeeds = (template: Template, save: Save): MaterialNeed[] => {
    const needs = new Map<string, MaterialNeed>(
        getMaterials(template).map(material => [
            material.id,
            { material, needed: 0, gathered: getGathered(save, material.id), uses: [] },
        ])
    );
    for (const item of template.items) {
        if (!item.materials) {
            continue;
        }
        const planned = getPlannedAmount(template, item, save);
        if (planned <= 0) {
            continue;
        }
        for (const [materialId, perItem] of Object.entries(item.materials)) {
            const need = needs.get(materialId);
            if (need && perItem > 0) {
                need.needed += planned * perItem;
                need.uses.push({ item, planned, perItem });
            }
        }
    }
    return [...needs.values()].filter(n => n.needed > 0 || n.gathered > 0);
};

/** Gets a value indicating whether enough of a material has been gathered for the planned items. */
const isMaterialComplete = (need: MaterialNeed) => need.gathered >= need.needed;

/** Returns a copy of the save with the gathered amount of one material set (a whole number, at least 0). */
const setGathered = (save: Save, materialId: string, value: number): Save => {
    const amount = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    const { [materialId]: _old, ...rest } = save.gathered ?? {};
    const gathered = amount > 0 ? { ...rest, [materialId]: amount } : rest;
    const { gathered: _previous, ...withoutGathered } = save;
    return {
        ...withoutGathered,
        updatedAt: new Date().toISOString(),
        ...(Object.keys(gathered).length > 0 ? { gathered } : {}),
    };
};

/** Returns a copy of the save with the gathered amounts of the given materials (or all of them) set to 0. */
const clearGathered = (save: Save, materialIds?: string[]): Save => {
    let result = save;
    for (const id of materialIds ?? Object.keys(save.gathered ?? {})) {
        result = setGathered(result, id, 0);
    }
    return result === save ? save : { ...result, updatedAt: new Date().toISOString() };
};

export type { MaterialNeed, MaterialUse };
export {
    clearGathered,
    getGathered,
    getMaterialNeeds,
    getMaterials,
    getPlannedAmount,
    hasMaterialsList,
    isMaterialComplete,
    setGathered,
};
