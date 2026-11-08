import { describe, expect, it } from "vitest";
import type { SaveItem } from "../Schemas/SaveSchema.ts";
import {
    clampCounter,
    emptySaveItem,
    getCounterValue,
    getItemCounterTotal,
    getItemVariants,
    getMissing,
    getVariantCounters,
    noVariantKey,
    setCounterValue,
} from "./Counters.ts";
import { createTemplate } from "./CreateSave.ts";
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
