import { describe, expect, it } from "vitest";
import type { SaveItem } from "../Schemas/SaveSchema.ts";
import {
    clampCounter,
    emptySaveItem,
    getCounterMax,
    getCounterValue,
    getItemCounters,
    getItemCounterTotal,
    getItemVariants,
    getMissing,
    getVariantCounters,
    hasUniqueVariants,
    isEditableCounter,
    isObtained,
    isRequirementUnmet,
    isVariantUnique,
    noVariantKey,
    setCounterValue,
    setObtained,
} from "./Counters.ts";
import { createSaveItem, createTemplate } from "./CreateSave.ts";
import { fishTemplate } from "./TestFixtures.ts";

const saveItemWith = (counts: SaveItem["counts"]): SaveItem => ({ ...emptySaveItem(), counts });

describe("variants", () => {
    it("returns all template variants when the item does not restrict them", () => {
        const t = fishTemplate();
        expect(getItemVariants(t, t.items[0]).map(v => v.key)).toEqual(["normal", "starred"]);
    });

    it("returns only the item's variants when restricted", () => {
        const t = fishTemplate();
        expect(getItemVariants(t, t.items[2]).map(v => v.key)).toEqual(["normal"]);
    });

    it("returns a single anonymous variant when the template has none", () => {
        const t = { ...fishTemplate(), variantDefs: [] };
        expect(getItemVariants(t, t.items[0]).map(v => v.key)).toEqual([noVariantKey]);
    });

    it("limits counters to their variants", () => {
        const t = fishTemplate();
        expect(getVariantCounters(t, "normal").map(c => c.key)).not.toContain("placed");
        expect(getVariantCounters(t, "starred").map(c => c.key)).toContain("placed");
    });
});

describe("counter values", () => {
    it("computes a sum of manual counters", () => {
        const t = fishTemplate();
        const s = saveItemWith({ starred: { inventory: 2, placed: 3 } });
        expect(getCounterValue(t, s, "starred", "total")).toBe(5);
    });

    it("ignores summed counters that do not apply to the variant", () => {
        const t = fishTemplate();
        // A stray "placed" value on the normal variant must not count.
        const s = saveItemWith({ normal: { inventory: 2, placed: 3 } });
        expect(getCounterValue(t, s, "normal", "total")).toBe(2);
        expect(getCounterValue(t, s, "normal", "placed")).toBe(0);
    });

    it("sums a counter over all variants of an item", () => {
        const t = fishTemplate();
        const s = saveItemWith({ normal: { inventory: 3 }, starred: { inventory: 1, placed: 2 } });
        expect(getItemCounterTotal(t, t.items[0], s, "total")).toBe(6);
        expect(getItemCounterTotal(t, t.items[0], s, "inventory")).toBe(4);
    });

    it("treats a missing save item and unknown counters as zero", () => {
        const t = fishTemplate();
        expect(getCounterValue(t, undefined, "normal", "inventory")).toBe(0);
        expect(getCounterValue(t, emptySaveItem(), "normal", "nope")).toBe(0);
    });

    it("computes missing per variant and never negative", () => {
        const t = fishTemplate();
        const s = saveItemWith({ normal: { target: 3, inventory: 1 }, starred: { target: 1, inventory: 5 } });
        expect(getMissing(t, t.items[0], s)).toBe(2);
    });

    it("returns undefined for missing when roles are not defined", () => {
        const t = { ...fishTemplate(), counterDefs: fishTemplate().counterDefs.map(c => ({ ...c, role: undefined })) };
        expect(getMissing(t, t.items[0], emptySaveItem())).toBeUndefined();
    });

    it("handles a template without any counters", () => {
        const t = createTemplate("Empty", "Game");
        const item = { ...fishTemplate().items[0] };
        expect(getMissing(t, item, undefined)).toBeUndefined();
        expect(getItemCounterTotal(t, item, undefined, "total")).toBe(0);
    });
});

describe("setting counters", () => {
    it("sets a manual counter immutably", () => {
        const t = fishTemplate();
        const before = emptySaveItem();
        const after = setCounterValue(t, before, "normal", "inventory", 4);
        expect(after.counts.normal.inventory).toBe(4);
        expect(before.counts).toEqual({});
    });

    it("does not set computed counters or counters outside their variants", () => {
        const t = fishTemplate();
        const s = emptySaveItem();
        expect(setCounterValue(t, s, "normal", "total", 4)).toBe(s);
        expect(setCounterValue(t, s, "normal", "placed", 4)).toBe(s);
    });

    it("clamps to non-negative integers and the maximum", () => {
        const def = fishTemplate().counterDefs[4];
        expect(clampCounter(def, -3)).toBe(0);
        expect(clampCounter(def, 2.6)).toBe(3);
        expect(clampCounter(def, 1000)).toBe(99);
        expect(clampCounter(def, Number.NaN)).toBe(0);
    });
});

