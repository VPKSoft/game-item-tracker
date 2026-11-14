import { describe, expect, it } from "vitest";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { setCounterValue } from "./Counters.ts";
import { createSave } from "./CreateSave.ts";
import { getEffectiveTags, setEffectiveTags } from "./EffectiveTags.ts";
import { bumpVersion, compareVersions, slugify, uniqueId } from "./Ids.ts";
import { fishTemplate } from "./TestFixtures.ts";
import { getRemovedItemIds, removeSaveItems, upgradeSave } from "./UpgradeSave.ts";

describe("createSave", () => {
    it("creates an entry for every non-deprecated item with defaults per applicable variant", () => {
        const t = fishTemplate();
        t.items.push({ ...t.items[1], id: "gone", deprecated: true });
        const save = createSave(t, "Mine");
        expect(Object.keys(save.items).sort()).toEqual(["bass", "eel", "koi"]);
        expect(save.items.bass.counts).toEqual({ normal: { target: 1 }, starred: { target: 1 } });
        expect(save.template).toEqual({ templateId: t.templateId, version: "1.0.0", name: "Fish", game: "Test Game" });
    });
});

describe("effective tags", () => {
    it("combines template tags, removals and custom tags", () => {
        const item = fishTemplate().items[1];
        const s = setEffectiveTags(item, createSave(fishTemplate(), "s").items.koi, ["worm", "favourite", " "]);
        expect(s.removedTags).toEqual(["river"]);
        expect(s.customTags).toEqual(["favourite"]);
        expect(getEffectiveTags(item, s)).toEqual(["worm", "favourite"]);
    });

    it("shows tags added to the template later, but keeps removed ones removed", () => {
        const item = fishTemplate().items[1];
        const s = setEffectiveTags(item, createSave(fishTemplate(), "s").items.koi, ["worm"]);
        const updated = { ...item, tags: [...item.tags, "night"] };
        expect(getEffectiveTags(updated, s)).toEqual(["worm", "night"]);
    });
});

