import { describe, expect, it } from "vitest";
import type { Template } from "../Schemas/TemplateSchema.ts";
import { setCounterValue } from "./Counters.ts";
import { createSave } from "./CreateSave.ts";
import { getEffectiveTags, setEffectiveTags } from "./EffectiveTags.ts";
import { bumpVersion, compareVersions, slugify, uniqueId } from "./Ids.ts";
import { fishTemplate } from "./TestFixtures.ts";
import { upgradeSave } from "./UpgradeSave.ts";

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
        expect(summary.obsoleteItems).toEqual(["koi"]);
        expect(summary.addedCounters).toEqual(["gift"]);
        expect(summary.removedCounters).toEqual(["tradeable"]);
        expect(save.items.ray.counts.normal.target).toBe(2);
        expect(save.items.koi.notes).toBe("keep me");
        expect(save.items.koi.orphan).toEqual({ name: "Ancient Koi" });
        // The deprecated eel had no user data, so it is dropped.
        expect(save.items.eel).toBeUndefined();
        // Hidden values of removed counters are kept by default...
        expect(save.items.bass.counts.normal.tradeable).toBe(5);
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