describe("read-only counters", () => {
    /** A bundle-like template: the target is read-only and comes from the item's defaults. */
    const bundleTemplate = () => {
        const t = createTemplate("Bundles", "Game");
        t.counterDefs = [
            { key: "placed", label: "Placed", kind: "manual", order: 0 },
            { key: "total", label: "Total", kind: "computed", sumOf: ["placed", "target"], role: "owned", order: 1 },
            { key: "target", label: "Target", kind: "manual", role: "target", readOnly: true, order: 2 },
        ];
        t.categories = [{ id: "spooky", name: "Spooky Bundle", order: 0 }];
        t.items = [
            {
                id: "apple",
                categoryId: "spooky",
                name: "Apple",
                description: "",
                attributes: {},
                tags: [],
                defaults: { target: 20 },
            },
        ];
        return t;
    };

    it("reads the value from the item's defaults, whatever the save holds", () => {
        const t = bundleTemplate();
        const item = t.items[0];
        const s = saveItemWith({ [noVariantKey]: { placed: 5, target: 3 } });
        expect(getCounterValue(t, s, noVariantKey, "target", item)).toBe(20);
        expect(getCounterValue(t, s, noVariantKey, "total", item)).toBe(25);
        expect(getMissing(t, item, saveItemWith({ [noVariantKey]: { placed: 5 } }))).toBe(0);
        t.counterDefs[1].sumOf = ["placed"];
        expect(getMissing(t, item, saveItemWith({ [noVariantKey]: { placed: 5 } }))).toBe(15);
        expect(getCounterValue(t, s, noVariantKey, "target", { ...item, defaults: undefined })).toBe(0);
    });

    it("cannot be set and is not stored in new save items", () => {
        const t = bundleTemplate();
        const s = emptySaveItem();
        expect(setCounterValue(t, s, noVariantKey, "target", 4)).toBe(s);
        expect(isEditableCounter(t.counterDefs[2])).toBe(false);
        expect(isEditableCounter(t.counterDefs[0])).toBe(true);
        expect(createSaveItem(t, t.items[0]).counts).toEqual({});
    });

    it("limits a counter to the item's value of its maxFrom counter", () => {
        const t = bundleTemplate();
        t.counterDefs[0].maxFrom = "target";
        const item = t.items[0];
        expect(getCounterMax(t, t.counterDefs[0], item)).toBe(20);
        expect(getCounterMax(t, t.counterDefs[0])).toBeUndefined();
        expect(getCounterMax(t, t.counterDefs[2], item)).toBeUndefined();
        const s = emptySaveItem();
        expect(setCounterValue(t, s, noVariantKey, "placed", 25, item).counts[noVariantKey].placed).toBe(20);
        expect(setCounterValue(t, s, noVariantKey, "placed", 7, item).counts[noVariantKey].placed).toBe(7);
        expect(
            setCounterValue(t, s, noVariantKey, "placed", 3, { ...item, defaults: { target: 1 } }).counts[noVariantKey]
                .placed
        ).toBe(1);
    });
});

describe("counters summed across variants", () => {
    const template = () => {
        const t = fishTemplate();
        t.counterDefs.push({
            key: "all",
            label: "All",
            kind: "computed",
            sumOf: ["inventory", "placed"],
            acrossVariants: true,
            order: 9,
        });
        return t;
    };

    it("sums over every variant of the item", () => {
        const t = template();
        const s = saveItemWith({ normal: { inventory: 2 }, starred: { inventory: 1, placed: 4 } });
        expect(getItemCounterTotal(t, t.items[0], s, "all")).toBe(7);
        // Each variant's share.
        expect(getCounterValue(t, s, "starred", "all")).toBe(5);
    });

    it("is shown once per item instead of in each variant row", () => {
        const t = template();
        expect(getVariantCounters(t, "normal").map(c => c.key)).not.toContain("all");
        expect(getItemCounters(t, t.items[0]).map(c => c.key)).toEqual(["all"]);
    });

    it("is shown in the row of an item when the template has no variants", () => {
        const t = { ...template(), variantDefs: [] };
        expect(getVariantCounters(t, noVariantKey).map(c => c.key)).toContain("all");
        expect(getItemCounters(t, t.items[0])).toEqual([]);
    });
});

