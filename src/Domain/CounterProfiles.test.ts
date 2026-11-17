import { describe, expect, it } from "vitest";
import type { SaveItem } from "../Schemas/SaveSchema.ts";
import type { Template, TemplateItem } from "../Schemas/TemplateSchema.ts";
import { browseItems } from "./Browse.ts";
import {
    emptySaveItem,
    findRoleCounter,
    getCounterMax,
    getCounterProfile,
    getCounterValue,
    getMissing,
    getVariantCounters,
    hasVisibleCounters,
    isEditableForItem,
    setCounterValue,
} from "./Counters.ts";
import { createSave, createSaveItem } from "./CreateSave.ts";
import { suggestAmount } from "./Exchange.ts";
import { deleteCategory, deleteCounter, deleteCounterProfile, setCounterOverride } from "./TemplateEdits.ts";
import { fishTemplate } from "./TestFixtures.ts";
import { validateTemplate } from "./Validation.ts";

/**
 * The fish template with two profiles: "single" (Inventory at most 1, a hidden Target of 1) on the Rivers category,
 * which Upper rivers inherits, and "none" (every counter off) on the Bass item.
 */
const profiledTemplate = (): Template => {
    const t = fishTemplate();
    return {
        ...t,
        counterProfiles: [
            {
                key: "single",
                label: "Single",
                overrides: { inventory: { max: 1 }, target: { use: "hidden", value: 1 } },
            },
            {
                key: "none",
                label: "No counters",
                overrides: Object.fromEntries(t.counterDefs.map(c => [c.key, { use: "off" as const }])),
            },
        ],
        categories: t.categories.map(c => (c.id === "rivers" ? { ...c, counterProfile: "single" } : c)),
        items: t.items.map(i => (i.id === "bass" ? { ...i, counterProfile: "none" } : i)),
    };
};

const getItem = (t: Template, id: string) => t.items.find(i => i.id === id) as TemplateItem;
const counterDef = (t: Template, key: string) =>
    t.counterDefs.find(c => c.key === key) as NonNullable<ReturnType<typeof findRoleCounter>>;
const keys = (t: Template, variant: string, item: TemplateItem) => getVariantCounters(t, variant, item).map(c => c.key);