describe("upgradeSave", () => {
    const v2 = (): Template => {
        const t = fishTemplate();
        return {
            ...t,
            version: "1.1.0",
            counterDefs: [
                ...t.counterDefs.filter(c => c.key !== "tradeable"),
                { key: "gift", label: "Gift", kind: "manual", order: 5 },
            ],
            items: [
                ...t.items.filter(i => i.id !== "koi").map(i => (i.id === "eel" ? { ...i, deprecated: true } : i)),
                {
                    id: "ray",
                    categoryId: "coast",
                    name: "Ray",
                    description: "",
                    attributes: { rarity: 2 },
                    tags: [],
                    defaults: { target: 2 },
                },
            ],
        };
    };

    it("adds new items, keeps obsolete user data and reports changes", () => {
        const v1 = fishTemplate();
        let save = createSave(v1, "s");
        save.items.koi = { ...setCounterValue(v1, save.items.koi, "normal", "inventory", 2), notes: "keep me" };
        save.items.bass = setCounterValue(v1, save.items.bass, "normal", "tradeable", 5);

        const { save: upgraded, summary } = upgradeSave(save, v1, v2());
        save = upgraded;
        expect(save.template.version).toBe("1.1.0");
        expect(summary.addedItems).toEqual(["ray"]);
        expect(summary.removedItems).toEqual(["koi"]);
        expect(summary.deprecatedItems).toEqual([]);
        expect(summary.addedCounters).toEqual(["gift"]);
        expect(summary.removedCounters).toEqual(["tradeable"]);
        expect(save.items.ray.counts.normal.target).toBe(2);
        expect(save.items.koi.notes).toBe("keep me");
        expect(save.items.koi.orphan).toEqual({ name: "Ancient Koi", removedIn: "1.1.0" });
        // The deprecated eel had no user data, so it is dropped.
        expect(save.items.eel).toBeUndefined();
        // Hidden values of removed counters are kept by default...
        expect(save.items.bass.counts.normal.tradeable).toBe(5);
    });

    it("keeps deleted items without user data, marked as removed", () => {
        const v1 = fishTemplate();
        const save = createSave(v1, "s");
        const { save: upgraded, summary } = upgradeSave(save, v1, v2());
        expect(summary.removedItems).toEqual(["koi"]);
        expect(upgraded.items.koi.orphan).toEqual({ name: "Ancient Koi", removedIn: "1.1.0" });
        expect(getRemovedItemIds(upgraded)).toEqual(["koi"]);
    });

    it("keeps the removal version over later upgrades and clears it when the item returns", () => {
        const v1 = fishTemplate();
        const { save: onV2 } = upgradeSave(createSave(v1, "s"), v1, v2());
        const v3 = { ...v2(), version: "1.2.0" };
        const { save: onV3, summary } = upgradeSave(onV2, v2(), v3);
        expect(summary.removedItems).toEqual([]);
        expect(onV3.items.koi.orphan).toEqual({ name: "Ancient Koi", removedIn: "1.1.0" });

        const v4 = { ...v1, version: "2.0.0" };
        const { save: onV4 } = upgradeSave(onV3, v3, v4);
        expect(onV4.items.koi.orphan).toBeUndefined();
        expect("orphan" in onV4.items.koi).toBe(false);
    });

    it("counts the items whose values a removed counter or variant hides", () => {
        const v1 = fishTemplate();
        const save = createSave(v1, "s");
        save.items.bass = setCounterValue(v1, save.items.bass, "normal", "tradeable", 5);
        save.items.bass = setCounterValue(v1, save.items.bass, "starred", "inventory", 1);
        // Items already marked as removed are not counted.
        save.items.koi = { ...setCounterValue(v1, save.items.koi, "normal", "tradeable", 1), orphan: { name: "Koi" } };
        const v2NoStars = { ...v2(), variantDefs: v1.variantDefs.filter(v => v.key !== "starred") };
        const { summary } = upgradeSave(save, v1, v2NoStars);
        expect(summary.removedCounterData).toEqual({ tradeable: 1 });
        expect(summary.removedVariantData).toEqual({ starred: 1 });
    });

    it("never discards the data of removed items", () => {
        const v1 = fishTemplate();
        const save = createSave(v1, "s");
        save.items.koi = setCounterValue(v1, save.items.koi, "normal", "tradeable", 3);
        const { save: upgraded } = upgradeSave(save, v1, v2(), { discardHidden: true });
        expect(upgraded.items.koi.counts.normal.tradeable).toBe(3);
    });

    it("removes chosen items from a save", () => {
        const v1 = fishTemplate();
        const { save } = upgradeSave(createSave(v1, "s"), v1, v2());
        const removed = removeSaveItems(save, getRemovedItemIds(save));
        expect(removed.items.koi).toBeUndefined();
        expect(removed.items.bass).toBeDefined();
        expect(getRemovedItemIds(removed)).toEqual([]);
    });

    it("discards hidden values only when asked", () => {
        const v1 = fishTemplate();
        const save = createSave(v1, "s");
        save.items.bass = setCounterValue(v1, save.items.bass, "normal", "tradeable", 5);
        const { save: upgraded } = upgradeSave(save, v1, v2(), { discardHidden: true });
        expect(upgraded.items.bass.counts.normal.tradeable).toBeUndefined();
        expect(upgraded.items.bass.counts.normal.target).toBe(1);
    });

    it("rejects a template with a different id", () => {
        const save = createSave(fishTemplate(), "s");
        expect(() => upgradeSave(save, undefined, { ...v2(), templateId: "other" })).toThrow();
    });
});

describe("ids and versions", () => {
    it("slugifies names", () => {
        expect(slugify("Bahari Bass")).toBe("bahari-bass");
        expect(slugify("Li'l Beetle")).toBe("lil-beetle");
        expect(slugify("Zeki’s Wondrous Machine")).toBe("zekis-wondrous-machine");
        expect(slugify("Café ★")).toBe("cafe");
        expect(slugify("★")).toBe("item");
    });

    it("creates unique ids", () => {
        expect(uniqueId("Bass", ["bass", "bass-2"])).toBe("bass-3");
    });

    it("bumps and compares versions", () => {
        expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
        expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
        expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
        expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
        expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    });
});
