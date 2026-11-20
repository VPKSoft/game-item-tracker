import { describe, expect, it } from "vitest";
import type { Save } from "../Schemas/SaveSchema.ts";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { setCounterValue } from "./Counters.ts";
import { createSave } from "./CreateSave.ts";
import {
    clearGathered,
    getMaterialNeeds,
    getPlannedAmount,
    hasMaterialsList,
    isMaterialComplete,
    setGathered,
} from "./Materials.ts";
import { deleteMaterial, pruneImages, upsertMaterial } from "./TemplateEdits.ts";
import { fishTemplate } from "./TestFixtures.ts";
import { upgradeSave } from "./UpgradeSave.ts";
import { validateTemplate } from "./Validation.ts";

/** The fish fixture as a crafting template: a planned counter and two materials. */
const craftTemplate = (): Template => {
    const t = fishTemplate();
    return {
        ...t,
        counterDefs: [
            ...t.counterDefs,
            { key: "to-make", label: "To make", kind: "manual", role: "planned", order: 5 },
        ],
        materials: [
            { id: "salt", name: "Salt", order: 1 },
            { id: "wood", name: "Wood", order: 0, imageId: "wood-image" },
        ],
        images: { "wood-image": "data:image/webp;base64,AAAA" },
        items: t.items.map(i =>
            i.id === "bass"
                ? { ...i, materials: { wood: 2, salt: 1 } }
                : i.id === "koi"
                  ? { ...i, materials: { wood: 3 } }
                  : i
        ),
    };
};

/** Sets the planned amount of an item (a variant) in a save. */
const plan = (template: Template, save: Save, itemId: string, variant: string, value: number): Save => ({
    ...save,
    items: {
        ...save.items,
        [itemId]: setCounterValue(template, save.items[itemId], variant, "to-make", value),
    },
});

describe("materials list", () => {
    it("multiplies each item's materials by its planned amount over all variants", () => {
        const t = craftTemplate();
        let save = createSave(t, "s");
        expect(getMaterialNeeds(t, save)).toEqual([]);
        save = plan(t, save, "bass", "normal", 2);
        save = plan(t, save, "bass", "starred", 1);
        save = plan(t, save, "koi", "normal", 1);
        expect(getPlannedAmount(t, t.items[0], save)).toBe(3);
        const needs = getMaterialNeeds(t, save);
        expect(needs.map(n => [n.material.id, n.needed, n.gathered])).toEqual([
            ["wood", 3 * 2 + 1 * 3, 0],
            ["salt", 3, 0],
        ]);
        expect(needs[0].uses.map(u => [u.item.id, u.planned, u.perItem])).toEqual([
            ["bass", 3, 2],
            ["koi", 1, 3],
        ]);
    });

    it("stores gathered amounts in the save and tells when there is enough", () => {
        const t = craftTemplate();
        let save = plan(t, createSave(t, "s"), "bass", "normal", 2);
        save = setGathered(save, "wood", 3);
        save = setGathered(save, "salt", 5);
        let [wood, salt] = getMaterialNeeds(t, save);
        expect([wood.gathered, isMaterialComplete(wood)]).toEqual([3, false]);
        expect([salt.gathered, isMaterialComplete(salt)]).toEqual([5, true]);
        save = setGathered(save, "wood", 4.4);
        [wood] = getMaterialNeeds(t, save);
        expect(isMaterialComplete(wood)).toBe(true);
        expect(setGathered(save, "salt", -3).gathered).toEqual({ wood: 4 });
        expect(clearGathered(save).gathered).toBeUndefined();
        // A gathered material stays listed after nothing needs it any more.
        const unplanned = plan(t, save, "bass", "normal", 0);
        expect(getMaterialNeeds(t, unplanned).map(n => [n.material.id, n.needed])).toEqual([
            ["wood", 0],
            ["salt", 0],
        ]);
    });

    it("is available only with materials and a planned counter", () => {
        const t = craftTemplate();
        expect(hasMaterialsList(t)).toBe(true);
        expect(hasMaterialsList(fishTemplate())).toBe(false);
        expect(hasMaterialsList({ ...t, counterDefs: t.counterDefs.filter(c => c.role !== "planned") })).toBe(false);
    });

    it("ignores the planned amount of a counter that the item's profile turns off", () => {
        const t: Template = {
            ...craftTemplate(),
            counterProfiles: [{ key: "none", label: "None", overrides: { "to-make": { use: "off" } } }],
        };
        t.items = t.items.map(i => (i.id === "koi" ? { ...i, counterProfile: "none" } : i));
        const save = plan(t, plan(t, createSave(t, "s"), "koi", "normal", 5), "bass", "normal", 1);
        expect(getMaterialNeeds(t, save).map(n => [n.material.id, n.needed])).toEqual([
            ["wood", 2],
            ["salt", 1],
        ]);
    });
});

describe("material edits, validation and upgrades", () => {
    it("deletes a material from the items and drops its unused image", () => {
        const t = deleteMaterial(craftTemplate(), "wood");
        expect(t.materials?.map(m => m.id)).toEqual(["salt"]);
        expect(t.items.find(i => i.id === "bass")?.materials).toEqual({ salt: 1 });
        expect(t.items.find(i => i.id === "koi")?.materials).toBeUndefined();
        expect(t.images).toEqual({});
        expect(deleteMaterial(t, "salt").materials).toBeUndefined();
    });

    it("keeps images that materials use", () => {
        const t = craftTemplate();
        expect(pruneImages(t).images).toEqual(t.images);
        const renamed = upsertMaterial(t, { id: "salt", name: "Sea salt", order: 1 });
        expect(renamed.materials?.find(m => m.id === "salt")?.name).toBe("Sea salt");
        expect(upsertMaterial(t, { id: "iron", name: "Iron", order: 2 }).materials).toHaveLength(3);
    });

    it("reports unknown materials, missing images, duplicates and a second planned counter", () => {
        const t = craftTemplate();
        expect(validateTemplate(t)).toEqual([]);
        const broken: Template = {
            ...t,
            materials: [...(t.materials ?? []), { id: "salt", name: "Salt again", order: 2, imageId: "gone" }],
            counterDefs: t.counterDefs.map(c => (c.key === "tradeable" ? { ...c, role: "planned" } : c)),
            items: t.items.map(i => (i.id === "eel" ? { ...i, materials: { stone: 1 } } : i)),
        };
        expect(validateTemplate(broken).map(i => i.message)).toEqual(
            expect.arrayContaining([
                'Duplicate material id "salt"',
                'Material "Salt again" refers to a missing image',
                'Item "Albino Eel" needs unknown material "stone"',
                'Only one counter can have the role "planned"',
            ])
        );
    });

    it("keeps gathered amounts on upgrade, dropping removed materials only with discardHidden", () => {
        const t = craftTemplate();
        const save = setGathered(setGathered(createSave(t, "s"), "wood", 4), "salt", 2);
        const next = { ...deleteMaterial(t, "salt"), version: "1.1.0" };
        expect(upgradeSave(save, t, next).save.gathered).toEqual({ wood: 4, salt: 2 });
        expect(upgradeSave(save, t, next, { discardHidden: true }).save.gathered).toEqual({ wood: 4 });
        const empty = { ...deleteMaterial(deleteMaterial(t, "salt"), "wood"), version: "1.1.0" };
        expect(upgradeSave(save, t, empty, { discardHidden: true }).save.gathered).toBeUndefined();
    });
});