describe("counter profiles", () => {
    it("resolves the item's profile, then its category's, then an ancestor's", () => {
        const t = profiledTemplate();
        expect(getCounterProfile(t, getItem(t, "bass"))?.key).toBe("none");
        expect(getCounterProfile(t, getItem(t, "koi"))?.key).toBe("single");
        expect(getCounterProfile(t, getItem(t, "eel"))?.key).toBe("single");
        expect(getCounterProfile(t, { ...getItem(t, "koi"), counterProfile: "none" })?.key).toBe("none");

        const own: Template = {
            ...t,
            categories: t.categories.map(c => (c.id === "upper-rivers" ? { ...c, counterProfile: "none" } : c)),
        };
        expect(getCounterProfile(own, getItem(own, "eel"))?.key).toBe("none");
        expect(getCounterProfile(fishTemplate(), getItem(fishTemplate(), "koi"))).toBeUndefined();
    });

    it("hides counters, fixes their values and caps the maximum", () => {
        const t = profiledTemplate();
        const koi = getItem(t, "koi");
        expect(keys(t, "normal", koi)).toEqual(["inventory", "total", "tradeable"]);
        expect(keys(t, "starred", koi)).toEqual(["inventory", "placed", "total", "tradeable"]);
        expect(getVariantCounters(t, "normal").map(c => c.key)).toContain("target");

        const inventory = counterDef(t, "inventory");
        expect(getCounterMax(t, inventory, koi)).toBe(1);
        expect(isEditableForItem(t, inventory, koi)).toBe(true);
        expect(isEditableForItem(t, counterDef(t, "target"), koi)).toBe(false);

        const stored: SaveItem = { ...emptySaveItem(), counts: { normal: { inventory: 3, target: 5 } } };
        expect(getCounterValue(t, stored, "normal", "inventory", koi)).toBe(1);
        expect(getCounterValue(t, stored, "normal", "target", koi)).toBe(1);
        expect(findRoleCounter(t, "target", koi)?.key).toBe("target");
        expect(getMissing(t, koi, emptySaveItem())).toBe(2);
        expect(getMissing(t, koi, stored)).toBe(1);

        let s = setCounterValue(t, emptySaveItem(), "normal", "inventory", 5, koi);
        expect(s.counts.normal.inventory).toBe(1);
        s = setCounterValue(t, s, "normal", "target", 4, koi);
        expect(s.counts.normal.target).toBeUndefined();
    });

    it("turns counters off: no values, no roles, nothing to edit or show", () => {
        const t = profiledTemplate();
        const bass = getItem(t, "bass");
        const stored: SaveItem = { ...emptySaveItem(), counts: { normal: { inventory: 3, target: 5 } } };
        expect(keys(t, "normal", bass)).toEqual([]);
        expect(hasVisibleCounters(t, bass)).toBe(false);
        expect(hasVisibleCounters(t, getItem(t, "koi"))).toBe(true);
        expect(getCounterValue(t, stored, "normal", "inventory", bass)).toBe(0);
        expect(getCounterValue(t, stored, "normal", "total", bass)).toBe(0);
        expect(findRoleCounter(t, "owned", bass)).toBeUndefined();
        expect(getMissing(t, bass, stored)).toBeUndefined();
        expect(setCounterValue(t, stored, "normal", "inventory", 1, bass)).toBe(stored);
        expect(suggestAmount(t, bass, emptySaveItem(), "normal", "need")).toBe(0);
    });

    it("does not store defaults of counters a profile turns off or fixes", () => {
        const t = profiledTemplate();
        expect(createSaveItem(t, getItem(t, "bass")).counts).toEqual({});
        const koi = { ...getItem(t, "koi"), defaults: { inventory: 1, target: 3 } };
        expect(createSaveItem(t, koi).counts).toEqual({ normal: { inventory: 1 }, starred: { inventory: 1 } });
    });

    it("sorts items without the counter last", () => {
        const t = profiledTemplate();
        const save = createSave(t, "Mine");
        save.items.koi = { ...emptySaveItem(), counts: { normal: { tradeable: 2 } } };
        const sorted = browseItems(t, save, { sort: "counter:tradeable", direction: "asc" }).map(i => i.id);
        expect(sorted[sorted.length - 1]).toBe("bass");
        const desc = browseItems(t, save, { sort: "counter:tradeable", direction: "desc" }).map(i => i.id);
        expect(desc).toEqual(["koi", "eel", "bass"]);
    });

    it("validates profile keys and references", () => {
        const t = profiledTemplate();
        expect(validateTemplate(t)).toEqual([]);
        const broken: Template = {
            ...t,
            counterProfiles: [
                ...(t.counterProfiles ?? []),
                { key: "single", label: "Again", overrides: { nope: {}, total: { value: 1 } } },
            ],
            categories: t.categories.map(c => (c.id === "coast" ? { ...c, counterProfile: "missing" } : c)),
            items: t.items.map(i => (i.id === "koi" ? { ...i, counterProfile: "gone" } : i)),
        };
        expect(validateTemplate(broken).map(i => i.code)).toEqual(
            expect.arrayContaining([
                "duplicateCounterProfileKey",
                "profileUnknownCounter",
                "profileComputedValue",
                "categoryUnknownProfile",
                "itemUnknownProfile",
            ])
        );
    });

    it("keeps references consistent when counters, profiles and categories are deleted", () => {
        const t = profiledTemplate();
        expect(deleteCounter(t, "target").counterProfiles?.[0].overrides).toEqual({ inventory: { max: 1 } });

        const noSingle = deleteCounterProfile(t, "single");
        expect(noSingle.counterProfiles?.map(p => p.key)).toEqual(["none"]);
        expect(noSingle.categories.find(c => c.id === "rivers")).not.toHaveProperty("counterProfile");
        const noProfiles = deleteCounterProfile(noSingle, "none");
        expect(noProfiles.counterProfiles).toBeUndefined();
        expect(getItem(noProfiles, "bass")).not.toHaveProperty("counterProfile");

        const moved = deleteCategory(t, "rivers", "coast");
        expect(moved.categories.find(c => c.id === "upper-rivers")?.counterProfile).toBe("single");
    });

    it("cleans overrides when they are edited", () => {
        const profile = { key: "p", label: "P", overrides: {} };
        const hidden = setCounterOverride(profile, "target", { use: "hidden", value: 1 });
        expect(hidden.overrides).toEqual({ target: { use: "hidden", value: 1 } });
        expect(setCounterOverride(hidden, "target", { use: "off", value: 1, max: 2 }).overrides).toEqual({
            target: { use: "off" },
        });
        expect(setCounterOverride(hidden, "target", {}).overrides).toEqual({});
    });
});