describe("unique items", () => {
    const uniqueStarred = () => {
        const t = fishTemplate();
        const koi = { ...t.items[1], unique: ["starred"] };
        return { t: { ...t, items: [t.items[0], koi, t.items[2]] }, koi };
    };

    it("detects unique variants", () => {
        const { t, koi } = uniqueStarred();
        expect(isVariantUnique(koi, "starred")).toBe(true);
        expect(isVariantUnique(koi, "normal")).toBe(false);
        expect(isVariantUnique({ ...koi, unique: true }, "normal")).toBe(true);
        expect(hasUniqueVariants(t, koi)).toBe(true);
        expect(hasUniqueVariants(t, t.items[0])).toBe(false);
    });

    it("toggles obtained without touching counts", () => {
        let s = saveItemWith({ starred: { inventory: 3 } });
        s = setObtained(s, "starred", true);
        expect(isObtained(s, "starred")).toBe(true);
        expect(s.counts.starred.inventory).toBe(3);
        s = setObtained(s, "starred", false);
        expect(isObtained(s, "starred")).toBe(false);
        expect(s.obtained).toBeUndefined();
    });

    it("counts a unique variant as owned 1 when obtained, target 1, and ignores stored counts", () => {
        const { t, koi } = uniqueStarred();
        const s = saveItemWith({ starred: { inventory: 5, target: 4 }, normal: { inventory: 2, target: 3 } });
        expect(getCounterValue(t, s, "starred", "total", koi)).toBe(0);
        expect(getCounterValue(t, s, "starred", "target", koi)).toBe(1);
        expect(getCounterValue(t, s, "starred", "inventory", koi)).toBe(0);
        expect(getMissing(t, koi, s)).toBe(1 + 1);
        const obtained = setObtained(s, "starred", true);
        expect(getItemCounterTotal(t, koi, obtained, "total")).toBe(2 + 1);
        expect(getMissing(t, koi, obtained)).toBe(1);
    });
});

describe("counters that require another counter", () => {
    /** A recipe-like template: To craft counts and can be changed only after Acquired is ticked. */
    const recipeTemplate = () => {
        const t = createTemplate("Recipes", "Game");
        t.counterDefs = [
            { key: "acquired", label: "Acquired", kind: "manual", max: 1, order: 0 },
            { key: "to-craft", label: "To craft", kind: "manual", requires: "acquired", order: 1 },
            { key: "total", label: "Total", kind: "computed", sumOf: ["to-craft"], order: 2 },
        ];
        t.categories = [{ id: "tints", name: "Tints", order: 0 }];
        t.items = [{ id: "slate", categoryId: "tints", name: "Slate", description: "", attributes: {}, tags: [] }];
        return t;
    };

    it("is 0 and locked until the required counter is above 0", () => {
        const t = recipeTemplate();
        const item = t.items[0];
        const [acquired, toCraft] = t.counterDefs;
        let s = emptySaveItem();
        expect(isRequirementUnmet(t, toCraft, s, noVariantKey, item)).toBe(true);
        expect(isRequirementUnmet(t, acquired, s, noVariantKey, item)).toBe(false);
        expect(setCounterValue(t, s, noVariantKey, "to-craft", 3, item)).toBe(s);
        s = setCounterValue(t, s, noVariantKey, "acquired", 1, item);
        expect(isRequirementUnmet(t, toCraft, s, noVariantKey, item)).toBe(false);
        s = setCounterValue(t, s, noVariantKey, "to-craft", 3, item);
        expect(getCounterValue(t, s, noVariantKey, "to-craft", item)).toBe(3);
        expect(getCounterValue(t, s, noVariantKey, "total", item)).toBe(3);
        // Unticking keeps the stored amount but it no longer counts.
        s = setCounterValue(t, s, noVariantKey, "acquired", 0, item);
        expect(s.counts[noVariantKey]["to-craft"]).toBe(3);
        expect(getCounterValue(t, s, noVariantKey, "to-craft", item)).toBe(0);
        expect(getCounterValue(t, s, noVariantKey, "total", item)).toBe(0);
    });
});
